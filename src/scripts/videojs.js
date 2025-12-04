// src/scripts/videojs.js
// ------------------------------------------------------------
// 100% browser-safe module for dynamic import
// Netlify-compatible (no bare imports inside the browser)
// CSS loads only when controls are enabled
// ------------------------------------------------------------

// ⭐ Import URLs for browser-safe loading
import videoJsCoreUrl from "video.js/dist/video.min.js?url";
import qualityLevelsUrl from "videojs-contrib-quality-levels/dist/videojs-contrib-quality-levels.min.js?url";
import videoJsCssUrl from "video.js/dist/video-js.min.css?url";

// Track loaded assets so they load once
const players = new Map();
const observers = new Map();
const loadedAssets = new Set();

// ------------------------------------------------------------
// UTIL: load JS or CSS exactly once
// ------------------------------------------------------------
function loadOnce(url, type = "js") {
  return new Promise((resolve, reject) => {
    if (loadedAssets.has(url)) {
      resolve();
      return;
    }

    let el;

    if (type === "css") {
      el = document.createElement("link");
      el.rel = "stylesheet";
      el.href = url;
    } else {
      el = document.createElement("script");
      el.type = "module";
      el.src = url;
    }

    el.onload = () => {
      loadedAssets.add(url);
      resolve();
    };

    el.onerror = reject;

    document.head.appendChild(el);
  });
}

// ------------------------------------------------------------
// MAIN: Init Video Player
// ------------------------------------------------------------
export async function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const src = wrap.dataset.src;
  if (!el || !src) return;

  // Prevent double init
  if (players.has(videoId)) return players.get(videoId);

  // Detect controls state
  const hasControls = el.classList.contains("show-controls-true");

  // ⭐ Load CSS *only if* controls are enabled
  if (hasControls) {
    await loadOnce(videoJsCssUrl, "css");
  }

  // ⭐ Load Video.js core + quality-levels JS
  await loadOnce(videoJsCoreUrl);
  await loadOnce(qualityLevelsUrl);

  // Video.js becomes available globally after script loads
  const videojs = window.videojs;
  if (!videojs) {
    console.error("video.js failed to load");
    return;
  }

  // ------------------------------------------------------------
  // Initialize Video.js
  // ------------------------------------------------------------
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
    sources: [{ src, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  player.ready(() => {
    if (player.isDisposed()) return;

    // Hide UI if controls false
    if (!hasControls) {
      player.controls(false);
      if (player.controlBar) player.controlBar.hide();
    }
  });

  // ------------------------------------------------------------
  // FORCE MAX QUALITY
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // PLAY STATES
  // ------------------------------------------------------------
  wrap.classList.add("paused");

  player.on("play", () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  });

  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  // ------------------------------------------------------------
  // SCROLL-PLAY LOGIC
  // ------------------------------------------------------------
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

// ------------------------------------------------------------
// CLEANUP
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// CLEAR EVERYTHING AFTER PAGE SWAP
// ------------------------------------------------------------
if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((player, id) => {
      if (player && !player.isDisposed()) destroyCFVideoPlayer(id);
    });
    players.clear();
    observers.clear();
  });
}
