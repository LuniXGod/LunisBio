/* =====================================================================
   guns.lol-style bio page  -  logic
   ===================================================================== */

/* ╔═══════════════════════════════════════════════════════════════════╗
   ║                                                                     ║
   ║   CONFIG  —  EVERYTHING YOU EDIT LIVES HERE                          ║
   ║   (paths are relative to index.html; drop files into /assets)        ║
   ║                                                                     ║
   ╚═══════════════════════════════════════════════════════════════════╝ */
const CONFIG = {

  /* ---- identity (used as FALLBACK before/if profile.json loads) ---- */
  nickname:  "Luni",
  username:  "@yourname",                // dimmer @handle under the name
  status:    "🌙",                       // emoji, OR swap for markup, e.g.
                                         //   '<img src="assets/status.gif">'
                                         //   '<svg ...>...</svg>'
  lastSeen:  "last seen recently",     // static text you edit (Telegram can't
                                         //   expose real online/last-seen status)

  /* ---- live Telegram profile (auto-filled by the GitHub Action) ----
     The Action writes profile.json + assets/avatar.png on a schedule. The site
     reads profile.json and overrides the fallbacks above. Leave as-is unless you
     rename the file. See README for the bot + Action setup.                    */
  profileJson: "profile.json",

  /* ---- typed browser-tab title (typewriter effect) ---- */
  tabTitle: {
    texts: ["welcome :)"],   // cycles through these strings
    typeSpeed:   130,                // ms per character typed
    deleteSpeed: 65,                 // ms per character deleted
    holdFull:    1600,               // pause once a word is fully typed
    holdEmpty:   400,                // pause once a word is fully deleted
    deleteBetween: true,             // false = type each then jump (no deleting)
    loop: true,
  },

  /* ---- media ---- */
  avatar:          "assets/avatar.png",
  backgroundVideo: "assets/background.mp4",
  centerGif:       "",                    // OPTIONAL small gif in the card,
                                         //   e.g. "assets/center.gif" ("" = off)

  /* ---- center link icons (add/remove freely) ---- */
  icons: [
    { image: "assets/icon1.gif", url: "https://t.me/yourname",        label: "Telegram"  },
    { image: "assets/icon2.gif", url: "https://discord.gg/yourinvite", label: "Discord"   },
    { image: "assets/icon3.gif", url: "https://instagram.com/you",     label: "Instagram" },
  ],

  /* ---- music playlist (add/remove freely) ---- */
  playlist: [
    { title: "sit n think — abamadeit", file: "assets/track1.mp3" },
    { title: "Misery — Pupsies", file: "assets/track2.mp3" },
  ],
  autoplayOnEnter: true,   // start music right after the "click to enter" gate

  /* ---- GLOBAL views counter (free, no backend) ----
     ONE shared namespace+key = one global counter. EVERY visitor's page load
     hits the same key and bumps the same number, so it grows across everyone
     (not per-user). Pick your own unique pair once and never change it, or the
     count resets. Uses abacus.jasoncameron.dev /hit (increment + return).      */
  views: {
    namespace: "luni-bio",
    key:       "views",
    fallback:  1337,       // shown if the API is unreachable (never breaks)
  },
};

/* ===================================================================== */
/*  From here down is the engine — you usually don't need to touch it.    */
/* ===================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const prefersReducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isFinePointer =
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;

/* ===================== POPULATE STATIC CONTENT ====================== */
function hydrate() {
  $("#nick").textContent = CONFIG.nickname;
  $("#last-seen").textContent = CONFIG.lastSeen;

  // username fallback line (overridden by profile.json if available)
  if (CONFIG.username) {
    const u = $("#username");
    u.textContent = "@" + String(CONFIG.username).replace(/^@/, "");
    u.hidden = false;
  }

  const statusEl = $("#status");
  // allow emoji OR raw markup (img/svg/gif)
  if (/[<>]/.test(CONFIG.status)) statusEl.innerHTML = CONFIG.status;
  else statusEl.textContent = CONFIG.status;

  const avatar = $("#avatar");
  avatar.src = CONFIG.avatar;
  avatar.onerror = () => {
    avatar.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23222'/%3E%3Ccircle cx='50' cy='40' r='18' fill='%23555'/%3E%3Cpath d='M20 86c0-17 13-26 30-26s30 9 30 26' fill='%23555'/%3E%3C/svg%3E";
  };

  // ---- background video: point the <source> at the configured path, then
  //      (re)load. If it can't decode/load, fall back to a dark gradient. ----
  const video = $("#bg-video");
  const vsrc = $("#bg-video-src");
  const hint = $("#video-hint");
  vsrc.src = CONFIG.backgroundVideo;
  video.load();

  const onVideoFail = () => {
    document.body.classList.add("video-failed");
    console.warn(
      "[bg-video] could not load/play '" + CONFIG.backgroundVideo + "'. " +
      "Confirm the file exists and is H.264/AAC MP4 (re-encode with ffmpeg if needed)."
    );
  };
  video.addEventListener("error", onVideoFail);
  vsrc.addEventListener("error", onVideoFail);

  // Bulletproof autoplay. Muted autoplay usually works, but some browsers block
  // it until a real user gesture. We try on load + every readiness event, and on
  // the FIRST user interaction anywhere. If play() rejects, we surface a small
  // "click anywhere to start" hint and log the real reason to the console.
  let videoStarted = false;
  const tryPlayVideo = (reason) => {
    if (videoStarted && !video.paused) return;
    const p = video.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        const firstStart = !videoStarted;
        videoStarted = true;
        hint && hint.classList.remove("show");
        if (firstStart) console.log(
          `[bg-video] playing (via ${reason}). readyState=${video.readyState}, paused=${video.paused}`
        );
      }).catch((err) => {
        console.log(
          `[bg-video] play() rejected (via ${reason}). readyState=${video.readyState}, ` +
          `paused=${video.paused}, reason=${err && err.name}: ${err && err.message}`
        );
        hint && hint.classList.add("show"); // ask the user to tap/click
      });
    }
  };

  tryPlayVideo("load");
  ["canplay", "loadeddata", "loadedmetadata"].forEach((ev) =>
    video.addEventListener(ev, () => tryPlayVideo(ev))
  );
  // retry on ANY interaction until it actually plays (guard makes this cheap)
  ["pointerdown", "click", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, () => tryPlayVideo(ev), { passive: true })
  );
  // also let the enter gate kick it off
  window.__playBgVideo = () => tryPlayVideo("enter-gate");

  if (CONFIG.centerGif) {
    const g = $("#center-gif");
    g.src = CONFIG.centerGif;
    g.hidden = false;
    g.onerror = () => { g.hidden = true; };
  }
}

/* ===================== CENTER ICON LINKS ====================== */
function buildIcons() {
  const wrap = $("#icons");
  wrap.innerHTML = "";
  CONFIG.icons.forEach((it) => {
    const a = document.createElement("a");
    a.className = "icon-link";
    a.href = it.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("data-cursor", "");
    a.setAttribute("aria-label", it.label || "link");

    const img = document.createElement("img");
    img.alt = it.label || "";
    img.src = it.image;
    img.onerror = () => {
      // graceful fallback: a glowing dot so layout never collapses
      const span = document.createElement("span");
      span.className = "icon-fallback";
      span.textContent = "🔗";
      span.style.fontSize = "22px";
      img.replaceWith(span);
    };

    const tip = document.createElement("span");
    tip.className = "icon-tip";
    tip.textContent = it.label || it.url || "";

    a.append(img, tip);
    wrap.append(a);
  });
}

/* ===================== LIVE TELEGRAM PROFILE ====================== */
/* Reads profile.json (written by the GitHub Action) and fills the card.
   Everything is optional + graceful: missing file -> keep CONFIG fallbacks. */
async function loadProfile() {
  try {
    const res = await fetch(`${CONFIG.profileJson}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("no profile.json");
    const p = await res.json();

    if (p.name) $("#nick").textContent = p.name;

    if (p.username) {
      const u = $("#username");
      u.textContent = "@" + String(p.username).replace(/^@/, "");
      u.hidden = false;
    }

    // custom emoji status resolved to a unicode emoji by the Action; else CONFIG
    if (p.emoji_status) {
      const s = $("#status");
      if (/[<>]/.test(p.emoji_status)) s.innerHTML = p.emoji_status;
      else s.textContent = p.emoji_status;
    }

    // avatar.png is overwritten by the Action; bust the cache so it refreshes
    const avatar = $("#avatar");
    avatar.src = `${CONFIG.avatar}?t=${Date.now()}`;
  } catch {
    /* profile.json not present yet — CONFIG fallbacks from hydrate() stay. */
  }
}

/* ===================== VIEWS COUNTER ====================== */
async function loadViews() {
  const el = $("#views-count");
  const { namespace, key, fallback } = CONFIG.views;
  try {
    // abacus "hit" = increment + return new value
    const res = await fetch(
      `https://abacus.jasoncameron.dev/hit/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    const n = data.value ?? data.count;
    if (typeof n !== "number") throw new Error("no value");
    el.textContent = n.toLocaleString();
  } catch {
    el.textContent = Number(fallback).toLocaleString(); // never break the page
  }
}

/* ===================== 3D TILT (reusable) ====================== */
/* Attach a cursor-following perspective tilt + glare to any element. */
function attachTilt(el, glare, max = 11) {
  if (!el || prefersReducedMotion || !isFinePointer) return;
  let target = { x: 0, y: 0 };
  let cur    = { x: 0, y: 0 };
  let raf = null, active = false;

  function onMove(e) {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top)  / r.height;  // 0..1
    target.x = (py - 0.5) * -2 * max;            // rotateX
    target.y = (px - 0.5) *  2 * max;            // rotateY
    if (glare) {
      glare.style.setProperty("--gx", `${px * 100}%`);
      glare.style.setProperty("--gy", `${py * 100}%`);
    }
  }
  function loop() {
    cur.x = lerp(cur.x, target.x, 0.12);
    cur.y = lerp(cur.y, target.y, 0.12);
    el.style.transform =
      `perspective(900px) rotateX(${cur.x.toFixed(2)}deg) rotateY(${cur.y.toFixed(2)}deg)`;
    if (active || Math.abs(cur.x - target.x) > 0.01 || Math.abs(cur.y - target.y) > 0.01) {
      raf = requestAnimationFrame(loop);
    } else {
      el.style.transform = "";
      raf = null;
    }
  }
  function start() { active = true; if (!raf) raf = requestAnimationFrame(loop); }
  function stop()  { active = false; target = { x: 0, y: 0 }; if (!raf) raf = requestAnimationFrame(loop); }

  el.addEventListener("mouseenter", start);
  el.addEventListener("mousemove", onMove);
  el.addEventListener("mouseleave", stop);
}

function initTilt() {
  attachTilt($("#tilt-card"), $(".card-glare"), 11);   // central card
  attachTilt($("#player"),    $(".player-glare"), 6);  // music player (subtler)
}

/* ===================== CUSTOM CURSOR + SPARKLES ====================== */
function initCursor() {
  if (prefersReducedMotion || !isFinePointer) return;
  document.body.classList.add("custom-cursor");

  const dot = $("#cursor");
  let lastSpark = 0;

  // Pin the dot EXACTLY to the pointer, every event, no smoothing/lerp/rAF.
  // (CSS has no transform-transition on .cursor-dot, so this is truly 1:1.)
  window.addEventListener("mousemove", (e) => {
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    spawnBurst(e.clientX, e.clientY);
  }, { passive: true });

  // grow on clickable elements
  const hoverSel = "a, button, [data-cursor], .seek, .icon-link";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(hoverSel)) dot.classList.add("hovering");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest(hoverSel) && !e.relatedTarget?.closest?.(hoverSel))
      dot.classList.remove("hovering");
  });

  // tuning: lots of small particles that rain DOWNWARD while the mouse moves
  const SPARK_THROTTLE = 16;     // ms between bursts (~60fps cap)
  const SPARKS_PER_BURST = 4;    // particles spawned each burst -> dense trail
  const MAX_SPARKS = 240;        // hard cap so DOM never floods
  let liveSparks = 0;

  function spawnBurst(x, y) {
    const now = performance.now();
    if (now - lastSpark < SPARK_THROTTLE) return;   // throttle for performance
    lastSpark = now;
    for (let i = 0; i < SPARKS_PER_BURST; i++) {
      if (liveSparks >= MAX_SPARKS) break;
      spawnSparkle(x, y);
    }
  }

  function spawnSparkle(x, y) {
    const s = document.createElement("div");
    s.className = "sparkle";
    const size = 2 + Math.random() * 4;
    s.style.width = s.style.height = `${size}px`;
    s.style.left = `${x + (Math.random() - 0.5) * 14}px`;
    s.style.top  = `${y + (Math.random() - 0.5) * 10}px`;
    document.body.appendChild(s);
    liveSparks++;

    // gravity: small horizontal scatter, strong downward drift
    const dx = (Math.random() - 0.5) * 28;
    const dy = 40 + Math.random() * 90;            // always falls down
    const life = 700 + Math.random() * 600;
    const rot = (Math.random() - 0.5) * 220;

    s.animate(
      [
        { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
        { opacity: 0.9, offset: 0.25 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.1) rotate(${rot}deg)`, opacity: 0, offset: 1 },
      ],
      { duration: life, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" } // ease-in = accelerate (gravity)
    ).onfinish = () => { s.remove(); liveSparks--; };
  }
}

/* ===================== MUSIC PLAYER ====================== */
function initPlayer() {
  const audio   = $("#audio");
  const titleEl = $("#track-title");
  const playBtn = $("#playpause");
  const iconPlay  = $("#icon-play");
  const iconPause = $("#icon-pause");
  const curTime = $("#cur-time");
  const durTime = $("#dur-time");
  const seek      = $("#seek");
  const seekFill  = $("#seek-fill");
  const seekHandle= $("#seek-handle");

  let index = 0;
  let dragging = false;

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  function load(i, autoplay = false) {
    if (!CONFIG.playlist.length) { titleEl.textContent = "no tracks"; return; }
    index = (i + CONFIG.playlist.length) % CONFIG.playlist.length;
    const track = CONFIG.playlist[index];
    audio.src = track.file;
    titleEl.textContent = track.title;
    seekFill.style.width = "0%";
    seekHandle.style.left = "0%";
    curTime.textContent = "0:00";
    durTime.textContent = "0:00";
    if (autoplay) play();
  }

  // single source of truth for the glyph: show EXACTLY one icon.
  // NOTE: these are <svg> elements; the `.hidden` *property* does NOT reflect to
  // the attribute on SVGElement, so we must toggle the attribute explicitly
  // (otherwise the CSS `svg[hidden]{display:none!important}` keeps it hidden).
  function setPlaying(p) {
    iconPlay.toggleAttribute("hidden", p);
    iconPause.toggleAttribute("hidden", !p);
    iconPlay.style.display  = p ? "none"  : "block";
    iconPause.style.display = p ? "block" : "none";
    playBtn.setAttribute("aria-label", p ? "pause" : "play");
  }
  function play()   { audio.play().catch(() => {/* autoplay blocked; wait for click */}); }
  function pause()  { audio.pause(); }
  function toggle() { audio.paused ? play() : pause(); }

  playBtn.addEventListener("click", toggle);
  $("#next").addEventListener("click", () => load(index + 1, true));
  $("#prev").addEventListener("click", () => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    load(index - 1, true);
  });
  audio.addEventListener("ended", () => load(index + 1, true));

  audio.addEventListener("loadedmetadata", () => {
    durTime.textContent = fmt(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    if (dragging) return;
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    seekFill.style.width = `${pct}%`;
    seekHandle.style.left = `${pct}%`;
    curTime.textContent = fmt(audio.currentTime);
    seek.setAttribute("aria-valuenow", Math.round(pct));
  });
  audio.addEventListener("play",  () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));

  /* ---- draggable / clickable seek ---- */
  function seekToClientX(clientX) {
    const r = seek.getBoundingClientRect();
    const pct = clamp((clientX - r.left) / r.width, 0, 1);
    seekFill.style.width = `${pct * 100}%`;
    seekHandle.style.left = `${pct * 100}%`;
    if (audio.duration) {
      audio.currentTime = pct * audio.duration;
      curTime.textContent = fmt(audio.currentTime);
    }
  }
  seek.addEventListener("pointerdown", (e) => {
    dragging = true; seek.classList.add("dragging");
    seek.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  });
  seek.addEventListener("pointermove", (e) => { if (dragging) seekToClientX(e.clientX); });
  const endDrag = () => { dragging = false; seek.classList.remove("dragging"); };
  seek.addEventListener("pointerup", endDrag);
  seek.addEventListener("pointercancel", endDrag);
  // keyboard seek
  seek.addEventListener("keydown", (e) => {
    if (!audio.duration) return;
    if (e.key === "ArrowRight") audio.currentTime = clamp(audio.currentTime + 5, 0, audio.duration);
    if (e.key === "ArrowLeft")  audio.currentTime = clamp(audio.currentTime - 5, 0, audio.duration);
  });

  setPlaying(false);  // start in the "paused" glyph state
  load(0, false);
  return { play, audio };
}

/* ===================== TYPED TAB TITLE ====================== */
/* Typewriter effect on document.title: type a word, hold, delete, next, loop. */
function initTabTitle() {
  const cfg = CONFIG.tabTitle || {};
  const texts = (cfg.texts && cfg.texts.length ? cfg.texts : [CONFIG.nickname]).slice();
  if (!texts.length) return;

  let ti = 0;   // which string
  let ci = 0;   // how many chars shown
  let deleting = false;

  function tick() {
    const full = texts[ti];
    document.title = full.slice(0, ci) || "​"; // zero-width keeps tab non-empty

    let delay;
    if (!deleting) {
      ci++;
      delay = cfg.typeSpeed ?? 130;
      if (ci > full.length) {
        ci = full.length;
        if (cfg.deleteBetween === false) {
          // no deleting: hold, then jump to next word
          ti = (ti + 1) % texts.length; ci = 0;
          if (ti === 0 && cfg.loop === false) return;
          delay = cfg.holdFull ?? 1600;
        } else {
          deleting = true;
          delay = cfg.holdFull ?? 1600;
        }
      }
    } else {
      ci--;
      delay = cfg.deleteSpeed ?? 65;
      if (ci <= 0) {
        ci = 0; deleting = false;
        ti = (ti + 1) % texts.length;
        if (ti === 0 && cfg.loop === false) { document.title = texts[texts.length - 1]; return; }
        delay = cfg.holdEmpty ?? 400;
      }
    }
    setTimeout(tick, delay);
  }
  tick();
}

/* ===================== ENTER GATE ====================== */
function initGate(player) {
  const gate = $("#enter-gate");
  const btn  = $("#enter-btn");

  function enter() {
    document.body.classList.add("entered");
    gate.classList.add("hidden");
    // background video may have been blocked from autoplay until interaction
    window.__playBgVideo ? window.__playBgVideo() : $("#bg-video").play?.().catch(() => {});
    if (CONFIG.autoplayOnEnter && player) player.play();
    btn.removeEventListener("click", enter);
    setTimeout(() => { gate.style.display = "none"; }, 700);
  }
  btn.addEventListener("click", enter);
}

/* ===================== BOOT ====================== */
document.addEventListener("DOMContentLoaded", () => {
  hydrate();
  loadProfile();      // live Telegram data (overrides fallbacks when present)
  buildIcons();
  loadViews();        // single global hit counter
  initTabTitle();     // typewriter browser-tab title
  initTilt();         // card + player 3D tilt
  initCursor();       // glowing cursor + falling sparkles
  const player = initPlayer();
  initGate(player);
});
