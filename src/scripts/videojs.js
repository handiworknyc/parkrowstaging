// src/scripts/videojs.js

import videojs from "video.js";
import "videojs-contrib-quality-levels";

/* -----------------------------------------------------
   Lazy-load Video.js CSS when controls are enabled
----------------------------------------------------- */
let videoJsCssLoaded = false;
function ensureVideoJsCss() {
  if (!videoJsCssLoaded) {
    import("video.js/dist/video-js.css");
    videoJsCssLoaded = true;
  }
}

const players = new Map();
const observers = new Map();

/* -----------------------------------------------------
   Detect private/incognito mode (reliable, async)
----------------------------------------------------- */
async function isPrivateMode() {
  return new Promise((resolve) => {
    const db = indexedDB.open("test-private-check");
    db.onerror = () => resolve(true);   // private mode → error
    db.onsuccess = () => resolve(false);
  });
}

/* -----------------------------------------------------
   Helper: check if mirrored MP4 is cached
----------------------------------------------------- */
async function isMp4Cached(mp4Path) {
  try {
    const cache = await caches.open("videos-mp4");
    const match = await cache.match(mp4Path);
    const ok = !!match;
    console.log("[CFVideo] MP4 cached?", mp4Path, ok);
    return ok;
  } catch (err) {
    console.warn("[CFVideo] MP4 cache lookup error:", err);
    return false;
  }
}

/* -----------------------------------------------------
   Extract Cloudflare videoId from manifest URL
----------------------------------------------------- */
function extractCFId(url) {
  const m = url.match(/com\/([^/]+)\//);
  return m ? m[1] : null;
}

/* -----------------------------------------------------
   Initialize CF Video
----------------------------------------------------- */

export function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;

  if (!el || !manifestSrc) return;
  if (players.has(videoId)) return players.get(videoId);

  console.log("[CFVideo] INIT", videoId, manifestSrc);

  const cfId = extractCFId(manifestSrc);
  if (!cfId) {
    console.warn("[CFVideo] Could not derive CF ID from:", manifestSrc);
  }

  const mp4Local = cfId ? `/videos/${cfId}.mp4` : null;

  console.log("[CFVideo] Local MP4:", mp4Local);

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  let initialSource = { src: manifestSrc, type: "application/x-mpegURL" };

  /* -----------------------------------------------------
     Decide initial source (cached MP4 → instant play)
  ----------------------------------------------------- */
  async function chooseSource() {
    /* 1️⃣ Check for private browsing — disable MP4 logic */
    if (await isPrivateMode()) {
      console.warn("[CFVideo] Private mode detected → forcing HLS only");
      initialSource = { src: manifestSrc, type: "application/x-mpegURL" };
      return initPlayer();
    }

    /* 2️⃣ Normal mode: try local MP4 cache */
    if (mp4Local && await isMp4Cached(mp4Local)) {
      console.log("[CFVideo] Using cached MP4:", mp4Local);
      initialSource = { src: mp4Local, type: "video/mp4" };
    } else {
      console.log("[CFVideo] Using HLS:", manifestSrc);
    }

    initPlayer();
  }

  /* -----------------------------------------------------
     Initialize Video.js player
  ----------------------------------------------------- */
  function initPlayer() {
    const player = videojs(el, {
      controls: hasControls,
      loop: true,
      autoplay: false,
      muted: true,
      preload: "metadata",
      playsinline: true,

      html5: {
        hls: {
          overrideNative: true,
          useDevicePixelRatio: true,
          bandwidth: 16194304,
          limitRenditionByPlayerDimensions: false,
        },
      },

      sources: [initialSource],
    });

    players.set(videoId, player);

    player.ready(() => {
      if (!hasControls && player.controlBar) {
        player.controls(false);
        player.controlBar.hide();
      }
    });

    /* -----------------------------------------------------
       Auto-recover if MP4 fails to load
    ----------------------------------------------------- */
    player.on("error", () => {
      const err = player.error();
      if (!err) return;

      console.warn("[CFVideo] Player error:", err);

      if (initialSource.type === "video/mp4") {
        console.warn("[CFVideo] MP4 failed, reverting to HLS");
        player.src({ src: manifestSrc, type: "application/x-mpegURL" });
      }
    });

    /* -----------------------------------------------------
       Force max HLS resolution
    ----------------------------------------------------- */
    function forceMaxQuality() {
      const q = player.qualityLevels?.();
      if (!q) return;

      let best = 0;
      let bestHeight = 0;

      for (let i = 0; i < q.length; i++) {
        if (q[i].height > bestHeight) {
          bestHeight = q[i].height;
          best = i;
        }
      }

      for (let i = 0; i < q.length; i++) {
        q[i].enabled = i === best;
      }
    }

    player.on("loadedmetadata", forceMaxQuality);
    player.on("loadeddata", forceMaxQuality);
    player.on("resolutionchange", forceMaxQuality);

    /* -----------------------------------------------------
       UI state classes
    ----------------------------------------------------- */
    wrap.classList.add("paused");

    player.on("play", () => {
      wrap.classList.add("playing");
      wrap.classList.remove("paused");
    });

    player.on("pause", () => {
      wrap.classList.remove("playing");
      wrap.classList.add("paused");
    });

    /* -----------------------------------------------------
       Scroll-to-play logic
    ----------------------------------------------------- */
    if (wrap.dataset.scroll === "true") {
      const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
      const parent = wrap.closest(".hw-player-parent") || wrap;

      if (observers.has(videoId)) observers.get(videoId).disconnect();

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              player.play().catch(() => {});
            } else {
              if (!player.paused()) player.pause();
            }
          });
        },
        { threshold }
      );

      observer.observe(parent);
      observers.set(videoId, observer);
    }
  }

  chooseSource();

  return players.get(videoId);
}

/* -----------------------------------------------------
   Cleanup on Astro page swap
----------------------------------------------------- */
export function destroyCFVideoPlayer(videoId) {
  if (observers.has(videoId)) {
    observers.get(videoId).disconnect();
    observers.delete(videoId);
  }
  if (players.has(videoId)) {
    const player = players.get(videoId);
    if (player && !player.isDisposed()) player.dispose();
    players.delete(videoId);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((player, id) => destroyCFVideoPlayer(id));
    players.clear();
    observers.clear();
  });
}
