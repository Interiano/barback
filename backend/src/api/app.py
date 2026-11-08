import json  # converts between Python data and JSON text
import re  # checks the characters in custom category names
import os  # reads settings like TABLE_NAME
import uuid  # random unique IDs for new items
from decimal import Decimal  # DynamoDB stores numbers as Decimal

import boto3  # AWS library for Python

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

# Built-in categories. Each bar can add its own on top (stored in one CATEGORIES row).
# The AI Cocktail Lab (Build 6) uses these to pick spirits by type.
CATEGORIES = [
    "Vodka", "Gin", "Tequila", "Mezcal", "Rum", "Whiskey", "Brandy",
    "Liqueur", "Amaro & Aperitivo", "Vermouth & Wine", "Beer", "Syrup & Mixer", "Other",
]
MAX_CUSTOM = 50

# House basics (pantry): common ingredients the bar keeps that aren't tracked as inventory.
# Owners switch these on or off and can add their own. The AI only uses what's switched on.
PANTRY_DEFAULT_ON = [
    "Lemon", "Lime", "Orange", "Grapefruit", "Simple syrup", "Sugar",
    "Soda water", "Tonic", "Angostura bitters", "Egg white", "Salt",
]
PANTRY_EXTRAS = [
    "Mint", "Basil", "Cucumber", "Honey syrup", "Demerara syrup", "Ginger syrup",
    "Ginger beer", "Cream", "Peychaud's bitters", "Orgeat", "Grenadine",
]
PANTRY_OPTIONS = PANTRY_DEFAULT_ON + PANTRY_EXTRAS
CATEGORY_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 &'\-/]{0,29}$")


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


def custom_categories(pk):  # this bar's own categories, if any
    found = table.get_item(Key={"PK": pk, "SK": "CATEGORIES"}).get("Item")
    return found["names"] if found else []


def valid_category(pk, category):  # built-in or one this bar created
    return category in CATEGORIES or category in custom_categories(pk)


def pantry(pk):  # this bar's house basics, or the defaults if never saved
    found = table.get_item(Key={"PK": pk, "SK": "PANTRY"}).get("Item")
    enabled = found["enabled"] if found else PANTRY_DEFAULT_ON
    custom = found["custom"] if found else []
    return {"options": PANTRY_OPTIONS, "enabled": enabled, "custom": custom}


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

    if route == "GET /categories":
        return resp(200, {"builtIn": CATEGORIES, "custom": custom_categories(pk)})

    if route == "POST /categories":
        if "owner" not in groups:
            return resp(403, {"error": "owner only"})
        body = json.loads(event.get("body") or "{}")
        if not isinstance(body, dict):
            return resp(400, {"error": "body must be a JSON object"})
        name = str(body.get("name", "")).strip()
        if not CATEGORY_NAME.match(name):
            return resp(400, {"error": "category name: 1-30 letters, numbers, spaces, & ' - /"})
        custom = custom_categories(pk)
        existing = [c.lower() for c in CATEGORIES + custom]
        if name.lower() in existing:
            return resp(409, {"error": "that category already exists"})
        if len(custom) >= MAX_CUSTOM:
            return resp(400, {"error": f"limit is {MAX_CUSTOM} custom categories"})
        custom = custom + [name]
        table.put_item(Item={"PK": pk, "SK": "CATEGORIES", "names": custom})
        return resp(201, {"builtIn": CATEGORIES, "custom": custom})

    if route == "GET /pantry":
        return resp(200, pantry(pk))

    if route == "PUT /pantry":
        if "owner" not in groups:
            return resp(403, {"error": "owner only"})
        body = json.loads(event.get("body") or "{}")
        if not isinstance(body, dict):
            return resp(400, {"error": "body must be a JSON object"})
        enabled, custom = body.get("enabled"), body.get("custom", [])
        if not isinstance(enabled, list) or any(e not in PANTRY_OPTIONS for e in enabled):
            return resp(400, {"error": "enabled must list items from the options"})
        if not isinstance(custom, list) or len(custom) > MAX_CUSTOM:
            return resp(400, {"error": f"custom must be a list of up to {MAX_CUSTOM} items"})
        cleaned, seen = [], {o.lower() for o in PANTRY_OPTIONS}
        for name in custom:
            name = str(name).strip()
            if not CATEGORY_NAME.match(name):
                return resp(400, {"error": "item name: 1-30 letters, numbers, spaces, & ' - /"})
            if name.lower() in seen:
                return resp(409, {"error": f"{name} is already on the list"})
            seen.add(name.lower())
            cleaned.append(name)
        enabled = [o for o in PANTRY_OPTIONS if o in enabled]  # keep the standard order, no repeats
        table.put_item(Item={"PK": pk, "SK": "PANTRY", "enabled": enabled, "custom": cleaned})
        return resp(200, pantry(pk))

    if route == "POST /items":
        if "owner" not in groups:
            return resp(403, {"error": "owner only"})
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        if not body.get("name") or "on_hand" not in body or "par" not in body:
            return resp(400, {"error": "name, on_hand and par are required"})
        category = body.get("category")
        if not category:
            return resp(400, {"error": "category is required"})
        if not valid_category(pk, category):
            return resp(400, {"error": "unknown category; create it first"})
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
        if "category" in body and not valid_category(pk, body["category"]):
            return resp(400, {"error": "unknown category; create it first"})
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
