import videojs from "video.js";
import "videojs-contrib-quality-levels";

/* -----------------------------------------------------
   CONFIG
----------------------------------------------------- */
const DEBUG_IOS_VIDEO = true;

const isIOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

function vlog(videoId, ...args) {
  if (!DEBUG_IOS_VIDEO || !isIOS) return;
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
   Frame readiness helper
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
  const wrap = document.getElementById("cfvideo-" + videoId);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;
  if (!el || !manifestSrc) return;

  if (players.has(videoId)) return players.get(videoId);

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

  vlog(videoId, "init", {
    isIOS,
    src: manifestSrc,
    muted: el.muted,
    playsinline: el.playsInline,
  });

  /* -----------------------------------------------------
     Native <video> event logging (iOS)
  ----------------------------------------------------- */
  if (isIOS) {
    [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "playing",
      "pause",
      "waiting",
      "stalled",
      "error",
      "ended",
      "timeupdate",
    ].forEach((evt) => {
      el.addEventListener(evt, () => {
        vlog(videoId, `video event: ${evt}`, {
          readyState: el.readyState,
          networkState: el.networkState,
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
        overrideNative: true, // logging phase — do not change yet
        useDevicePixelRatio: true,
        bandwidth: 16194304,
        limitRenditionByPlayerDimensions: false,
      },
    },
    sources: [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  /* -----------------------------------------------------
     video.js lifecycle logging (iOS)
  ----------------------------------------------------- */
  if (isIOS) {
    player.on("ready", () => vlog(videoId, "vjs ready"));
    player.on("loadstart", () => vlog(videoId, "vjs loadstart"));
    player.on("waiting", () => vlog(videoId, "vjs waiting"));
    player.on("playing", () => vlog(videoId, "vjs playing"));
    player.on("pause", () => vlog(videoId, "vjs pause"));

    player.on("error", () => {
      vlog(videoId, "vjs ERROR", player.error());
    });

    const tech = player.tech(true);
    if (tech) {
      tech.on("error", () => {
        vlog(videoId, "tech ERROR", tech.error());
      });
    }
  }

  /* -----------------------------------------------------
     Splash gate
  ----------------------------------------------------- */
  const splashActive = window.hwSplashActive === true;
  const allowDuringSplash = splashActive && !firstVideoGranted;

  if (allowDuringSplash) firstVideoGranted = true;

  let playUnlocked = !splashActive || allowDuringSplash;

  vlog(videoId, "splash state", {
    splashActive,
    allowDuringSplash,
    playUnlocked,
  });

  wrap.classList.add("paused");

  /* -----------------------------------------------------
     HARD PLAY GUARD
  ----------------------------------------------------- */
  player.on("playing", () => {
    if (!playUnlocked) {
      vlog(videoId, "blocked playing → pause()");
      player.pause();
      return;
    }

    waitForFirstFrame(el, () => {
      vlog(videoId, "first frame confirmed → fade in");
      wrap.classList.add("playing");
      wrap.classList.remove("paused");
    });
  });

  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  /* -----------------------------------------------------
     Scroll-to-play
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
              vlog(videoId, "intersection → play()");
              const p = player.play();

              if (p && typeof p.then === "function") {
                p.then(() => {
                  vlog(videoId, "play() promise resolved");
                }).catch((err) => {
                  vlog(videoId, "play() promise REJECTED", err);
                });
              } else {
                vlog(videoId, "play() returned non-promise", p);
              }
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

    if (!splashActive || allowDuringSplash) {
      attachObserver();
    } else {
      const onUnlock = () => {
        vlog(videoId, "splash dismissed → unlock playback");
        attachObserver();
        playUnlocked = true;
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
