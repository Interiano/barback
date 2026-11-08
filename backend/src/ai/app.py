import json  # converts between Python data and JSON text
import os  # reads settings like TABLE_NAME and MODEL_ID
import re  # whole-word matching for ingredient names
from pathlib import Path  # finds prompt.md next to this file

import boto3  # AWS library for Python
from botocore.exceptions import ClientError  # the error type AWS calls raise

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
bedrock = boto3.client("bedrock-runtime")  # the service that runs AI models
MODEL_ID = os.environ["MODEL_ID"]

# The bartender's personality, loaded once when the Lambda starts.
SYSTEM_PROMPT = (Path(__file__).parent / "prompt.md").read_text(encoding="utf-8")

MAX_MESSAGES = 12  # caps the conversation length (and the cost)
MAX_GUEST_CHARS = 500
MAX_BARTENDER_CHARS = 3000
MAX_SHELF_ITEMS = 200

# House basics: the bar's pantry (set by the owner on the Settings page).
# Keep PANTRY_DEFAULT_ON in sync with backend/src/api/app.py.
PANTRY_DEFAULT_ON = [
    "Lemon", "Lime", "Orange", "Grapefruit", "Simple syrup", "Sugar",
    "Soda water", "Tonic", "Angostura bitters", "Egg white", "Salt",
]
ALWAYS = ["Ice", "Water"]  # always available, not shown as toggles
CITRUS = ["lemon", "lime", "orange", "grapefruit"]
CITRUS_FORMS = ["juice", "peel", "twist", "wheel", "wedge", "zest"]  # fresh fruit, not liqueurs

# The fixed shape of a recommendation. The model fills this in when it's ready.
RECOMMEND_TOOL = {
    "toolSpec": {
        "name": "recommend_cocktail",
        "description": "Recommend one cocktail to the guest, built from the current shelf plus house basics.",
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "tagline": {"type": "string", "description": "One short, inviting line."},
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "item": {"type": "string"},
                                "amount": {"type": "string", "description": "e.g. 2 oz, 3 dashes"},
                            },
                            "required": ["item", "amount"],
                        },
                    },
                    "method": {"type": "string"},
                    "glass": {"type": "string"},
                    "garnish": {"type": "string"},
                    "pairing": {"type": "string", "description": "Food pairing note, if the guest is dining."},
                    "why": {"type": "string", "description": "One or two sentences on why it suits this guest."},
                },
                "required": ["name", "tagline", "ingredients", "method", "glass", "garnish", "why"],
            }
        },
    }
}


def caller(event):  # the bar comes from the verified token, never the request
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    return claims["custom:barId"]


def resp(code, body):
    return {"statusCode": code, "body": json.dumps(body)}


def validate(raw):
    """Check the conversation the page sent. Returns it in Bedrock's format."""
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_MESSAGES:
        raise ValueError(f"messages must be a list of 1 to {MAX_MESSAGES}")
    messages = []
    for i, m in enumerate(raw):
        expected = "user" if i % 2 == 0 else "assistant"  # guest, bartender, guest, ...
        if not isinstance(m, dict) or m.get("role") != expected:
            raise ValueError("messages must alternate guest, bartender, guest")
        text = m.get("text")
        limit = MAX_GUEST_CHARS if expected == "user" else MAX_BARTENDER_CHARS
        if not isinstance(text, str) or not text.strip() or len(text) > limit:
            raise ValueError(f"each message needs text (1-{limit} characters)")
        messages.append({"role": expected, "content": [{"text": text.strip()}]})
    if messages[-1]["role"] != "user":
        raise ValueError("the last message must be from the guest")
    return messages


def basics_for(bar):
    """The house basics switched on for this bar, plus ice and water."""
    found = table.get_item(Key={"PK": f"BAR#{bar}", "SK": "PANTRY"}).get("Item")
    enabled = found["enabled"] + found.get("custom", []) if found else PANTRY_DEFAULT_ON
    return ALWAYS + list(enabled)


def shelf_text(bar):
    """The bar's real inventory, read from DynamoDB, written as plain lines for the model."""
    r = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={":pk": f"BAR#{bar}", ":sk": "ITEM#"},
    )
    items = sorted(r["Items"], key=lambda i: i["name"])[:MAX_SHELF_ITEMS]
    basics = "House basics tonight: " + ", ".join(basics_for(bar))
    if not items:
        return "Current shelf: empty. Only house basics are available.\n" + basics
    lines = []
    for i in items:
        on_hand, par = i["on_hand"], i["par"]
        note = " (overstocked: good to feature)" if on_hand > par else (" (running low)" if on_hand < par else "")
        lines.append(f"- {i['name']} [{i.get('category', 'Other')}]{note}")
    return "Current shelf:\n" + "\n".join(lines) + "\n" + basics


def shelf_names(bar):
    r = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={":pk": f"BAR#{bar}", ":sk": "ITEM#"},
    )
    return [i["name"].lower() for i in r["Items"]]


def has_word(text, phrase):
    """True if phrase appears in text as whole words ('ice' is not in 'spiced')."""
    return bool(phrase) and re.search(r"\b" + re.escape(phrase) + r"\b", text) is not None


def basic_key(name):
    """'Soda water' -> 'soda', 'Angostura bitters' -> 'angostura': the word to look for."""
    key = name.lower()
    for generic in (" water", " bitters"):
        key = key.replace(generic, "")
    return key.strip()


def is_basic(item, basics):
    for b in basics:
        key = basic_key(b)
        if key in CITRUS:
            if has_word(item, key) and any(has_word(item, f) for f in CITRUS_FORMS):  # fresh fruit only
                return True
        elif has_word(item, key):
            return True
    return False


def missing_ingredients(drink, shelf, basics):
    """Ingredients that are neither on the shelf nor a house basic that's switched on."""
    missing = []
    for ing in drink.get("ingredients", []):
        item = str(ing.get("item", "")).lower()
        on_shelf = any(has_word(item, name) or has_word(name, item) for name in shelf)
        if not (on_shelf or is_basic(item, basics)):
            missing.append(ing.get("item", ""))
    return missing


def ask_model(system, messages):
    return bedrock.converse(
        modelId=MODEL_ID,
        system=system,
        messages=messages,
        toolConfig={"tools": [RECOMMEND_TOOL]},
        inferenceConfig={"maxTokens": 800, "temperature": 0.8},
    )


def read_reply(r):
    content = r["output"]["message"]["content"]
    text = " ".join(c["text"] for c in content if "text" in c).strip()
    tool = next((c["toolUse"] for c in content if "toolUse" in c), None)
    return content, text, tool


def handler(event, context):
    bar = caller(event)  # owners and staff can both use the Lab

    try:
        body = json.loads(event.get("body") or "{}")
        messages = validate(body.get("messages") if isinstance(body, dict) else None)
    except (json.JSONDecodeError, ValueError) as e:
        return resp(400, {"error": str(e)})

    system = [{"text": SYSTEM_PROMPT}, {"text": shelf_text(bar)}]
    shelf = shelf_names(bar)
    basics = basics_for(bar)

    try:
        content, text, tool = read_reply(ask_model(system, messages))

        # The model proposed a drink: check it only uses what the bar really has.
        missing = missing_ingredients(tool["input"], shelf, basics) if tool else []
        if missing:
            # Tell the model which bottles aren't available and let it fix the drink once.
            messages = messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": [{"toolResult": {
                    "toolUseId": tool["toolUseId"],
                    "status": "error",
                    "content": [{"text": "Not on the shelf: " + ", ".join(missing)
                                 + ". Recommend again using only the shelf and house basics."}],
                }}]},
            ]
            first_text = text  # keep the guest-facing words from the first answer
            content, text, tool = read_reply(ask_model(system, messages))
            if tool:
                text = first_text  # the guest never saw the rejected drink, so no apology needed
            if tool and missing_ingredients(tool["input"], shelf, basics):
                tool = None
                text = "My apologies, I couldn't build that properly from tonight's shelf. Shall I suggest something different?"
    except ClientError as e:
        code = e.response["Error"]["Code"]
        print(f"Bedrock error: {code}: {e}")  # full detail goes to CloudWatch only
        if code == "ThrottlingException":
            return resp(429, {"error": "The bar is busy. Try again in a moment."})
        return resp(502, {"error": "The bartender is unavailable right now."})

    if tool:
        return resp(200, {"type": "recommendation", "text": text, "drink": tool["input"]})
    return resp(200, {"type": "message", "text": text or "Pardon me, could you say that once more?"})
