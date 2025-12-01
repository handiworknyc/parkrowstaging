// src/scripts/videojs.js

// 1. Static Import (This allows Vite to auto-preload this chunk)
import videojs from "video.js";
import "videojs-contrib-quality-levels";
import "video.js/dist/video-js.css";

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

  // --- NEW: Detect controls setting from the class ---
  const hasControls = el.classList.contains("show-controls-true");

  // 2. Initialize immediately (No awaiting)
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
    
    // --- NEW: Only hide controls if the setting is false ---
    if (!hasControls) {
      player.controls(false);
      if (player.controlBar) player.controlBar.hide();
    }
  });

  // ... [Keep your existing quality logic and observers below] ...
  
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

  // ... [Keep your existing Event Listeners (play/pause/hover/scroll)] ...
  
  // Basic States
  wrap.classList.add("paused");
  player.on("play", () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  });
  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  // Scroll Play Logic
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

// ... [Keep destroyCFVideoPlayer and global cleanup] ...
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
  // We use 'after-swap' because at this point:
  // 1. The "Old" snapshot has already been captured (with the video visible!).
  // 2. The Old DOM is gone.
  // 3. We can safely clean up memory without affecting the visual transition.
  document.addEventListener("astro:after-swap", () => {
    players.forEach((player, id) => {
       // Safety check: The player might already be destroyed if the user
       // navigated away very quickly.
       if (player && !player.isDisposed()) {
         destroyCFVideoPlayer(id);
       }
    });
    // Clear the maps completely to ensure no stale references persist
    players.clear();
    observers.clear();
  });
}