import videojs from "video.js";
import {
  buildStreamUrl,
  getClientBandwidthHintForViewport,
} from "../lib/video/stream";

/* -----------------------------------------------------
   CONFIG
----------------------------------------------------- */
const DEBUG_VIDEO = true;
const LOG_VER = "v4";
const WARMUP_PLAY_DURATION_MS = 2500;

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

function getTargetBandwidthForViewport(viewportWidth) {
  return getClientBandwidthHintForViewport(viewportWidth) == null
    ? BANDWIDTH_MOBILE
    : BANDWIDTH_HIGH;
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
const cleanups = new Map();
const refreshers = new Map();

function runAfterFrames(callback, frames = 1) {
  if (frames <= 0) {
    callback();
    return;
  }

  requestAnimationFrame(() => {
    runAfterFrames(callback, frames - 1);
  });
}

function isFirstLoadSplashActive() {
  const isFirstLoad = HW.$html.classList.contains("first-load");
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
export function refreshCFVideoPlayback(videoId, reason = "manual-refresh") {
  const refresher = refreshers.get(videoId);
  if (!refresher) return false;

  refresher(reason);
  return true;
}

export function refreshAllCFVideoPlayback(reason = "manual-refresh-all") {
  refreshers.forEach((refresher) => refresher(reason));
}

export function initCFVideo(videoId, reason = "init") {
  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const desktopManifestSrc = wrap.dataset.src || "";
  const mobileManifestSrc = wrap.dataset.srcMobile || "";
  const responsiveBreakpoint = Number.parseInt(
    wrap.dataset.mobileBreakpoint || "",
    10
  );
  const hasResponsiveSources = !!desktopManifestSrc || !!mobileManifestSrc;
  if (!el || !hasResponsiveSources) return;

  const shouldUseMobileManifest = () =>
    !!mobileManifestSrc &&
    Number.isFinite(responsiveBreakpoint) &&
    window.innerWidth <= responsiveBreakpoint;

  const getPreferredBaseManifestSrc = () =>
    shouldUseMobileManifest() ? mobileManifestSrc : desktopManifestSrc;

  const getPreferredManifestSrc = () => {
    const preferredBaseManifestSrc = getPreferredBaseManifestSrc();
    if (!preferredBaseManifestSrc) return "";

    const clientBandwidthHint = getClientBandwidthHintForViewport(window.innerWidth);
    return buildStreamUrl(preferredBaseManifestSrc, clientBandwidthHint);
  };

  const manifestSrc = getPreferredManifestSrc();

  if (players.has(videoId)) {
    refreshCFVideoPlayback(videoId, `${reason}:existing-player`);
    return players.get(videoId);
  }

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
    !isSplashVideo;

  // Select target bandwidth based on viewport
  const targetBandwidth = getTargetBandwidthForViewport(window.innerWidth);

  vlog(videoId, "init", {
    reason,
    isIOS,
    isFirstLoad,
    splashActive,
    isSplashVideo,
    isCriticalVideo,
    shouldDelaySource,
    targetBandwidth, // Logged for debugging
    clientBandwidthHint: getClientBandwidthHintForViewport(window.innerWidth),
    useMobileManifest: shouldUseMobileManifest(),
    src: manifestSrc,
  });
  

  const player = videojs(el, {
    controls: hasControls,
    loop: true,
    preload: shouldDelaySource ? false : true,
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
    sources: shouldDelaySource || !manifestSrc
      ? []
      : [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });


  players.set(videoId, player);

  const cleanupFns = [];
  const registerCleanup = (fn) => {
    cleanupFns.push(fn);
  };
  cleanups.set(videoId, () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
  });

  let sourceUnlocked = !shouldDelaySource;
  let playbackUnlocked = !shouldDelaySource;
  const isScrollControlled = wrap.dataset.scroll === "true";
  const scrollThreshold = parseFloat(wrap.dataset.threshold) || 0.6;
  const scrollParent = wrap.closest(".hw-player-parent") || wrap;
  let isIntersecting = !isScrollControlled;
  let warmupActive = false;
  let warmupCompleted = false;
  let warmupTimer = null;
  let attachObserver = () => {};
  let activeManifestSrc = shouldDelaySource ? "" : manifestSrc;

  function isElementVisibleEnough(target, threshold = 0) {
    const rect = target.getBoundingClientRect();
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const intersectionWidth = Math.max(
      0,
      Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
    );
    const visibleArea = intersectionWidth * intersectionHeight;
    const totalArea = Math.max(rect.width * rect.height, 1);

    return visibleArea / totalArea >= threshold;
  }

  function attemptPlay(reason) {
    if (player.isDisposed()) return;
    if (!activeManifestSrc) return;
    if (!sourceUnlocked || !playbackUnlocked) return;
    if (isScrollControlled && !isIntersecting) return;
    if (!player.paused()) return;

    vlog(videoId, `${reason} → play()`);
    const playPromise = player.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        vlog(videoId, `${reason} → play() rejected`, err);
      });
    }
  }

  function schedulePlay(reason) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        attemptPlay(reason);
      });
    });
  }

  function clearWarmupTimer() {
    if (warmupTimer) {
      clearTimeout(warmupTimer);
      warmupTimer = null;
    }
  }

  function clearActiveSource(reason) {
    if (player.isDisposed()) return;
    if (!activeManifestSrc) return;

    vlog(videoId, `clear source (${reason})`, {
      activeManifestSrc,
    });

    clearWarmupTimer();
    warmupActive = false;
    warmupCompleted = false;

    if (!player.paused()) {
      player.pause();
    }

    try {
      player.currentTime(0);
    } catch (err) {
      vlog(videoId, "clear source rewind failed", err);
    }

    try {
      player.reset();
    } catch (err) {
      vlog(videoId, "player.reset() failed", err);
      player.src([]);
      player.load();
    }

    activeManifestSrc = "";
    setPaused();
  }

  function syncPreferredSource(reason, { allowAttach = false } = {}) {
    if (player.isDisposed()) return false;

    const preferredManifestSrc = getPreferredManifestSrc();

    if (!preferredManifestSrc) {
      clearActiveSource(`${reason}:no-preferred-source`);
      return false;
    }

    if (!allowAttach && !sourceUnlocked) {
      return preferredManifestSrc === activeManifestSrc;
    }

    if (preferredManifestSrc === activeManifestSrc) {
      return true;
    }

    vlog(videoId, `switch source (${reason})`, {
      from: activeManifestSrc,
      to: preferredManifestSrc,
      width: window.innerWidth,
    });

    clearWarmupTimer();
    warmupActive = false;
    warmupCompleted = false;

    if (!player.paused()) {
      player.pause();
    }

    player.src({ src: preferredManifestSrc, type: "application/x-mpegURL" });
    player.load();

    activeManifestSrc = preferredManifestSrc;
    setPaused();
    return true;
  }

  function finishWarmup(reason) {
    if (!warmupActive) return;

    vlog(videoId, `finish warmup (${reason})`);
    warmupActive = false;
    warmupCompleted = true;
    clearWarmupTimer();

    if (!player.isDisposed() && !playbackUnlocked) {
      if (!player.paused()) {
        player.pause();
      }

      try {
        player.currentTime(0);
      } catch (err) {
        vlog(videoId, "warmup rewind failed", err);
      }
    }
  }

  function startWarmupPlayback(reason) {
    if (player.isDisposed()) return;
    if (!activeManifestSrc) return;
    if (!sourceUnlocked) return;
    if (!isScrollControlled) return;
    if (warmupActive || warmupCompleted || playbackUnlocked) return;

    vlog(videoId, `start warmup (${reason})`);
    warmupActive = true;
    clearWarmupTimer();

    const playPromise = player.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        vlog(videoId, `warmup play rejected (${reason})`, err);
      });
    }

    warmupTimer = setTimeout(() => {
      finishWarmup("timer");
    }, WARMUP_PLAY_DURATION_MS);
  }

  registerCleanup(() => {
    clearWarmupTimer();
  });


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
    if (!playbackUnlocked && !warmupActive) {
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

  player.ready(() => {
    schedulePlay("ready");
  });
  player.on("loadedmetadata", () => attemptPlay("loadedmetadata"));
  player.on("loadeddata", () => attemptPlay("loadeddata"));
  player.on("canplay", () => attemptPlay("canplay"));

  /* -----------------------------------------------------
     Scroll-to-play
  ----------------------------------------------------- */
  if (isScrollControlled) {
    isIntersecting = isElementVisibleEnough(scrollParent, scrollThreshold);

    attachObserver = () => {
      if (observers.has(videoId)) return;

      vlog(videoId, "observer attached", { threshold: scrollThreshold });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isIntersecting = entry.isIntersecting;

            if (entry.isIntersecting && playbackUnlocked) {
              schedulePlay("intersection");
            } else if (!entry.isIntersecting && !player.paused() && !warmupActive) {
              player.pause();
            }
          });
        },
        { threshold: scrollThreshold }
      );

      observer.observe(scrollParent);
      observers.set(videoId, observer);
    };

    const attachSourceNow = (reason) => {
      if (sourceUnlocked) return;

      vlog(videoId, `attach source (${reason})`);
      sourceUnlocked = true;

      syncPreferredSource(`attach:${reason}`, { allowAttach: true });

      attachObserver();
      isIntersecting = isElementVisibleEnough(scrollParent, scrollThreshold);
    };

    const unlockPlaybackNow = (reason) => {
      if (playbackUnlocked) return;

      vlog(videoId, `unlock playback (${reason})`);
      playbackUnlocked = true;
      clearWarmupTimer();

      if (warmupActive || warmupCompleted) {
        warmupActive = false;

        try {
          player.currentTime(0);
        } catch (err) {
          vlog(videoId, "dismiss rewind failed", err);
        }
      }

      syncPreferredSource(`unlock:${reason}`, { allowAttach: true });
      attemptPlay(`playback-unlocked:${reason}:immediate`);
      schedulePlay(`playback-unlocked:${reason}`);
    };

    if (sourceUnlocked) {
      attachObserver();
      schedulePlay("initial-visibility");
    } else {
      const unlockOnSplashPlaying = () => {
        attachSourceNow("splash:playing");
        startWarmupPlayback("splash:playing");
      };

      const unlockOnSplashDismiss = () => {
        window.removeEventListener("splash:playing", unlockOnSplashPlaying);
        attachSourceNow("splash:dismiss");
        unlockPlaybackNow("splash:dismiss");
      };

      window.addEventListener("splash:playing", unlockOnSplashPlaying, {
        once: true,
      });
      window.addEventListener("splash:dismiss", unlockOnSplashDismiss, {
        once: true,
      });

      registerCleanup(() => {
        window.removeEventListener("splash:playing", unlockOnSplashPlaying);
        window.removeEventListener("splash:dismiss", unlockOnSplashDismiss);
      });
    }
  }

  function refreshPlayback(reason) {
    if (player.isDisposed()) return;
    if (!wrap.isConnected || !el.isConnected) return;

    if (isScrollControlled) {
      isIntersecting = isElementVisibleEnough(scrollParent, scrollThreshold);
      attachObserver();
    }

    syncPreferredSource(`${reason}:sync`, { allowAttach: sourceUnlocked });
    if (!activeManifestSrc) {
      return;
    }

    attemptPlay(`${reason}:immediate`);
    schedulePlay(`${reason}:scheduled`);
  }

  refreshers.set(videoId, refreshPlayback);
  registerCleanup(() => {
    refreshers.delete(videoId);
  });

  return player;
}

/* -----------------------------------------------------
   Cleanup
----------------------------------------------------- */
export function destroyCFVideoPlayer(videoId) {
  if (cleanups.has(videoId)) {
    cleanups.get(videoId)();
    cleanups.delete(videoId);
  }

  if (observers.has(videoId)) {
    observers.get(videoId).disconnect();
    observers.delete(videoId);
  }

  if (refreshers.has(videoId)) {
    refreshers.delete(videoId);
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
    refreshers.clear();

    window.__HW_SPLASH_PLAYING__ = false;
    window.__HW_FETCH_PRIORITY_ASSIGNED__ = false;
  });

  document.addEventListener("astro:page-load", () => {
    runAfterFrames(() => {
      refreshAllCFVideoPlayback("astro:page-load");
    }, 2);
  });
}

if (typeof window !== "undefined") {
  const resizeKey = "__HW_CFVIDEO_RESIZE_BOUND__";

  if (!window[resizeKey]) {
    window[resizeKey] = true;

    let resizeRaf = 0;
    let lastWidth = window.innerWidth;

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;

        if (resizeRaf) {
          cancelAnimationFrame(resizeRaf);
        }

        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          refreshAllCFVideoPlayback("window:resize");
        });
      },
      { passive: true }
    );
  }
}
