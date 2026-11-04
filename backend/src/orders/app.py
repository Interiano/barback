import html
import json
import math
import os

import boto3

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
ses = boto3.client("sesv2")

MAX_LINES = 100
MAX_QTY = 999
UNITS = ("btl", "case")


def caller(event):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    groups = claims.get("cognito:groups", "").strip("[]").split()
    return claims["custom:barId"], groups


def resp(code, body):
    return {"statusCode": code, "body": json.dumps(body)}


def below_par(bar):
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


def order_lines(items):
    lines = []
    for item in items:
        qty = math.ceil(item["par"] - item["on_hand"])
        if qty > 0:
            lines.append({"name": item["name"], "unit": item.get("unit", "btl"), "qty": qty})
    return sorted(lines, key=lambda line: line["name"])


def custom_lines(raw):
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_LINES:
        raise ValueError(f"lines must be a list of 1 to {MAX_LINES} items")
    lines = []
    for line in raw:
        if not isinstance(line, dict):
            raise ValueError("each line must be an object")
        name = str(line.get("name", "")).strip()
        unit = line.get("unit", "btl")
        qty = line.get("qty")
        if not name or len(name) > 100:
            raise ValueError("each line needs a name (1-100 characters)")
        if unit not in UNITS:
            raise ValueError("unit must be btl or case")
        if not isinstance(qty, int) or isinstance(qty, bool) or not 1 <= qty <= MAX_QTY:
            raise ValueError(f"qty must be a whole number from 1 to {MAX_QTY}")
        lines.append({"name": name, "unit": unit, "qty": qty})
    return lines


def plural(n, word):
    return f"{n} {word}" + ("" if n == 1 else "s")


def summary(lines):
    cases = sum(line["qty"] for line in lines if line["unit"] == "case")
    bottles = sum(line["qty"] for line in lines if line["unit"] != "case")
    parts = [plural(len(lines), "product")]
    if bottles:
        parts.append(plural(bottles, "bottle"))
    if cases:
        parts.append(plural(cases, "case"))
    return ", ".join(parts)


def build_email(bar, lines, totals):
    rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #E4E2DA'>{html.escape(line['name'])}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E4E2DA;text-align:right'>{line['qty']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #E4E2DA'>{html.escape(line['unit'])}</td></tr>"
        for line in lines
    )
    html_body = (
        "<div style='font-family:Arial,sans-serif;color:#1B1D1A;max-width:560px'>"
        "<h2 style='color:#1E6B52'>Barback order sheet</h2>"
        f"<p>Bar: {html.escape(bar)}<br>{totals}.</p>"
        "<table style='border-collapse:collapse;width:100%;border:1px solid #E4E2DA'>"
        "<tr style='background:#F5F4EF'><th style='text-align:left;padding:8px'>Product</th>"
        "<th style='text-align:right;padding:8px'>Qty</th><th style='text-align:left;padding:8px'>Unit</th></tr>"
        f"{rows}</table>"
        "<p style='color:#5E625C;font-size:13px'>Sent from Barback.</p></div>"
    )
    text_body = "Barback order sheet\n" + "\n".join(
        f"- {line['name']}: {line['qty']} {line['unit']}" for line in lines
    )
    return html_body, text_body


def handler(event, context):
    bar, groups = caller(event)
    if "owner" not in groups:
        return resp(403, {"error": "owner only"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return resp(400, {"error": "body must be JSON"})
    if not isinstance(body, dict):
        return resp(400, {"error": "body must be a JSON object"})

    if "lines" in body:
        try:
            lines = custom_lines(body["lines"])
        except ValueError as e:
            return resp(400, {"error": str(e)})
    else:
        lines = order_lines(below_par(bar))

    if not lines:
        return resp(200, {"sent": False, "message": "Everything is at par. No order needed."})

    totals = summary(lines)
    html_body, text_body = build_email(bar, lines, totals)
    ses.send_email(
        FromEmailAddress=os.environ["FROM_EMAIL"],
        Destination={"ToAddresses": [os.environ["TO_EMAIL"]]},
        Content={
            "Simple": {
                "Subject": {"Data": f"Barback order: {totals}"},
                "Body": {"Html": {"Data": html_body}, "Text": {"Data": text_body}},
            }
        },
    )
    return resp(200, {"sent": True, "summary": totals})
