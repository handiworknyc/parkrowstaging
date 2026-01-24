import videojs from "video.js";

/* -----------------------------------------------------
   CONFIG
----------------------------------------------------- */
const DEBUG_VIDEO = true;

// ✅ TRUST YOUR EXISTING DEVICE LAYER
const isMobile = typeof HW !== "undefined" && HW.isMobile === true;
const isIpad = typeof HW !== "undefined" && HW.isIpad === true;
const isIOS = isMobile || isIpad;

function vlog(videoId, ...args) {
  if (!DEBUG_VIDEO) return;
  console.log(`[CFVideo:${videoId}]`, ...args);
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
let firstVideoGranted = false;

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

  vlog(videoId, "init", { isIOS, isMobile, isIpad, src: manifestSrc });

  const player = videojs(el, {
    controls: hasControls,
    loop: true,
    autoplay: false,
    muted: true,
    preload: "auto", // ← Changed from "metadata" to "auto" for faster loading
    playsinline: true,
    html5: {
      hls: {
        overrideNative: true,
        useDevicePixelRatio: true,
        bandwidth: 16194304,
        limitRenditionByPlayerDimensions: false,
      },
    },
    sources: [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  /* -----------------------------------------------------
     Splash gate
  ----------------------------------------------------- */
  const isFirstLoad = document.body.classList.contains("first-load");
  const splashActive = isFirstLoad && window.hwSplashActive === true;

  const allowDuringSplash =
    isFirstLoad && splashActive && !firstVideoGranted;

  if (allowDuringSplash) firstVideoGranted = true;

  let playUnlocked = !isFirstLoad || !splashActive || allowDuringSplash;

  vlog(videoId, "splash", {
    isFirstLoad,
    splashActive,
    playUnlocked,
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
     Event handlers - Use 'playing' event for both iOS and desktop
     This ensures video only fades in when actually playing
  ----------------------------------------------------- */
  player.on("playing", () => {
    if (!playUnlocked) {
      vlog(videoId, "playing blocked (locked) → pause");
      player.pause();
      return;
    }

    vlog(videoId, "playing event → fade in video");
    setPlaying();
  });

  player.on("pause", () => {
    setPaused();
  });

  /* -----------------------------------------------------
     Scroll-to-play
  ----------------------------------------------------- */
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    let isIntersecting = false;
    let unlockListenerAttached = false;

    const attachObserver = () => {
      if (observers.has(videoId)) return;

      vlog(videoId, "observer attached", { threshold });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isIntersecting = entry.isIntersecting;

            if (entry.isIntersecting && playUnlocked) {
              vlog(videoId, "intersection → play()");
              player.play().catch((err) => {
                vlog(videoId, "play() failed:", err.name);
              });
            } else if (!entry.isIntersecting && !player.paused()) {
              vlog(videoId, "intersection exit → pause()");
              player.pause();
            }
          });
        },
        { threshold }
      );

      observer.observe(parent);
      observers.set(videoId, observer);
    };

    if (playUnlocked) {
      attachObserver();
    } else if (isFirstLoad && !unlockListenerAttached) {
      unlockListenerAttached = true;

      const onUnlock = () => {
        vlog(videoId, "splash dismissed → unlock (first load)");
        playUnlocked = true;

        if (isIOS) {
          vlog(videoId, "resetting source after unlock (iOS)");
          player.pause();
          player.src({ src: manifestSrc, type: "application/x-mpegURL" });
          player.load();
        }

        attachObserver();

        if (isIntersecting) {
          vlog(videoId, "already visible → play after unlock");
          player.play().catch((err) => {
            vlog(videoId, "play() failed:", err.name);
          });
        }

        window.removeEventListener("splash:dismiss", onUnlock);
        unlockListenerAttached = false;
      };

      window.addEventListener("splash:dismiss", onUnlock);
    } else {
      attachObserver();
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
    if (player && !player.isDisposed()) player.dispose();
    players.delete(videoId);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("astro:after-swap", () => {
    players.forEach((_, id) => destroyCFVideoPlayer(id));
    players.clear();
    observers.clear();
    firstVideoGranted = false;
  });
}