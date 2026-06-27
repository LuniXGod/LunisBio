# guns.lol-style bio page

A polished, self-contained personal "bio link" page — dark, glassy, glowing, with a
3D-tilt profile card (and a tilting music player), a falling-sparkle custom cursor,
glass tooltips, a typed browser-tab title, a global view counter, and a **live
Telegram profile** that auto-updates via GitHub Actions.

Pure vanilla **HTML + CSS + JS** for the site (no build step, no backend). A tiny
Python script + GitHub Action keep the Telegram data fresh.

```
bio-page/
├── index.html
├── style.css
├── script.js
├── profile.json                     ← written by the Action (optional, auto)
├── scripts/fetch_profile.py         ← fetches your Telegram profile
├── .github/workflows/telegram-profile.yml
└── assets/                          ← you drop your files here
```

## 1. Drop your files into `/assets`

Filenames are configurable in `script.js` (the `CONFIG` block at the very top),
but the defaults expect:

| File                   | What it is                                            | Required |
|------------------------|-------------------------------------------------------|----------|
| `assets/background.mp4`| Full-screen looping background video (muted)          | yes      |
| `assets/avatar.png`    | Profile picture (auto-overwritten by the Action)      | yes      |
| `assets/center.gif`    | Small animated gif shown inside the card              | optional |
| `assets/icon1.gif` …   | One image/gif per center link (add as many as you want)| yes     |
| `assets/track1.mp3` …  | One file per playlist song (add as many as you want)  | yes      |

> Missing avatar/icons fall back to a placeholder so the layout never breaks.
> A missing/unplayable video falls back to a dark gradient.

### ⚠️ Background video: H.264 **and keep an audio track**
Two things make a background video fail to play:

1. **Wrong codec.** Browsers only decode **H.264 (AVC)** in an `.mp4` container.
   Many `.mp4` files are actually H.265/HEVC or ProRes and silently fail.
2. **No audio track.** This is the sneaky one: Chrome's power-saver **pauses
   "video-only" (audio-less) background media**, so the video sits black/frozen on
   its first frame — exactly the "it won't play" symptom. The fix is to encode a
   **silent** audio track so the browser treats it as normal autoplayable media.

Re-encode once, fixing both:

```bash
ffmpeg -i input.mp4 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
       -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
       -vf "scale='min(1280,iw)':-2" -c:a aac -shortest assets/background.mp4
```

Keep it small (a few MB, ~720p–1080p); a 4K/25 MB clip loads slowly on phones.
The page is also defensive: it calls `play()` on load and retries on `canplay`,
`loadeddata`, and your first click/tap/keypress; if the browser still blocks it,
a small **"click anywhere to start"** hint appears and DevTools logs the exact
`readyState` / `paused` / rejection reason so you can see what happened.

## 2. Edit `CONFIG` (top of `script.js`)

Everything user-facing lives there:

- `nickname`, `username`, `status` (emoji **or** `<img>`/`<svg>` markup), `lastSeen`
  — these are **fallbacks**; `profile.json` overrides name/username/status/avatar.
- `avatar`, `backgroundVideo`, `centerGif` paths
- `tabTitle` — the typed browser-tab title (`texts[]`, speeds, `loop`, `deleteBetween`)
- `icons[]` — `{ image, url, label }` (label shows in the glass tooltip)
- `playlist[]` — `{ title, file }` (drives next/prev)
- `views` — the **global** counter namespace/key (see below)

### Global views counter
Uses the free, no-signup [abacus.jasoncameron.dev](https://abacus.jasoncameron.dev)
`/hit` endpoint. Because every visitor hits the **same** `namespace`/`key`, it's a
single global counter that climbs across **all** visitors (not per-user). Pick your
own unique pair once in `CONFIG.views` and don't change it (changing it resets the
count). If the API is ever unreachable, it shows `CONFIG.views.fallback` and the
page keeps working.

## 3. Live Telegram profile (auto-updating)

The avatar, display name, `@username`, and **emoji status** are pulled from your real
Telegram profile by a scheduled GitHub Action and committed back into the repo as
`profile.json` + `assets/avatar.png`. The site reads them on load.

> **Limitation (by design):** the Telegram **Bot API cannot expose online / "last
> seen" status** — that's a Telegram privacy restriction; only a *userbot* running on
> your own account could read it, which this project deliberately does **not** do.
> So **"last seen" stays a manual line** you edit in `CONFIG.lastSeen`.

### One-time setup

1. **Create a bot:** open [@BotFather](https://t.me/BotFather) → `/newbot` → follow
   the prompts → copy the **bot token** it gives you.
2. **Let the bot see you:** open your new bot in Telegram and send it any message
   once (e.g. `hi`). The Bot API's `getChat` only works after this.
3. **Find your numeric user id:** message [@userinfobot](https://t.me/userinfobot)
   (or [@RawDataBot](https://t.me/RawDataBot)); it replies with your `id` (a number
   like `123456789`).
4. **Add the secret + variable** in your GitHub repo:
   - **Settings → Secrets and variables → Actions → Secrets → New repository secret**
     - Name: `TG_BOT_TOKEN`  · Value: *your bot token*
   - **Settings → Secrets and variables → Actions → Variables → New repository variable**
     - Name: `TG_USER_ID`  · Value: *your numeric id*
5. **Allow the Action to commit:** **Settings → Actions → General → Workflow
   permissions → Read and write permissions** (so it can push `profile.json`).
6. **Run it once:** **Actions → "Update Telegram profile" → Run workflow.** After it
   finishes, `profile.json` and `assets/avatar.png` appear in the repo. It then
   re-runs every 30 minutes automatically.

If `profile.json` doesn't exist yet, the page just uses the `CONFIG` fallbacks, so it
works immediately even before the first Action run.

> **Emoji status note:** a custom emoji status is resolved to its base unicode emoji
> (e.g. 🌙). If it can't be resolved, the page falls back to `CONFIG.status`.

## 4. Test locally

Open `index.html` directly, **or** (recommended, so the counter + media + `profile.json`
load cleanly) run a tiny local server:

```bash
cd bio-page
python3 -m http.server 8000   # then open http://localhost:8000
```

Click **"click to enter"** — browsers block autoplay *with sound* until you interact,
so the gate unlocks the music (and reliably starts the video) and reveals the page.

## 5. Deploy to GitHub Pages

1. Push `index.html`, `style.css`, `script.js`, `scripts/`, `.github/`, and `assets/`.
2. Repo → **Settings** → **Pages**.
3. **Source:** "Deploy from a branch" · **Branch:** `main` · **Folder:** `/(root)`.
4. Save, wait ~1 minute, open the printed URL.

For a user site at `https://<you>.github.io`, name the repo `<you>.github.io`.

## Notes
- **Mobile:** the card scales; the custom cursor, sparkles, and tilt auto-disable on touch.
- **Accessibility:** respects `prefers-reduced-motion` (no particles, tilt, or grain animation).
- The play/pause button shows exactly one glyph and is driven by the audio's real state.
