import videojs from "video.js";

/* -----------------------------------------------------
   CONFIG
----------------------------------------------------- */
const DEBUG_VIDEO = true;
const LOG_VER = "v4";

// ~16 Mbps forces 1080p/4k on Desktop
const BANDWIDTH_HIGH = 16194304; 
// ~4 Mbps restricts player to 720p renditions
const BANDWIDTH_MOBILE = 4194304; 

const isMobile =
  typeof HW !== "undefined" && HW.isMobile === true;
const isIpad =
  typeof HW !== "undefined" && HW.isIpad === true;
const isIOS = isMobile || isIpad;

function vlog(videoId, ...args) {
  if (!DEBUG_VIDEO) return;
  console.log(`[CFVideo:${LOG_VER}:${videoId}]`, ...args);
}

/* -----------------------------------------------------
   CSS loader
----------------------------------------------------- */
let videoJsCssLoaded = false;
function ensureVideoJsCss() {
  if (!videoJsCssLoaded) {
    import("video.js/dist/video-js.css");
    videoJsCssLoaded = true;
  }
}

/* -----------------------------------------------------
   State
----------------------------------------------------- */
const players = new Map();
const observers = new Map();

function isFirstLoadSplashActive() {
  const isFirstLoad = document.body.classList.contains("first-load");
  const splashActive = isFirstLoad && window.hwSplashActive === true;
  return { isFirstLoad, splashActive };
}

/* -----------------------------------------------------
   Global flags (persist per page)
----------------------------------------------------- */
if (typeof window !== "undefined") {
  window.__HW_SPLASH_PLAYING__ =
    window.__HW_SPLASH_PLAYING__ || false;

  window.__HW_FETCH_PRIORITY_ASSIGNED__ =
    window.__HW_FETCH_PRIORITY_ASSIGNED__ || false;
}

/* -----------------------------------------------------
   INIT
----------------------------------------------------- */
export function initCFVideo(videoId) {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;
  if (!el || !manifestSrc) return;

  if (players.has(videoId)) return players.get(videoId);

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  const { isFirstLoad, splashActive } = isFirstLoadSplashActive();

  const isSplashVideo =
    !!wrap.closest("[data-splash-video]");

  const isCriticalVideo =
    wrap.dataset.critical === "true";

  /* -----------------------------------------------------
     FETCH PRIORITY (ONE PER PAGE)
  ----------------------------------------------------- */
  let shouldApplyFetchPriority = false;

  // splash always wins
  if (isSplashVideo) {
    shouldApplyFetchPriority = true;
  }

  // otherwise first critical video
  else if (
    isCriticalVideo &&
    window.__HW_FETCH_PRIORITY_ASSIGNED__ !== true
  ) {
    shouldApplyFetchPriority = true;
  }

  if (
    shouldApplyFetchPriority &&
    window.__HW_FETCH_PRIORITY_ASSIGNED__ !== true
  ) {
    el.setAttribute("fetchpriority", "high");
    window.__HW_FETCH_PRIORITY_ASSIGNED__ = true;
    vlog(videoId, "fetchpriority=high applied");
  }

  /* -----------------------------------------------------
     SOURCE DELAY LOGIC
  ----------------------------------------------------- */
  const shouldDelaySource =
    isFirstLoad &&
    splashActive &&
    !isSplashVideo &&
    window.__HW_SPLASH_PLAYING__ !== true;

  // Select target bandwidth based on device
  const targetBandwidth = isMobile ? BANDWIDTH_MOBILE : BANDWIDTH_HIGH;

  vlog(videoId, "init", {
    isIOS,
    isFirstLoad,
    splashActive,
    isSplashVideo,
    isCriticalVideo,
    shouldDelaySource,
    targetBandwidth, // Logged for debugging
    src: manifestSrc,
  });

  const player = videojs(el, {
    controls: hasControls,
    loop: true,
    autoplay: false,
    muted: true,
    playsinline: true,

    preload: shouldDelaySource ? "none" : "auto",

    html5: {
      hls: {
        overrideNative: true,
        useDevicePixelRatio: true,
        
        // ✅ CHANGED: Logic to swap resolution based on device
        bandwidth: targetBandwidth,
        
        limitRenditionByPlayerDimensions: false,
      },
    },

    // 🚫 CRITICAL: no HLS until allowed
    sources: shouldDelaySource
      ? []
      : [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  let playUnlocked = !shouldDelaySource;

  wrap.classList.add("paused");

  /* -----------------------------------------------------
     UI state
  ----------------------------------------------------- */
  const setPlaying = () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  };

  const setPaused = () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  };

  /* -----------------------------------------------------
     Events
  ----------------------------------------------------- */
  player.on("playing", () => {
    if (!playUnlocked) {
      vlog(videoId, "playing blocked → pause");
      player.pause();
      return;
    }

    // splash declares real playback
    if (isSplashVideo && !window.__HW_SPLASH_PLAYING__) {
      window.__HW_SPLASH_PLAYING__ = true;
      vlog(videoId, "splash started playing → splash:playing");
      window.dispatchEvent(new CustomEvent("splash:playing"));
    }

    vlog(videoId, "playing → fade in");
    setPlaying();
  });

  player.on("pause", setPaused);

  /* -----------------------------------------------------
     Scroll-to-play
  ----------------------------------------------------- */
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    let isIntersecting = false;

    const attachObserver = () => {
      if (observers.has(videoId)) return;

      vlog(videoId, "observer attached", { threshold });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isIntersecting = entry.isIntersecting;

            if (entry.isIntersecting && playUnlocked) {
              vlog(videoId, "intersection → play()");
              player.play().catch(() => {});
            } else if (!entry.isIntersecting && !player.paused()) {
              player.pause();
            }
          });
        },
        { threshold }
      );

      observer.observe(parent);
      observers.set(videoId, observer);
    };

    const attachSourceNow = (reason) => {
      if (playUnlocked) return;

      vlog(videoId, `unlock → attach source (${reason})`);
      playUnlocked = true;

      player.src({ src: manifestSrc, type: "application/x-mpegURL" });
      player.load();

      attachObserver();

      if (isIntersecting) {
        player.play().catch(() => {});
      }
    };

    if (playUnlocked) {
      attachObserver();
    } else {
      window.addEventListener(
        "splash:playing",
        () => attachSourceNow("splash:playing"),
        { once: true }
      );

      window.addEventListener(
        "splash:dismiss",
        () => attachSourceNow("splash:dismiss"),
        { once: true }
      );
    }
  }

  return player;
}

/* -----------------------------------------------------
   Cleanup
----------------------------------------------------- */
export function destroyCFVideoPlayer(videoId) {
  if (observers.has(videoId)) {
    observers.get(videoId).disconnect();
    observers.delete(videoId);
  }

  if (players.has(videoId)) {
    const player = players.get(videoId);
    if (player && !player.isDisposed()) {
      player.dispose();
    }
    players.delete(videoId);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((_, id) => destroyCFVideoPlayer(id));
    players.clear();
    observers.clear();

    window.__HW_SPLASH_PLAYING__ = false;
    window.__HW_FETCH_PRIORITY_ASSIGNED__ = false;
  });
}