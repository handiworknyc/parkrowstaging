// src/scripts/videojs.js

import videojs from "video.js";
import "videojs-contrib-quality-levels";

// Lazy-load Video.js CSS only when controls enabled
let videoJsCssLoaded = false;
function ensureVideoJsCss() {
  if (videoJsCssLoaded) return;
  import("video.js/dist/video-js.css");
  videoJsCssLoaded = true;
}

const players = new Map();
const observers = new Map();

/* -----------------------------------------------------
   Helper: check if local MP4 is cached
----------------------------------------------------- */
async function isMp4Cached(url) {
  try {
    const cache = await caches.open("videos-mp4");
    const match = await cache.match(url);
    const ok = !!match;
    console.log("[CFVideo] MP4 cached?", url, ok);
    return ok;
  } catch (e) {
    console.warn("[CFVideo] MP4 cache check failed:", e);
    return false;
  }
}

/* -----------------------------------------------------
   Helper: extract Cloudflare videoId from manifest URL
----------------------------------------------------- */
function extractCFId(url) {
  const m = url.match(/com\/([^/]+)\//);
  return m ? m[1] : null;
}

/* -----------------------------------------------------
   initCFVideo
----------------------------------------------------- */

export function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;

  if (!el || !manifestSrc) return;
  if (players.has(videoId)) return players.get(videoId);

  console.log("[CFVideo] INIT", { videoId, manifestSrc });

  const cfId = extractCFId(manifestSrc);
  if (!cfId) {
    console.warn("[CFVideo] Could not derive Cloudflare video ID from:", manifestSrc);
  }

  // Local mirrored MP4 (ONLY created during build)
  const mp4Local = cfId ? `/videos/${cfId}.mp4` : null;

  console.log("[CFVideo] Local MP4:", mp4Local);

  // Controls logic
  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  /* ---------------------------------------------
      Decide which source to start with
  --------------------------------------------- */
  let initialSource = { src: manifestSrc, type: "application/x-mpegURL" };

  async function chooseSource() {
    if (mp4Local && await isMp4Cached(mp4Local)) {
      console.log("[CFVideo] Using cached LOCAL MP4:", mp4Local);
      initialSource = { src: mp4Local, type: "video/mp4" };
    } else {
      console.log("[CFVideo] Local MP4 not available → using HLS:", manifestSrc);
      // ❗ IMPORTANT: No Cloudflare MP4 download at runtime
    }

    initPlayer();
  }

  /* ---------------------------------------------
      Initialize Video.js
  --------------------------------------------- */
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

    /* ---------------------------------------------
        Quality locking (HLS only)
    --------------------------------------------- */
    function forceMaxQuality() {
      const q = player.qualityLevels?.();
      if (!q || q.length === 0) return;

      let bestIndex = 0;
      let bestHeight = 0;

      for (let i = 0; i < q.length; i++) {
        if (q[i].height > bestHeight) {
          bestHeight = q[i].height;
          bestIndex = i;
        }
      }
      for (let i = 0; i < q.length; i++) {
        q[i].enabled = i === bestIndex;
      }
    }

    player.on("loadedmetadata", forceMaxQuality);
    player.on("loadeddata", forceMaxQuality);
    player.on("resolutionchange", forceMaxQuality);

    /* ---------------------------------------------
        UI state classes
    --------------------------------------------- */
    wrap.classList.add("paused");
    player.on("play", () => {
      wrap.classList.add("playing");
      wrap.classList.remove("paused");
    });
    player.on("pause", () => {
      wrap.classList.remove("playing");
      wrap.classList.add("paused");
    });

    /* ---------------------------------------------
        Scroll Play Logic
    --------------------------------------------- */
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

  chooseSource(); // <-- start decision chain

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
    const p = players.get(videoId);
    if (p && !p.isDisposed()) p.dispose();
    players.delete(videoId);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((player, id) => {
      if (player && !player.isDisposed()) {
        destroyCFVideoPlayer(id);
      }
    });
    players.clear();
    observers.clear();
  });
}
