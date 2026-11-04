import json  # converts between Python data and JSON text
import os  # reads settings like TABLE_NAME
import uuid  # random unique IDs for new items
from decimal import Decimal  # DynamoDB stores numbers as Decimal

import boto3  # AWS library for Python

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

# The only categories Barback accepts. The AI Cocktail Lab (Build 6) uses these.
CATEGORIES = [
    "Vodka", "Gin", "Tequila", "Mezcal", "Rum", "Whiskey", "Brandy",
    "Liqueur", "Amaro & Aperitivo", "Vermouth & Wine", "Beer", "Syrup & Mixer", "Other",
]


def caller(event):  # who is calling: their bar and their groups, from the token
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    groups = claims.get("cognito:groups", "").strip("[]").split()
    return claims["custom:barId"], groups


def resp(code, body):  # package every reply the same way
    return {"statusCode": code, "body": json.dumps(body, default=str)}


def tag_par(item):  # below par? add the reorder tag; otherwise remove it
    if item["on_hand"] < item["par"]:
        item["GSI1PK"] = f"{item['PK']}#BELOW_PAR"
        item["GSI1SK"] = item["SK"]
    else:
        item.pop("GSI1PK", None)
        item.pop("GSI1SK", None)
    return item


def handler(event, context):
    bar, groups = caller(event)
    route = event["routeKey"]
    pk = f"BAR#{bar}"  # the bar comes from the token, never from the request

    if route == "GET /items":
        r = table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={":pk": pk, ":sk": "ITEM#"},
        )
        return resp(200, r["Items"])

    if route == "POST /items":
        if "owner" not in groups:
            return resp(403, {"error": "owner only"})
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        if not body.get("name") or "on_hand" not in body or "par" not in body:
            return resp(400, {"error": "name, on_hand and par are required"})
        category = body.get("category", "Other")
        if category not in CATEGORIES:
            return resp(400, {"error": f"category must be one of: {', '.join(CATEGORIES)}"})
        item = {
            "name": body["name"],
            "category": category,
            "unit": body.get("unit", "btl"),
            "on_hand": Decimal(str(body["on_hand"])),
            "par": Decimal(str(body["par"])),
            "PK": pk,
            "SK": f"ITEM#{uuid.uuid4()}",
        }
        table.put_item(Item=tag_par(item))
        return resp(201, item)

    if route == "PUT /items/{id}":
        sk = f"ITEM#{event['pathParameters']['id']}"
        found = table.get_item(Key={"PK": pk, "SK": sk}).get("Item")
        if not found:
            return resp(404, {"error": "item not found"})
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        if "owner" in groups:
            allowed = ["on_hand", "par", "name", "category", "unit"]
        else:
            allowed = ["on_hand"]
            if any(key in body for key in ["par", "name", "category", "unit"]):
                return resp(403, {"error": "staff can only update on_hand"})
        if "category" in body and body["category"] not in CATEGORIES:
            return resp(400, {"error": f"category must be one of: {', '.join(CATEGORIES)}"})
        for key in allowed:
            if key in body:
                if key in ("on_hand", "par"):
                    found[key] = Decimal(str(body[key]))
                else:
                    found[key] = body[key]
        table.put_item(Item=tag_par(found))
        return resp(200, found)

    if route == "DELETE /items/{id}":
        if "owner" not in groups:
            return resp(403, {"error": "owner only"})
        sk = f"ITEM#{event['pathParameters']['id']}"
        old = table.delete_item(Key={"PK": pk, "SK": sk}, ReturnValues="ALL_OLD").get("Attributes")
        if not old:
            return resp(404, {"error": "item not found"})
        return resp(200, {"deleted": sk})

    return resp(404, {"error": "not found"})
