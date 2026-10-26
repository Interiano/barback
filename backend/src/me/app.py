import json


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return {"statusCode": 200, "body": json.dumps(claims)}