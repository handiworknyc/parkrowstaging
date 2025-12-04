// src/scripts/videojs.js

// 1. Static JS imports (still eagerly loaded)
import videojs from "video.js";
import "videojs-contrib-quality-levels";

// ❌ Removed global CSS import:
// import "video.js/dist/video-js.css";

// ✅ Load CSS only if/when we actually need controls
let videoJsCssLoaded = false;

function ensureVideoJsCss() {
  if (videoJsCssLoaded) return;

  // Vite will handle this dynamic CSS import as a side-effect chunk
  import("video.js/dist/video-js.css");
  videoJsCssLoaded = true;
}

// Use Maps for O(1) lookups
const players = new Map();
const observers = new Map();

// Note: Removed 'async' because we don't need to await imports anymore
export function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const src = wrap.dataset.src;
  if (!el || !src) return;

  // Prevent double init
  if (players.has(videoId)) return players.get(videoId);

  // --- Detect controls setting from the class ---
  const hasControls = el.classList.contains("show-controls-true");

  // ✅ Only load Video.js CSS when we actually show controls
  if (hasControls) {
    ensureVideoJsCss();
  }

  // Initialize player
  const player = videojs(el, {
    controls: hasControls, // Set dynamically based on class
    loop: true,
    autoplay: false, // We control this via observer
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
    sources: [{ src, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  player.ready(() => {
    if (player.isDisposed()) return;

    // If controls are off, hide them completely
    if (!hasControls) {
      player.controls(false);
      if (player.controlBar) player.controlBar.hide();
    }
  });

  // --- Quality forcing logic ---
  function forceMaxQuality() {
    if (player.isDisposed()) return;
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

  // --- Basic state classes ---
  wrap.classList.add("paused");
  player.on("play", () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  });
  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  // --- Scroll Play Logic ---
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    if (observers.has(videoId)) observers.get(videoId).disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (player.isDisposed()) return;
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

  return player;
}

// --- Cleanup helpers ---
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
