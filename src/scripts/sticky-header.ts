// /src/scripts/sticky-header.ts
// Mob bottom bar now handled by mob-bottom-bar-scrolltrigger.ts

const DEBUG = false;

function dbg(...args: any[]) {
  if (DEBUG) console.log('[StickyHeader]', ...args);
}

// ------------------------------------
// TYPES
// ------------------------------------
type HeaderConfig = {
  selector: string;
  bannerScroll?: boolean;
};

type HeaderState = {
  element: HTMLElement;
  hidden: boolean;
  bannerScroll: boolean;
};

type StickyState = {
  installed: boolean;
  headers: Map<string, HeaderState>;
  lastY: number;
  ticking: boolean;
  observer?: MutationObserver;
  footerObserver?: IntersectionObserver;
};

declare global {
  interface Window {
    __stickyHeaderState?: StickyState;
  }
}

// ------------------------------------
// CONSTANTS
// ------------------------------------
const CONFIG = {
  HIDE_AFTER: 64,
  DOWN_THRESHOLD: 12,
  UP_THRESHOLD: 6,
  FOOTER_ROOT_MARGIN: "0px 0px 300px 0px",
  BANNER_SCROLL_MAX: 100,
} as const;

// ------------------------------------
// HELPERS
// ------------------------------------
function getScrollY(): number {
  return (
    (document.scrollingElement || document.documentElement).scrollTop ||
    window.scrollY ||
    0
  );
}

function normalizeConfig(
  config: string | string[] | HeaderConfig | HeaderConfig[]
): HeaderConfig[] {
  const configs = Array.isArray(config) ? config : [config];
  
  return configs.map((item) =>
    typeof item === "string"
      ? { selector: item, bannerScroll: true }
      : { bannerScroll: true, ...item }
  );
}

// ------------------------------------
// STATE MANAGEMENT
// ------------------------------------
function getState(): StickyState {
  return (window.__stickyHeaderState ??= {
    installed: false,
    headers: new Map(),
    lastY: 0,
    ticking: false,
  });
}

function setHeaderHidden(state: StickyState, key: string, hidden: boolean) {
  const headerState = state.headers.get(key);
  if (!headerState || headerState.hidden === hidden) return;

  // ✅ DON'T hide header during view transitions
  const isTransitioning = headerState.element.hasAttribute("data-transitioning");
  if (isTransitioning && hidden) {
    return; // Skip hiding during transition
  }

  headerState.hidden = hidden;
  headerState.element.classList.toggle("is-hidden", hidden);
}

function updateBannerScroll(element: HTMLElement, scrollY: number) {
  const progress = Math.min(1, Math.max(0, scrollY / CONFIG.BANNER_SCROLL_MAX));
  element.style.setProperty("--bannerScroll", String(progress));
}

// ------------------------------------
// SCROLL LOGIC
// ------------------------------------
function createScrollHandler(state: StickyState) {
  function onScrollRaf() {
    const y = getScrollY();
    const dy = y - state.lastY;

    const shouldHide = dy > CONFIG.DOWN_THRESHOLD && y > CONFIG.HIDE_AFTER;
    const shouldShow = dy < -CONFIG.UP_THRESHOLD || y <= 0;

    state.headers.forEach((headerState, key) => {
      if (shouldHide) {
        setHeaderHidden(state, key, true);
      } else if (shouldShow) {
        setHeaderHidden(state, key, false);
      }

      if (headerState.bannerScroll) {
        updateBannerScroll(headerState.element, y);
      }
    });

    state.lastY = y;
    state.ticking = false;
  }

  function onScroll() {
    if (state.ticking) return;
    state.ticking = true;
    requestAnimationFrame(onScrollRaf);
  }

  return { onScroll, onScrollRaf };
}

// ------------------------------------
// HEADER BINDING
// ------------------------------------
function bindHeader(
  state: StickyState,
  el: HTMLElement,
  key: string,
  bannerScroll: boolean
) {
  state.headers.set(key, {
    element: el,
    hidden: false,
    bannerScroll,
  });

  el.classList.remove("is-hidden");
}

function cleanupStaleHeaders(state: StickyState) {
  state.headers.forEach((headerState, key) => {
    if (!document.body.contains(headerState.element)) {
      state.headers.delete(key);
    }
  });
}

// ------------------------------------
// OBSERVERS
// ------------------------------------
function watchFooter(state: StickyState) {
  state.footerObserver?.disconnect();

  const footer = document.querySelector("#footer");
  if (!footer) return;

  state.footerObserver = new IntersectionObserver(
    ([entry]) => {
      document.documentElement.classList.toggle(
        "footer-visible",
        entry.isIntersecting
      );
    },
    {
      rootMargin: CONFIG.FOOTER_ROOT_MARGIN,
      threshold: 0,
    }
  );

  state.footerObserver.observe(footer);
}

function watchForHeaders(
  state: StickyState,
  configs: HeaderConfig[],
  onScrollRaf: () => void
) {
  state.lastY = getScrollY();

  configs.forEach(({ selector, bannerScroll = true }) => {
    const elements = document.querySelectorAll<HTMLElement>(selector);

    elements.forEach((el, idx) => {
      const key = `${selector}[${idx}]`;
      const existing = state.headers.get(key);

      if (!existing || existing.element !== el) {
        bindHeader(state, el, key, bannerScroll);
      }
    });
  });

  cleanupStaleHeaders(state);

  state.observer?.disconnect();

  state.observer = new MutationObserver(() => {
    watchForHeaders(state, configs, onScrollRaf);
  });

  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  requestAnimationFrame(onScrollRaf);
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
function initAll(
  state: StickyState,
  configs: HeaderConfig[],
  onScrollRaf: () => void
) {
  watchForHeaders(state, configs, onScrollRaf);
  watchFooter(state);
}

function attachEventListeners(
  state: StickyState,
  configs: HeaderConfig[],
  onScroll: () => void,
  onScrollRaf: () => void
) {
  const reinit = () => initAll(state, configs, onScrollRaf);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  window.addEventListener("astro:after-swap", reinit);
  window.addEventListener("astro:page-load", reinit);
  window.addEventListener("popstate", reinit);

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      reinit();
    } else {
      requestAnimationFrame(onScrollRaf);
    }
  });
}

// ------------------------------------
// MAIN EXPORT
// ------------------------------------
export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("init");

  const state = getState();

  if (state.installed) {
    dbg("already installed, skipping");
    return;
  }

  state.installed = true;

  const configs = normalizeConfig(config);
  const { onScroll, onScrollRaf } = createScrollHandler(state);

  initAll(state, configs, onScrollRaf);
  attachEventListeners(state, configs, onScroll, onScrollRaf);
}

// ------------------------------------
// AUTO-INIT
// ------------------------------------
initStickyHeader([
  { selector: "#header", bannerScroll: true },
  // Mob bottom bar now handled by GSAP ScrollTrigger
]);