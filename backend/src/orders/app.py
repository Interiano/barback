import html
import json
import math
import os

import boto3

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
ses = boto3.client("sesv2")


def caller(event): #who is calling
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    groups = claims.get("cognito:groups", "").strip("[]").split()
    return claims["custom:barId"], groups


def resp(code, body): #how to package the reply
    return {"statusCode": code, "body": json.dumps(body)}


def below_par(bar): #reads the gsi1 reorder list for this bar only
    items = []
    kwargs = {
        "IndexName": "GSI1",
        "KeyConditionExpression": "GSI1PK = :pk",
        "ExpressionAttributeValues": {":pk": f"BAR#{bar}#BELOW_PAR"},
    }
    while True:
        r = table.query(**kwargs)
        items.extend(r["Items"])
        if "LastEvaluatedKey" not in r:
            return items
        kwargs["ExclusiveStartKey"] = r["LastEvaluatedKey"]


def order_lines(items): #amount to order = par minus on hand, rounded up
    lines = []
    for item in items:
        qty = math.ceil(item["par"] - item["on_hand"])
        if qty > 0:
            lines.append({"name": item["name"], "unit": item.get("unit", "btl"), "qty": qty})
    return sorted(lines, key=lambda line: line["name"])


def build_email(bar, lines): #build the order sheet. html.escape keeps product names from breaking it
    total = sum(line["qty"] for line in lines)
    rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #E4E2DA'>{html.escape(line['name'])}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E4E2DA;text-align:right'>{line['qty']} {html.escape(line['unit'])}</td></tr>"
        for line in lines
    )
    html_body = (
        "<div style='font-family:Arial,sans-serif;color:#1B1D1A;max-width:560px'>"
        "<h2 style='color:#1E6B52'>Barback order sheet</h2>"
        f"<p>Bar: {html.escape(bar)}<br>{len(lines)} products, {total} bottles total.</p>"
        "<table style='border-collapse:collapse;width:100%'>"
        "<tr><th style='text-align:left;padding:8px'>Product</th><th style='text-align:right;padding:8px'>Order</th></tr>"
        f"{rows}</table>"
        "<p style='color:#5E625C;font-size:13px'>Sent from Barback.</p></div>"
    )
    text_body = "Barback order sheet\n" + "\n".join(
        f"- {line['name']}: {line['qty']} {line['unit']}" for line in lines
    )
    return html_body, text_body, total


def handler(event, context): #owner only, then build the sheet, then one email.
    bar, groups = caller(event)
    if "owner" not in groups:
        return resp(403, {"error": "owner only"})

    lines = order_lines(below_par(bar))
    if not lines:
        return resp(200, {"sent": False, "message": "Everything is at par. No order needed."})

    html_body, text_body, total = build_email(bar, lines)
    ses.send_email(
        FromEmailAddress=os.environ["FROM_EMAIL"],
        Destination={"ToAddresses": [os.environ["TO_EMAIL"]]},
        Content={
            "Simple": {
                "Subject": {"Data": f"Barback order: {len(lines)} products, {total} bottles"},
                "Body": {"Html": {"Data": html_body}, "Text": {"Data": text_body}},
            }
        },
    )
    return resp(200, {"sent": True, "products": len(lines), "bottles": total})