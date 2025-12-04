// ============================================================================
//  VIDEO.JS — FULL DYNAMIC IMPORT VERSION (Netlify Safe, No Render Blocking)
// ============================================================================

// We support a global CSS URL set via Astro layout
// Example: window.__VIDEOJS_CSS_URL__ = "/_astro/video-js.A1b2C3.css";
let videoJsCssUrl = null;
if (typeof window !== "undefined") {
  window.__VIDEOJS_CSS_URL__ = window.__VIDEOJS_CSS_URL__ || null;
  videoJsCssUrl = window.__VIDEOJS_CSS_URL__;
}

// Internal state
let videoJsCssLoaded = false;
let videoJsLib = null;
let qualityPluginLoaded = false;

// Dynamic CSS loader
function ensureVideoJsCss() {
  if (videoJsCssLoaded) return;
  videoJsCssLoaded = true;

  // If Astro set the CSS URL → use it
  if (window.__VIDEOJS_CSS_URL__) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = window.__VIDEOJS_CSS_URL__;
    document.head.appendChild(link);
    return;
  }

  // (Dev fallback) Vite side-effect CSS import
  import("video.js/dist/video-js.css");
}

// ============================================================================
//  DYNAMIC LOADER — Loads video.js + plugin ONLY ON DEMAND
// ============================================================================
async function loadVideoJs() {
  if (!videoJsLib) {
    const mod = await import("video.js");
    videoJsLib = mod.default;
  }

  if (!qualityPluginLoaded) {
    await import("videojs-contrib-quality-levels");
    qualityPluginLoaded = true;
  }

  return videoJsLib;
}

// ============================================================================
//  STATE STORAGE
// ============================================================================
const players = new Map();
const observers = new Map();

// ============================================================================
//  INIT CF VIDEO
// ============================================================================
export async function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const src = wrap.dataset.src;
  if (!el || !src) return;

  // Prevent double init
  if (players.has(videoId)) return players.get(videoId);

  // Determine controls
  const hasControls = el.classList.contains("show-controls-true");

  // Load Video.js library dynamically (first time only)
  const videojs = await loadVideoJs();

  // CSS only when controls are needed
  if (hasControls) {
    ensureVideoJsCss();
  }

  // Initialize Video.js player
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

  // Hide control bar when controls=false
  player.ready(() => {
    if (!hasControls && !player.isDisposed()) {
      player.controls(false);
      if (player.controlBar) player.controlBar.hide();
    }
  });

  // ========================================================================
  //  QUALITY FORCING
  // ========================================================================
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

  // ========================================================================
  //  PLAY / PAUSE STATES
  // ========================================================================
  wrap.classList.add("paused");

  player.on("play", () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  });

  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  // ========================================================================
  //  SCROLL PLAY LOGIC
  // ========================================================================
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

// ============================================================================
//  CLEANUP
// ============================================================================
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

// Clear all players on Astro soft navigation
if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((player, id) => {
      if (player && !player.isDisposed()) destroyCFVideoPlayer(id);
    });
    players.clear();
    observers.clear();
  });
}
