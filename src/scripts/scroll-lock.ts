const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log("[ScrollLock]", ...args);

// ------------------------------------
// DEVICE FLAGS (GLOBAL)
// ------------------------------------
const isMobile =
  typeof HW !== "undefined" && HW.isMobile === true;

const isIpad =
  typeof HW !== "undefined" && HW.isIpad === true;

const isIOS = isMobile || isIpad;

// ------------------------------------
// CONFIGURATION
// ------------------------------------
const CONFIG = {
  SPLASH_FADE_DURATION: isIOS ? 650 : 1000,
  UNLOCK_TIMEOUT: 6600,
  WAIT_FOR_SPLASH: true,
} as const;

// ------------------------------------
// STATE
// ------------------------------------
type ScrollLockState = {
  locked: boolean;
  unlockTimer: ReturnType<typeof setTimeout> | null;
  splashTimer: ReturnType<typeof setTimeout> | null;
  locoScroll: any | null;
  useNativeLock: boolean;
};

const state: ScrollLockState = {
  locked: false,
  unlockTimer: null,
  splashTimer: null,
  locoScroll: null,
  useNativeLock: false,
};

// ------------------------------------
// HELPERS
// ------------------------------------
function isHome(): boolean {
  return document.body.classList.contains("home");
}

function isFirstLoad(): boolean {
  return document.body.classList.contains("first-load");
}

function shouldLock(): boolean {
  const home = isHome();
  const firstLoad = isFirstLoad();

  log("shouldLock check:", { home, firstLoad });

  if (!home || !firstLoad) return false;

  return true;
}

function clearTimers(): void {
  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  if (state.splashTimer) clearTimeout(state.splashTimer);

  state.unlockTimer = null;
  state.splashTimer = null;
}

// ------------------------------------
// NATIVE SCROLL LOCK
// ------------------------------------
let scrollY = 0;
let scrollPreventListeners: Array<() => void> = [];

function preventScroll(e: Event): void {
  if (!state.locked) return;

  e.preventDefault();
  e.stopPropagation();
}

function addScrollPrevention(): void {
  const options = { passive: false, capture: false };

  window.addEventListener("wheel", preventScroll, options as any);
  window.addEventListener("touchmove", preventScroll, options as any);
  window.addEventListener("scroll", preventScroll, options as any);

  scrollPreventListeners.push(
    () => window.removeEventListener("wheel", preventScroll, options as any),
    () => window.removeEventListener("touchmove", preventScroll, options as any),
    () => window.removeEventListener("scroll", preventScroll, options as any)
  );
}

function removeScrollPrevention(): void {
  scrollPreventListeners.forEach(fn => fn());
  scrollPreventListeners = [];
}

function lockNativeScroll(): void {
  scrollY = window.scrollY;

  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";
  document.body.style.overflowY = "scroll";

  addScrollPrevention();
}

function unlockNativeScroll(): void {
  removeScrollPrevention();

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.overflowY = "";

  window.scrollTo(0, scrollY);
}

// ------------------------------------
// UNIFIED LOCK / UNLOCK
// ------------------------------------
export function lockScroll(): void {
  if (state.locked) return;

  state.locked = true;
  document.body.classList.add("scroll-locked");

  if (state.locoScroll) {
    state.useNativeLock = false;
    requestAnimationFrame(() => state.locoScroll?.stop());
  } else {
    state.useNativeLock = true;
    lockNativeScroll();
  }
}

export function unlockScroll(source = "unknown"): void {
  if (!state.locked) return;

  log("Unlock scroll:", source);

  state.locked = false;
  document.body.classList.remove("scroll-locked");
  document.body.classList.add("scroll-unlocked");

  clearTimers();

  if (state.useNativeLock) {
    unlockNativeScroll();
  } else if (state.locoScroll) {
    state.locoScroll.start();
  }
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
export function initScrollLock(locoInstance?: any): void {
  state.locoScroll = locoInstance || null;

  if (!shouldLock()) return;

  const splashActive = (window as any).hwSplashActive === true;

  lockScroll();

  if (CONFIG.WAIT_FOR_SPLASH && splashActive) {
    log("Waiting for splash dismiss");
    return;
  }

  clearTimers();

  state.unlockTimer = setTimeout(() => {
    unlockScroll("timeout");
  }, CONFIG.UNLOCK_TIMEOUT);
}

// ------------------------------------
// SPLASH INTEGRATION
// ------------------------------------
export function setupSplashListener(): void {
  window.addEventListener("splash:dismiss", (e: any) => {
    if (!shouldLock() || !state.locked) return;

    clearTimers();

    state.splashTimer = setTimeout(() => {
      unlockScroll(e?.detail?.source || "splash");
    }, CONFIG.SPLASH_FADE_DURATION);
  });
}

// ------------------------------------
// PUBLIC API
// ------------------------------------
export function isScrollLocked(): boolean {
  return state.locked;
}

export function getScrollLockConfig() {
  return { ...CONFIG };
}

setupSplashListener();
