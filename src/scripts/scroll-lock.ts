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
  earlyLockActive: boolean;
};

const state: ScrollLockState = {
  locked: false,
  unlockTimer: null,
  splashTimer: null,
  locoScroll: null,
  useNativeLock: false,
  earlyLockActive: typeof window !== "undefined" && 
                   typeof (window as any).__removeScrollLock === "function",
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
  if (state.locked) {
    log("Already locked, skipping");
    return;
  }

  state.locked = true;
  
  // Don't add class if early lock already added it
  if (!state.earlyLockActive) {
    document.body.classList.add("scroll-locked");
  }

  if (state.locoScroll) {
    state.useNativeLock = false;
    requestAnimationFrame(() => state.locoScroll?.stop());
  } else if (!state.earlyLockActive) {
    // Only apply native lock if early lock didn't already do it
    state.useNativeLock = true;
    lockNativeScroll();
  }
  
  log("Lock applied", { useNativeLock: state.useNativeLock, earlyLockActive: state.earlyLockActive });
}

export function unlockScroll(source = "unknown"): void {
  if (!state.locked && !state.earlyLockActive) {
    log("Not locked, skipping unlock");
    return;
  }

  log("Unlock scroll:", source);

  state.locked = false;
  
  // Remove early lock if it exists
  if (state.earlyLockActive && typeof (window as any).__removeScrollLock === "function") {
    log("Removing early lock");
    (window as any).__removeScrollLock();
    state.earlyLockActive = false;
  } else {
    // Normal unlock path
    document.body.classList.remove("scroll-locked");
    document.body.classList.add("scroll-unlocked");
    
    if (state.useNativeLock) {
      unlockNativeScroll();
    } else if (state.locoScroll) {
      state.locoScroll.start();
    }
  }

  clearTimers();
  
  log("Unlock complete");
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
export function initScrollLock(locoInstance?: any): void {
  log("initScrollLock called", { 
    hasLoco: !!locoInstance,
    isHome: isHome(),
    isFirstLoad: isFirstLoad(),
    currentlyLocked: state.locked,
    earlyLockActive: state.earlyLockActive
  });
  
  state.locoScroll = locoInstance || null;

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
    
    if (!shouldLock() || !state.locked) {
      log("Ignoring splash:dismiss - conditions not met");
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