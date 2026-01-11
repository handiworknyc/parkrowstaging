// /src/scripts/sticky-header.ts

// ------------------------------------
// DEBUG FLAG
// ------------------------------------
const DEBUG = false; // <— flip to true for logs

function dbg(...args: any[]) {
  if (DEBUG) console.log(...args);
}
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
};

declare global { interface Window { __stickyHeaderState?: StickyState } }

export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("[sticky] init");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const S = (window.__stickyHeaderState ??=
    { installed: false, headers: new Map(), lastY: 0, ticking: false });

  if (S.installed) return;
  S.installed = true;

  // normalize config to array of HeaderConfig objects
  const configs: HeaderConfig[] = (Array.isArray(config) ? config : [config]).map(item =>
    typeof item === "string" ? { selector: item, bannerScroll: true } : { bannerScroll: true, ...item }
  );

  // thresholds
  const HIDE_AFTER = 64;
  const DOWN_THRESHOLD = 12;
  const UP_THRESHOLD = 6;

  const scroller = document.scrollingElement || document.documentElement;

  dbg("[sticky] scroller =", scroller);

  const getY = () =>
    scroller?.scrollTop || document.documentElement.scrollTop || window.scrollY || 0;

  function setHidden(key: string, next: boolean) {
    const state = S.headers.get(key);
    if (!state) return;
    if (state.hidden === next) return;

    state.hidden = next;

    if (next) {
      state.element.classList.add("is-hidden");
    } else {
      state.element.classList.remove("is-hidden");
    }

    dbg("[sticky] setHidden:", key, next);
  }

  function onScrollRaf() {
    const y = getY();
    const dy = y - S.lastY;

    dbg("[sticky] y=", y, "dy=", dy);

    const shouldHide = dy > DOWN_THRESHOLD && y > HIDE_AFTER;
    const shouldShow = dy < -UP_THRESHOLD || y <= 0;

    // batch DOM updates for all headers
    S.headers.forEach((state, key) => {
      if (shouldHide) {
        setHidden(key, true);
      } else if (shouldShow) {
        setHidden(key, false);
      }

      // update CSS custom property only if enabled for this element
      if (state.bannerScroll) {
        const progress = Math.min(1, Math.max(0, y / 100));
        state.element.style.setProperty("--bannerScroll", String(progress));
      }
    });

    S.lastY = y;
    S.ticking = false;
  }

  function onScroll() {
    if (S.ticking) return;
    S.ticking = true;
    requestAnimationFrame(onScrollRaf);
  }

  function bindHeader(el: HTMLElement, key: string, bannerScroll: boolean) {
    dbg("[sticky] bindHeader:", key, el, "bannerScroll:", bannerScroll);
    
    S.headers.set(key, {
      element: el,
      hidden: false,
      bannerScroll
    });

    el.classList.remove("is-hidden");
  }

  function watchForHeaders() {
    const currentY = getY();
    S.lastY = currentY;

    // find and bind all matching elements
    configs.forEach(({ selector, bannerScroll = true }) => {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach((el, idx) => {
        const key = `${selector}[${idx}]`;
        
        // only bind if not already tracked or if element changed
        const existing = S.headers.get(key);
        if (!existing || existing.element !== el) {
          bindHeader(el, key, bannerScroll);
        }
      });
    });

    // clean up removed elements
    S.headers.forEach((state, key) => {
      if (!document.body.contains(state.element)) {
        S.headers.delete(key);
        dbg("[sticky] removed:", key);
      }
    });

    S.observer?.disconnect?.();
    S.observer = new MutationObserver(() => {
      // check if any tracked elements were removed
      let needsRebind = false;
      S.headers.forEach(state => {
        if (!document.body.contains(state.element)) {
          needsRebind = true;
        }
      });

      if (needsRebind) {
        watchForHeaders();
      } else {
        // check for new elements matching our selectors
        configs.forEach(({ selector }) => {
          const elements = document.querySelectorAll<HTMLElement>(selector);
          if (elements.length !== Array.from(S.headers.keys()).filter(k => k.startsWith(selector)).length) {
            watchForHeaders();
          }
        });
      }
    });

    S.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    requestAnimationFrame(onScrollRaf);
  }

  // init
  watchForHeaders();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  window.addEventListener("astro:after-swap", watchForHeaders);
  window.addEventListener("astro:page-load", watchForHeaders);
  window.addEventListener("popstate", watchForHeaders);

  window.addEventListener("pageshow", e => {
    if (e.persisted) watchForHeaders();
    else requestAnimationFrame(onScrollRaf);
  });
}


initStickyHeader([
  { selector: "#header", bannerScroll: true },
  { selector: ".mob-bottom-bar", bannerScroll: false },
]);