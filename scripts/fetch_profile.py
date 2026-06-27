#!/usr/bin/env python3
"""
Fetch a Telegram profile via the Bot API and write it into the site.

Outputs:
  - profile.json        { name, username, emoji_status, updated_at }
  - assets/avatar.png   the user's current profile photo (largest size)

Environment:
  TG_BOT_TOKEN   (GitHub Actions *secret*)  - bot token from @BotFather
  TG_USER_ID     (GitHub Actions *variable*) - numeric id of the target user

What the Bot API CAN give us: first/last name, @username, the custom emoji
status (resolved to its base unicode emoji), and the profile photo.
What it CANNOT give us: online / "last seen" status (Telegram privacy - only a
userbot on the account itself could see that, which we deliberately do not do).
So "last seen" stays a manual, user-edited line in script.js CONFIG.

Pure standard library (urllib) - no pip install needed.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.telegram.org"
TIMEOUT = 30


def api_call(token, method, params=None):
    url = f"{API}/bot{token}/{method}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not data.get("ok"):
        raise RuntimeError(f"{method} failed: {data.get('description')}")
    return data["result"]


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        body = r.read()
    with open(dest, "wb") as f:
        f.write(body)


def resolve_emoji_status(token, chat):
    """Turn a custom_emoji_id status into its base unicode emoji, if any."""
    cid = chat.get("emoji_status_custom_emoji_id")
    if not cid:
        return ""
    try:
        stickers = api_call(token, "getCustomEmojiStickers",
                            {"custom_emoji_ids": json.dumps([cid])})
        if stickers and stickers[0].get("emoji"):
            return stickers[0]["emoji"]
    except Exception as e:  # noqa: BLE001
        print(f"[warn] could not resolve emoji status: {e}", file=sys.stderr)
    return ""


def fetch_avatar(token, user_id):
    """Download the largest current profile photo to assets/avatar.png."""
    try:
        photos = api_call(token, "getUserProfilePhotos",
                          {"user_id": user_id, "limit": 1})
        if not photos.get("photos"):
            print("[info] user has no profile photos", file=sys.stderr)
            return
        sizes = photos["photos"][0]           # list of sizes, ascending
        file_id = sizes[-1]["file_id"]        # largest
        file_info = api_call(token, "getFile", {"file_id": file_id})
        file_path = file_info["file_path"]
        download(f"{API}/file/bot{token}/{file_path}", "assets/avatar.png")
        print("[ok] avatar -> assets/avatar.png")
    except Exception as e:  # noqa: BLE001
        print(f"[warn] avatar fetch failed: {e}", file=sys.stderr)


def main():
    token = os.environ.get("TG_BOT_TOKEN", "").strip()
    user_id = os.environ.get("TG_USER_ID", "").strip()
    if not token or not user_id:
        print("ERROR: set TG_BOT_TOKEN (secret) and TG_USER_ID (variable).",
              file=sys.stderr)
        sys.exit(1)

    # getChat works once the user has messaged the bot at least once.
    chat = api_call(token, "getChat", {"chat_id": user_id})

    name = (chat.get("first_name", "") + " " + chat.get("last_name", "")).strip()
    username = chat.get("username", "")
    emoji_status = resolve_emoji_status(token, chat)

    fetch_avatar(token, user_id)

    profile = {
        "name": name or username or "user",
        "username": username,
        "emoji_status": emoji_status,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open("profile.json", "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    print("[ok] wrote profile.json:", json.dumps(profile, ensure_ascii=False))


if __name__ == "__main__":
    main()
