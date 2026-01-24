import videojs from "video.js";

/* -----------------------------------------------------
   CONFIG
----------------------------------------------------- */
const DEBUG_VIDEO = true;
const INTERSECTION_ROOT_MARGIN = "50px"; // Preload before visible
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// ✅ TRUST YOUR EXISTING DEVICE LAYER
const isMobile = typeof HW !== "undefined" && HW.isMobile === true;
const isIpad = typeof HW !== "undefined" && HW.isIpad === true;
const isIOS = isMobile || isIpad;

function vlog(videoId, ...args) {
  if (!DEBUG_VIDEO) return;
  console.log(`[CFVideo:${videoId}]`, ...args);
}

function waitForFirstFrame(videoEl, cb) {
  if (isIOS) {
    requestAnimationFrame(() => requestAnimationFrame(cb));
    return;
  }

  if ("requestVideoFrameCallback" in videoEl) {
    videoEl.requestVideoFrameCallback(() => cb());
    return;
  }

  const onTime = () => {
    videoEl.removeEventListener("timeupdate", onTime);
    cb();
  };
  videoEl.addEventListener("timeupdate", onTime, { once: true });
}

/* -----------------------------------------------------
   CSS loader
----------------------------------------------------- */
let videoJsCssLoaded = false;
let cssLoadPromise = null;

function ensureVideoJsCss() {
  if (videoJsCssLoaded) return Promise.resolve();
  if (cssLoadPromise) return cssLoadPromise;
  
  cssLoadPromise = import("video.js/dist/video-js.css")
    .then(() => {
      videoJsCssLoaded = true;
    })
    .catch((err) => {
      console.error("[CFVideo] Failed to load CSS:", err);
      cssLoadPromise = null; // Allow retry
    });
  
  return cssLoadPromise;
}

/* -----------------------------------------------------
   State
----------------------------------------------------- */
const players = new Map();
const playerListeners = new Map(); // 🔑 Track for cleanup
const playerRetries = new Map(); // 🔑 Error recovery
let sharedObserver = null; // 🔑 One observer for all videos
const observedElements = new Map(); // videoId -> { element, threshold, callback }
let firstVideoGranted = false;
let isCleaningUp = false; // 🔑 Prevent race conditions

/* -----------------------------------------------------
   Shared Intersection Observer (Performance++)
----------------------------------------------------- */
function ensureSharedObserver() {
  if (sharedObserver) return;

  sharedObserver = new IntersectionObserver(
    (entries) => {
      if (isCleaningUp) return;
      
      entries.forEach((entry) => {
        // Find which video this entry belongs to
        for (const [videoId, config] of observedElements.entries()) {
          if (config.element === entry.target) {
            config.callback(entry.isIntersecting);
            break;
          }
        }
      });
    },
    { 
      threshold: [0, 0.1, 0.25, 0.5, 0.6, 0.75, 1.0], // Multiple thresholds
      rootMargin: INTERSECTION_ROOT_MARGIN 
    }
  );
}

function observeElement(videoId, element, threshold, callback) {
  ensureSharedObserver();
  
  // Unobserve old if exists
  if (observedElements.has(videoId)) {
    const old = observedElements.get(videoId);
    sharedObserver.unobserve(old.element);
  }
  
  observedElements.set(videoId, { element, threshold, callback });
  sharedObserver.observe(element);
  
  vlog(videoId, "shared observer attached");
}

function unobserveElement(videoId) {
  if (!observedElements.has(videoId)) return;
  
  const config = observedElements.get(videoId);
  if (sharedObserver) {
    sharedObserver.unobserve(config.element);
  }
  observedElements.delete(videoId);
}

/* -----------------------------------------------------
   Error Recovery
----------------------------------------------------- */
function handlePlayerError(videoId, player, manifestSrc, error) {
  vlog(videoId, "ERROR:", error);
  
  const retries = playerRetries.get(videoId) || 0;
  
  if (retries >= MAX_RETRY_ATTEMPTS) {
    vlog(videoId, "max retries reached, giving up");
    return;
  }
  
  playerRetries.set(videoId, retries + 1);
  
  const delay = RETRY_DELAY_MS * Math.pow(2, retries); // Exponential backoff
  vlog(videoId, `retry ${retries + 1}/${MAX_RETRY_ATTEMPTS} in ${delay}ms`);
  
  setTimeout(() => {
    if (player.isDisposed()) return;
    
    player.src({ src: manifestSrc, type: "application/x-mpegURL" });
    player.load();
    
    // Try to play if it should be playing
    const wrap = document.getElementById(`cfvideo-${videoId}`);
    if (wrap && wrap.classList.contains("playing")) {
      player.play().catch(() => {});
    }
  }, delay);
}

/* -----------------------------------------------------
   Event Listener Tracking
----------------------------------------------------- */
function trackListener(videoId, eventName, handler) {
  if (!playerListeners.has(videoId)) {
    playerListeners.set(videoId, []);
  }
  playerListeners.get(videoId).push({ eventName, handler });
}

function cleanupListeners(videoId) {
  if (!playerListeners.has(videoId)) return;
  
  const player = players.get(videoId);
  if (player && !player.isDisposed()) {
    playerListeners.get(videoId).forEach(({ eventName, handler }) => {
      player.off(eventName, handler);
    });
  }
  
  playerListeners.delete(videoId);
}

/* -----------------------------------------------------
   INIT
----------------------------------------------------- */
export function initCFVideo(videoId) {
  // 🔑 Race condition protection
  if (isCleaningUp) {
    vlog(videoId, "init blocked: cleanup in progress");
    return null;
  }

  const wrap = document.getElementById(`cfvideo-${videoId}`);
  if (!wrap) return null;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;
  if (!el || !manifestSrc) return null;

  // 🔑 Reuse existing player if already initialized
  if (players.has(videoId)) {
    vlog(videoId, "player already exists, reusing");
    return players.get(videoId);
  }

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  vlog(videoId, "init", { isIOS, isMobile, isIpad, src: manifestSrc });

  // 🔑 Better HLS config for performance
  const player = videojs(el, {
    controls: hasControls,
    loop: true,
    autoplay: false,
    muted: true,
    preload: "metadata",
    playsinline: true,
    html5: {
      hls: {
        overrideNative: !isIOS, // 🔑 Use native HLS on iOS (better performance)
        useDevicePixelRatio: true,
        bandwidth: 16194304,
        limitRenditionByPlayerDimensions: true, // 🔑 Save bandwidth
        smoothQualityChange: true, // 🔑 Better UX on quality switches
        enableLowInitialPlaylist: true, // 🔑 Faster startup
      },
      nativeAudioTracks: isIOS,
      nativeVideoTracks: isIOS,
    },
    sources: [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);
  playerRetries.set(videoId, 0);

  /* -----------------------------------------------------
     Error Handling
  ----------------------------------------------------- */
  const errorHandler = (error) => {
    handlePlayerError(videoId, player, manifestSrc, error);
  };
  player.on("error", errorHandler);
  trackListener(videoId, "error", errorHandler);

  /* -----------------------------------------------------
     Splash gate
  ----------------------------------------------------- */
  const isFirstLoad = document.body.classList.contains("first-load");
  const splashActive = isFirstLoad && window.hwSplashActive === true;
  const allowDuringSplash = isFirstLoad && splashActive && !firstVideoGranted;

  if (allowDuringSplash) firstVideoGranted = true;

  let playUnlocked = !isFirstLoad || !splashActive || allowDuringSplash;

  vlog(videoId, "splash", { isFirstLoad, splashActive, playUnlocked });

  wrap.classList.add("paused");

    /* -----------------------------------------------------
     UI state
  ----------------------------------------------------- */
  const setPlaying = () => {
    if (isCleaningUp) return;
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  };

  const setPaused = () => {
    if (isCleaningUp) return;
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  };

  if (isIOS) {
    const playHandler = () => {
      if (!playUnlocked) {
        vlog(videoId, "play blocked (locked)");
        return;
      }
      vlog(videoId, "iOS play → fade");
      requestAnimationFrame(setPlaying);
    };
    player.on("play", playHandler);
    trackListener(videoId, "play", playHandler);
  } else {
    // 🔑 FIXED: Combined desktop playback + retry reset into ONE handler
    const playingHandler = () => {
      if (!playUnlocked) {
        vlog(videoId, "blocked playing → pause()");
        player.pause();
        return;
      }

      // Reset retry count on successful playback
      playerRetries.set(videoId, 0);

      waitForFirstFrame(el, () => {
        vlog(videoId, "desktop first frame → fade");
        setPlaying();
      });
    };
    player.on("playing", playingHandler);
    trackListener(videoId, "playing", playingHandler);
  }

  const pauseHandler = setPaused;
  player.on("pause", pauseHandler);
  trackListener(videoId, "pause", pauseHandler);

  /* -----------------------------------------------------
     Scroll-to-play
  ----------------------------------------------------- */
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    let isIntersecting = false;
    let unlockListenerAttached = false;

    const handleIntersection = (intersecting) => {
      isIntersecting = intersecting;

      if (intersecting && playUnlocked) {
        vlog(videoId, "intersection → play()");
        player.play().catch((err) => {
          vlog(videoId, "play failed:", err);
        });
      } else if (!intersecting && !player.paused()) {
        vlog(videoId, "intersection exit → pause()");
        player.pause();
      }
    };

    const attachObserver = () => {
      observeElement(videoId, parent, threshold, handleIntersection);
    };

    if (playUnlocked) {
      attachObserver();
    } else if (isFirstLoad && !unlockListenerAttached) {
      unlockListenerAttached = true;

      const onUnlock = () => {
        vlog(videoId, "splash dismissed → unlock (first load)");
        playUnlocked = true;

        // 🔑 iOS ONLY needs reset on first-load blocked playback
        if (isIOS && !player.hasStarted()) {
          vlog(videoId, "resetting source after unlock (iOS)");
          player.pause();
          player.src({ src: manifestSrc, type: "application/x-mpegURL" });
          player.load();
        }

        attachObserver();

        if (isIntersecting) {
          vlog(videoId, "already visible → play after unlock");
          player.play().catch(() => {});
        }

        window.removeEventListener("splash:dismiss", onUnlock);
        unlockListenerAttached = false;
      };

      window.addEventListener("splash:dismiss", onUnlock);
    } else {
      attachObserver();
    }
  }

  // 🔑 REMOVED: Duplicate playingHandler - now integrated above

  return player;
}

/* -----------------------------------------------------
   Cleanup
----------------------------------------------------- */
export function destroyCFVideoPlayer(videoId) {
  vlog(videoId, "destroying player");
  
  cleanupListeners(videoId);
  unobserveElement(videoId);
  playerRetries.delete(videoId);
  
  if (players.has(videoId)) {
    const player = players.get(videoId);
    if (player && !player.isDisposed()) {
      // 🔑 Proper cleanup sequence
      player.pause();
      player.dispose();
    }
    players.delete(videoId);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    vlog("global", "astro:after-swap - cleaning up all players");
    
    // 🔑 Prevent new inits during cleanup
    isCleaningUp = true;
    
    // 🔑 Cleanup in reverse order (newest first)
    const videoIds = Array.from(players.keys()).reverse();
    videoIds.forEach((id) => destroyCFVideoPlayer(id));
    
    // 🔑 Cleanup shared observer
    if (sharedObserver) {
      sharedObserver.disconnect();
      sharedObserver = null;
    }
    
    players.clear();
    playerListeners.clear();
    observedElements.clear();
    playerRetries.clear();
    firstVideoGranted = false;
    
    // 🔑 Re-enable inits after cleanup
    requestAnimationFrame(() => {
      isCleaningUp = false;
    });
  });
  
  // 🔑 Cleanup on page unload (prevent memory leaks)
  window.addEventListener("beforeunload", () => {
    const videoIds = Array.from(players.keys());
    videoIds.forEach((id) => destroyCFVideoPlayer(id));
  });
}