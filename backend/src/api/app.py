import json #converts between python data and json text, the format the api speaks
import os #lets the code read settings
import uuid #random unique IDs
from decimal import Decimal #stores as Decimal, not regular floats

import boto3 #aws library for python

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"]) #connects to table from !Ref BarbackTable


def caller(event): #event is incoming request
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"] #digs into the request to the token's contents
    groups = claims.get("cognito:groups", "").strip("[]").split() #get users groups, if none then empty
    return claims["custom:barId"], groups  #hands back two things "bar-001" and ["owner"]


def resp(code, body): #package every reply the same way
    return {"statusCode": code, "body": json.dumps(body, default=str)}


def tag_par(item):
    if item["on_hand"] < item["par"]: #logic: is it below par?
        item["GSI1PK"] = f"{item['PK']}#BELOW_PAR" #add needs ordering tag: #BELOW_PAR
        item["GSI1SK"] = item["SK"] #plus which item it is (ITEM#gin)
    else: 
        item.pop("GSI1PK", None) #remove tag
        item.pop("GSI1SK", None)
    return item #hand back


def handler(event, context):
    bar, groups = caller(event) #read wristband: "bar-001" and ["owner"]
    route = event["routeKey"] #which route was called "GET /items"
    pk = f"BAR#{bar}" #bar gets added

    if route == "GET /items": #list items
        r = table.query( #not scan. query is fast
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)", #PK = BAR#bar-001 & SK starts with ITEM#
            ExpressionAttributeValues={":pk": pk, ":sk": "ITEM#"}, #:pk and :sk placeholders and filled in by ExpressionAttritubeValues
        )
        return resp(200, r["Items"]) #send back products with 200 ok

    if route == "POST /items":
        if "owner" not in groups: #if "owner" not in groups 
            return resp(403, {"error": "owner only"}) # error
        body = json.loads(event.get("body") or "{}", parse_float=Decimal) #read what the app sent, name: gin, on_hand: 2, par = 6
        if not body.get("name") or "on_hand" not in body or "par" not in body: # check if required field is missing, send 400 bad request
            return resp(400, {"error": "name, on_hand and par are required"})
        item = { #build product from fields we allow, anything extra is ignored
            "name": body["name"],
            "category": body.get("category", "Spirit"),
            "unit": body.get("unit", "btl"),
            "on_hand": Decimal(str(body["on_hand"])),
            "par": Decimal(str(body["par"])),
            "PK": pk, #set by the code, not the user
            "SK": f"ITEM#{uuid.uuid4()}", # random uniqueID starting with ITEM#____
        }
        table.put_item(Item=tag_par(item)) # adds the reorder tag if below par, put_item saves it to the table, 201 then created
        return resp(201, item) #201 is created

    if route == "PUT /items/{id}":
        sk = f"ITEM#{event['pathParameters']['id']}" #grabs {id} from url 
        found = table.get_item(Key={"PK": pk, "SK": sk}).get("Item") #get_item finds that product, only inside this user's bar (pk). Another bar's item comes back as not found
        if not found:
            return resp(404, {"error": "item not found"}) #not found send 404
        body = json.loads(event.get("body") or "{}", parse_float=Decimal)
        if "owner" in groups: #owner logic and staff logic
            allowed = ["on_hand", "par", "name", "category", "unit"]
        else:
            allowed = ["on_hand"]
        for key in allowed: 
            if key in body:
                if key in ("on_hand", "par"):
                    found[key] = Decimal(str(body[key]))
                else:
                    found[key] = body[key]
        table.put_item(Item=tag_par(found)) #rechecks par
        return resp(200, found)

    if route == "DELETE /items/{id}":
        if "owner" not in groups: #if not owner
            return resp(403, {"error": "owner only"}) #get 403 if not owner
        sk = f"ITEM#{event['pathParameters']['id']}" #which item from the url to get id
        old = table.delete_item( #deletem_item removes that product, only within this user's bar (pk)
            Key={"PK": pk, "SK": sk},
            ReturnValues="ALL_OLD", #"tell me what you deleted"
        ).get("Attributes")
        if not old:
            return resp(404, {"error": "item not found"}) #nothing deleted then send 404
        return resp(200, {"deleted": sk}) #deleted send 200 ok

    return resp(404, {"error": "not found"}) # any route not handled yet gets "not found"

