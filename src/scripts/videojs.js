import videojs from "video.js";
import "videojs-contrib-quality-levels";

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
   Splash gate (module-scoped)
----------------------------------------------------- */
let firstVideoGranted = false;

export function initCFVideo(videoId) {
  const wrap = document.getElementById("cfvideo-" + videoId);
  if (!wrap) return;

  const el = wrap.querySelector("video");
  const manifestSrc = wrap.dataset.src;
  if (!el || !manifestSrc) return;

  if (players.has(videoId)) return players.get(videoId);

  const hasControls = el.classList.contains("show-controls-true");
  if (hasControls) ensureVideoJsCss();

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
    sources: [{ src: manifestSrc, type: "application/x-mpegURL" }],
  });

  players.set(videoId, player);

  /* -----------------------------------------------------
     SPLASH DECISION (ONCE PER VIDEO)
  ----------------------------------------------------- */
  const splashActive = window.hwSplashActive === true;
  const allowDuringSplash = splashActive && !firstVideoGranted;

  if (allowDuringSplash) {
    firstVideoGranted = true;
  }

  let playUnlocked = !splashActive || allowDuringSplash;

  wrap.classList.add("paused");

  /* -----------------------------------------------------
     HARD PLAY GUARD
  ----------------------------------------------------- */
  player.on("play", () => {
    if (!playUnlocked) {
      player.pause();
      return;
    }

    wrap.classList.add("playing");
    wrap.classList.remove("paused");
  });

  player.on("pause", () => {
    wrap.classList.remove("playing");
    wrap.classList.add("paused");
  });

  /* -----------------------------------------------------
     Scroll-to-play (observer only)
  ----------------------------------------------------- */
  if (wrap.dataset.scroll === "true") {
    const threshold = parseFloat(wrap.dataset.threshold) || 0.6;
    const parent = wrap.closest(".hw-player-parent") || wrap;

    const attachObserver = () => {
      if (observers.has(videoId)) return;

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
    };

    if (!splashActive || allowDuringSplash) {
      attachObserver();
    } else {
      const onUnlock = () => {
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
    players.forEach((_, id) => destroyCFVideoPlayer(id));
    players.clear();
    observers.clear();
    firstVideoGranted = false;
  });
}
