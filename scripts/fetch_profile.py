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

import glob
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.telegram.org"
TIMEOUT = 30

# Anchor every output path to the REPO ROOT (this file lives in <root>/scripts/),
# so the script writes to the same place no matter what CWD it is invoked from
# (a workflow `working-directory:`, a cron job, `cd scripts && python ...`, etc.).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def repo_path(*parts):
    """Absolute path inside the repo, independent of the process CWD."""
    return os.path.join(REPO_ROOT, *parts)


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
    """Download `url` to `dest`, then report exactly where it landed.

    The absolute path + byte size go to stderr BEFORE the workflow's `git add`
    runs, so a failing run's log shows whether the file was written, where, and
    whether it is non-empty.
    """
    dest = os.path.abspath(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        body = r.read()
    with open(dest, "wb") as f:
        f.write(body)

    size = os.path.getsize(dest)
    print(f"[write] {dest} ({size} bytes) [cwd={os.getcwd()}]", file=sys.stderr)
    if size == 0:
        print(f"[warn] {dest} is EMPTY - the API returned no bytes", file=sys.stderr)
    return size


def clear_status_files():
    """Remove any stale assets/status.* so a removed/changed status doesn't linger."""
    for f in glob.glob(repo_path("assets", "status.*")):
        try:
            os.remove(f)
            print(f"[clean] removed stale {f}", file=sys.stderr)
        except OSError as e:
            print(f"[warn] could not remove {f}: {e}", file=sys.stderr)


def resolve_status(token, chat):
    """Resolve the custom-emoji status.

    Returns (emoji_status, status_type) where status_type is one of
    "tgs" | "webm" | "webp" | "none". When animated/static sticker data is
    available it is downloaded to assets/status.<ext>; emoji_status is always the
    unicode fallback (possibly "").
    """
    clear_status_files()

    cid = chat.get("emoji_status_custom_emoji_id")
    if not cid:
        return "", "none"

    try:
        stickers = api_call(token, "getCustomEmojiStickers",
                            {"custom_emoji_ids": json.dumps([cid])})
    except Exception as e:  # noqa: BLE001
        print(f"[warn] could not resolve emoji status: {e}", file=sys.stderr)
        return "", "none"

    if not stickers:
        return "", "none"

    sticker = stickers[0]
    emoji = sticker.get("emoji", "") or ""

    # pick the file extension by sticker kind
    if sticker.get("is_animated"):
        ext = "tgs"     # gzip-compressed Lottie JSON
    elif sticker.get("is_video"):
        ext = "webm"
    else:
        ext = "webp"

    try:
        file_info = api_call(token, "getFile", {"file_id": sticker["file_id"]})
        dest = repo_path("assets", f"status.{ext}")
        size = download(f"{API}/file/bot{token}/{file_info['file_path']}", dest)
        print(f"[ok] status sticker -> {dest} ({size} bytes)")
        return emoji, ext
    except Exception as e:  # noqa: BLE001
        print(f"[warn] status sticker download failed: {e}", file=sys.stderr)
        # still have the unicode fallback
        return emoji, "none"


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
        dest = repo_path("assets", "avatar.png")
        size = download(f"{API}/file/bot{token}/{file_path}", dest)
        print(f"[ok] avatar -> {dest} ({size} bytes)")
    except Exception as e:  # noqa: BLE001
        print(f"[warn] avatar fetch failed: {e}", file=sys.stderr)


def main():
    token = os.environ.get("TG_BOT_TOKEN", "").strip()
    user_id = os.environ.get("TG_USER_ID", "").strip()
    if not token or not user_id:
        print("ERROR: set TG_BOT_TOKEN (secret) and TG_USER_ID (variable).",
              file=sys.stderr)
        sys.exit(1)

    print(f"[paths] repo root = {REPO_ROOT}", file=sys.stderr)
    print(f"[paths] cwd       = {os.getcwd()}", file=sys.stderr)

    # getChat works once the user has messaged the bot at least once.
    chat = api_call(token, "getChat", {"chat_id": user_id})

    name = (chat.get("first_name", "") + " " + chat.get("last_name", "")).strip()
    username = chat.get("username", "")
    emoji_status, status_type = resolve_status(token, chat)

    fetch_avatar(token, user_id)

    profile = {
        "name": name or username or "user",
        "username": username,
        "emoji_status": emoji_status,   # unicode fallback
        "status_type": status_type,     # "tgs" | "webm" | "webp" | "none"
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    profile_path = repo_path("profile.json")
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    print(f"[write] {profile_path} ({os.path.getsize(profile_path)} bytes)",
          file=sys.stderr)
    print("[ok] wrote profile.json:", json.dumps(profile, ensure_ascii=False))

    # Final inventory of everything we were supposed to produce, so the log
    # shows the on-disk truth immediately before the workflow stages files.
    print("[files] produced this run:", file=sys.stderr)
    for f in sorted(glob.glob(repo_path("assets", "status.*"))
                    + [repo_path("assets", "avatar.png"), profile_path]):
        state = f"{os.path.getsize(f)} bytes" if os.path.exists(f) else "MISSING"
        print(f"  {f}  ->  {state}", file=sys.stderr)


if __name__ == "__main__":
    main()
