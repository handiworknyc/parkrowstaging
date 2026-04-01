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
  SPLASH_FADE_DURATION: 1100,
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
  earlyLockActive: boolean;
};

const state: ScrollLockState = {
  locked: false,
  unlockTimer: null,
  splashTimer: null,
  locoScroll: null,
  useNativeLock: false,
  earlyLockActive: false,
};

// ------------------------------------
// HELPERS
// ------------------------------------
function isHome(): boolean {
  return HW.$html.classList.contains("home");
}

function isFirstLoad(): boolean {
  return HW.$html.classList.contains("first-load");
}

function isSplashDismissed(): boolean {
  return HW.$html.classList.contains("splash-dismissed");
}

function hasSplashScrollLockClass(): boolean {
  return HW.$html.classList.contains("splash-scroll-lock");
}

function hasEarlySplashLock(): boolean {
  return isHome() && hasSplashScrollLockClass();
}

function syncEarlyLockState(): boolean {
  state.earlyLockActive = hasEarlySplashLock();
  return state.earlyLockActive;
}

function markSplashDismissed(): void {
  if (!isHome()) return;

  HW.$html.classList.add("splash-dismissed");
  (window as any).hwSplashActive = false;
}

function releaseEarlySplashLock(): void {
  if (!hasSplashScrollLockClass()) return;

  HW.$html.classList.remove("splash-scroll-lock");
  state.earlyLockActive = false;
}

function shouldLock(): boolean {
  const home = isHome();
  const splashDismissed = isSplashDismissed();
  const splashScrollLock = hasSplashScrollLockClass();

  log("shouldLock check:", { home, splashDismissed, splashScrollLock });

  if (!home || !splashScrollLock || splashDismissed) return false;

  return true;
}

function clearTimers(): void {
  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  if (state.splashTimer) clearTimeout(state.splashTimer);

  state.unlockTimer = null;
  state.splashTimer = null;
}

// ------------------------------------
// NATIVE SCROLL LOCK (CLASS-BASED)
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

  // Use CSS class on HTML instead of direct body styles
  HW.$html.style.setProperty('--scroll-lock-offset', `-${scrollY}px`);

  addScrollPrevention();
}

function unlockNativeScroll(): void {
  removeScrollPrevention();
  
  window.scrollTo(0, scrollY);
  
  // Clean up CSS variable
  HW.$html.style.removeProperty('--scroll-lock-offset');
}

// ------------------------------------
// UNIFIED LOCK / UNLOCK
// ------------------------------------
export function lockScroll(): void {
  if (state.locked) {
    log("Already locked, skipping");
    return;
  }

  syncEarlyLockState();
  state.locked = true;
  state.useNativeLock = false;

  if (state.locoScroll) {
    requestAnimationFrame(() => state.locoScroll?.stop());
  } else if (!state.earlyLockActive) {
    // Only apply native lock if early lock didn't already do it
    state.useNativeLock = true;
    lockNativeScroll();
  }
  
  log("Lock applied", { useNativeLock: state.useNativeLock, earlyLockActive: state.earlyLockActive });
}

export function unlockScroll(source = "unknown"): void {
  syncEarlyLockState();

  if (!state.locked && !state.earlyLockActive) {
    log("Not locked, skipping unlock");
    return;
  }

  log("Unlock scroll:", source);

  markSplashDismissed();
  releaseEarlySplashLock();
  state.locked = false;

  if (state.useNativeLock) {
    unlockNativeScroll();
  } else if (state.locoScroll) {
    state.locoScroll.start();
  }

  clearTimers();
  
  log("Unlock complete");
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
export function initScrollLock(locoInstance?: any): void {
  syncEarlyLockState();

  log("initScrollLock called", { 
    hasLoco: !!locoInstance,
    isHome: isHome(),
    isFirstLoad: isFirstLoad(),
    currentlyLocked: state.locked,
    earlyLockActive: state.earlyLockActive
  });
  
  state.locoScroll = locoInstance || null;

  if (state.earlyLockActive && isSplashDismissed()) {
    log("Splash already dismissed before lock init, unlocking early lock");
    unlockScroll("splash-already-dismissed");
    return;
  }

  if (!shouldLock()) {
    log("Should not lock, exiting");
    return;
  }

  // If early lock is active, just mark as locked and set up unlock timer
  if (state.earlyLockActive) {
    log("Early lock detected, setting locked state");
    state.locked = true;
    
    // If we have Locomotive and not on iOS, stop it
    if (locoInstance && !isIOS) {
      locoInstance.stop();
    }
  } else if (!state.locked) {
    // No early lock, apply lock now
    lockScroll();
  }

  clearTimers();

  state.unlockTimer = setTimeout(() => {
    unlockScroll("timeout");
  }, CONFIG.UNLOCK_TIMEOUT);
  
  log("Lock initialized with timeout");
}

// ------------------------------------
// SPLASH INTEGRATION
// ------------------------------------
export function setupSplashListener(): void {
  window.addEventListener("splash:dismiss", (e: any) => {
    log("splash:dismiss event received", { 
      shouldLock: shouldLock(),
      locked: state.locked 
    });
    
    // Honor splash dismissal whenever scroll is actively locked. Re-checking
    // first-load/home state here can fail after the splash timer fires.
    if (!state.locked) {
      log("Ignoring splash:dismiss - scroll is not locked");
      return;
    }

    clearTimers();

    state.splashTimer = setTimeout(() => {
      unlockScroll(e?.detail?.source || "splash");
    }, CONFIG.SPLASH_FADE_DURATION);
  });
  
  log("Splash listener setup complete");
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
