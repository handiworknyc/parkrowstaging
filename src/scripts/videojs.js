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

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  // Always use HLS source
  const initialSource = { src: manifestSrc, type: "application/x-mpegURL" };

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
        bandwidth: 16194304, // Suggest high bandwidth to start
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