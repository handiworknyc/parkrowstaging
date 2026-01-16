import videojs from "video.js";
import "videojs-contrib-quality-levels";

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
   Frame readiness helper (DESKTOP ONLY)
----------------------------------------------------- */
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

  vlog(videoId, "init", {
    isIOS,
    isMobile,
    isIpad,
    src: manifestSrc,
  });

  /* -----------------------------------------------------
     Native <video> event logging (mobile only)
  ----------------------------------------------------- */
  if (isIOS) {
    [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "playing",
      "play",
      "pause",
      "waiting",
      "stalled",
      "error",
    ].forEach((evt) => {
      el.addEventListener(evt, () => {
        vlog(videoId, `video event: ${evt}`, {
          readyState: el.readyState,
          currentTime: el.currentTime,
          paused: el.paused,
        });
      });
    });
  }

  const player = videojs(el, {
    controls: hasControls,
    loop: true,
    autoplay: false,
    muted: true,
    preload: "metadata",
    playsinline: true,
    html5: {
      hls: {
        overrideNative: true, // leave as-is; working behavior preserved
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
  const splashActive = window.hwSplashActive === true;
  const allowDuringSplash = splashActive && !firstVideoGranted;

  if (allowDuringSplash) firstVideoGranted = true;

  let playUnlocked = !splashActive || allowDuringSplash;

  vlog(videoId, "splash", { splashActive, playUnlocked });

  wrap.classList.add("paused");

  /* -----------------------------------------------------
     UI state rules
----------------------------------------------------- */
  const setPlaying = () => {
    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  };

  const setPaused = () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  };

  if (isIOS) {
    // ✅ MATCHES YOUR WORKING VERSION
    player.on("play", () => {
      if (!playUnlocked) {
        vlog(videoId, "play while locked (iOS) – ignoring");
        return;
      }
      vlog(videoId, "iOS play → fade");
      requestAnimationFrame(setPlaying);
    });
  } else {
    // Desktop strict mode
    player.on("playing", () => {
      if (!playUnlocked) {
        vlog(videoId, "blocked playing → pause()");
        player.pause();
        return;
      }
      waitForFirstFrame(el, () => {
        vlog(videoId, "desktop first frame → fade");
        setPlaying();
      });
    });
  }

  player.on("pause", setPaused);

  /* -----------------------------------------------------
     Scroll-to-play
     IMPORTANT: gate by NOT calling play() while locked
----------------------------------------------------- */
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    const attachObserver = () => {
      if (observers.has(videoId)) return;

      vlog(videoId, "observer attached", { threshold });

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              if (!playUnlocked) {
                vlog(videoId, "intersection but locked");
                return;
              }
              vlog(videoId, "intersection → play()");
              player.play().catch(() => {});
            } else {
              if (!player.paused()) {
                vlog(videoId, "intersection exit → pause()");
                player.pause();
              }
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
    } else {
      const onUnlock = () => {
        vlog(videoId, "splash dismissed → unlock");
        playUnlocked = true;
        attachObserver();
        window.removeEventListener("splash:dismiss", onUnlock);
      };
      window.addEventListener("splash:dismiss", onUnlock);
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
