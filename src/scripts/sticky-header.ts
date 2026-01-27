// /src/scripts/sticky-header.ts
// Mob bottom bar now handled by mob-bottom-bar-scrolltrigger.ts

const DEBUG = true; // Set to false in production

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
  
  if (DEBUG) {
    console.log(
      `%c[StickyHeader] setHeaderHidden%c`,
      'color: #4CAF50; font-weight: bold',
      'color: inherit',
      {
        key,
        hidden,
        currentlyHidden: headerState.hidden,
        isTransitioning,
        willApply: !isTransitioning || !hidden
      }
    );
  }

  if (isTransitioning && hidden) {
    dbg('BLOCKED: Not hiding header during transition');
    return; // Skip hiding during transition
  }

  headerState.hidden = hidden;
  headerState.element.classList.toggle("is-hidden", hidden);
  
  if (DEBUG) {
    console.log(
      `%c[StickyHeader] Header class toggled%c`,
      'color: #2196F3; font-weight: bold',
      'color: inherit',
      {
        hidden,
        classList: Array.from(headerState.element.classList)
      }
    );
  }
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

    if (DEBUG && (shouldHide || shouldShow)) {
      console.log(
        `%c[StickyHeader] Scroll evaluation%c`,
        'color: #FF9800; font-weight: bold',
        'color: inherit',
        {
          y,
          dy,
          lastY: state.lastY,
          shouldHide,
          shouldShow,
          threshold: shouldHide ? 'DOWN' : shouldShow ? 'UP' : 'NONE'
        }
      );
    }

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
  dbg('bindHeader', { key, bannerScroll, classList: Array.from(el.classList) });
}

function cleanupStaleHeaders(state: StickyState) {
  state.headers.forEach((headerState, key) => {
    if (!document.body.contains(headerState.element)) {
      dbg('cleanupStaleHeaders: removing', key);
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
  dbg('watchFooter: observing');
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
    dbg('MutationObserver triggered - re-watching headers');
    watchForHeaders(state, configs, onScrollRaf);
  });

  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  requestAnimationFrame(onScrollRaf);
  dbg('watchForHeaders complete', { headerCount: state.headers.size });
}

// ------------------------------------
// INITIALIZATION
// ------------------------------------
function initAll(
  state: StickyState,
  configs: HeaderConfig[],
  onScrollRaf: () => void
) {
  dbg('initAll');
  watchForHeaders(state, configs, onScrollRaf);
  watchFooter(state);
}

function attachEventListeners(
  state: StickyState,
  configs: HeaderConfig[],
  onScroll: () => void,
  onScrollRaf: () => void
) {
  const reinit = () => {
    dbg('reinit triggered');
    initAll(state, configs, onScrollRaf);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  window.addEventListener("astro:after-swap", reinit);
  window.addEventListener("astro:page-load", reinit);
  window.addEventListener("popstate", reinit);

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      dbg('pageshow (persisted)');
      reinit();
    } else {
      requestAnimationFrame(onScrollRaf);
    }
  });

  dbg('attachEventListeners complete');
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
  
  dbg('initStickyHeader complete');
}

// ------------------------------------
// AUTO-INIT
// ------------------------------------
initStickyHeader([
  { selector: "#header", bannerScroll: true },
  // Mob bottom bar now handled by GSAP ScrollTrigger
]);