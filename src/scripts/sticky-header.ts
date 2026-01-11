// ------------------------------------
// DEBUG FLAG
// ------------------------------------
const DEBUG = false;

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
  footerVisible: boolean; // <--- Added this to track state
  observer?: MutationObserver;
  footerObserver?: IntersectionObserver;
};

declare global { interface Window { __stickyHeaderState?: StickyState } }

export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("[sticky] init");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const S = (window.__stickyHeaderState ??= { 
    installed: false, 
    headers: new Map(), 
    lastY: 0, 
    ticking: false,
    footerVisible: false // <--- Initialize
  });

  if (S.installed) return;
  S.installed = true;

  const configs: HeaderConfig[] = (Array.isArray(config) ? config : [config]).map(item =>
    typeof item === "string" ? { selector: item, bannerScroll: true } : { bannerScroll: true, ...item }
  );

  const HIDE_AFTER = 64;
  const DOWN_THRESHOLD = 12;
  const UP_THRESHOLD = 6;

  const scroller = document.scrollingElement || document.documentElement;

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

    S.headers.forEach((state, key) => {
      const isMobBottomBar = key.startsWith(".mob-bottom-bar");

      // LOGIC: If this is the mobile bar and footer is visible, force show
      if (isMobBottomBar && S.footerVisible) {
         setHidden(key, false);
      } 
      // Otherwise, use standard scroll logic
      else {
        if (shouldHide) {
          setHidden(key, true);
        } else if (shouldShow) {
          setHidden(key, false);
        }
      }

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
    S.headers.set(key, {
      element: el,
      hidden: false,
      bannerScroll
    });
    el.classList.remove("is-hidden");
  }

  // ---------------------------------------------------------
  // Footer Observer Logic
  // ---------------------------------------------------------
  function watchFooter() {
    S.footerObserver?.disconnect();

    const footer = document.querySelector("#footer");
    if (!footer) return;

    S.footerObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      S.footerVisible = entry.isIntersecting; // <--- Update global state

      if (entry.isIntersecting) {
        document.documentElement.classList.add("footer-visible");
        
        // IMMEDIATE ACTION: Force mobile bar to show instantly when footer hits
        S.headers.forEach((_, key) => {
            if (key.startsWith(".mob-bottom-bar")) {
                setHidden(key, false);
            }
        });

        dbg("[sticky] Footer entered -> forced .mob-bottom-bar show");
      } else {
        document.documentElement.classList.remove("footer-visible");
        dbg("[sticky] Footer left");
      }
    }, {
      root: null,
      // CHANGED: 1000px means it triggers way before it's on screen. 
      // 0px ensures it happens exactly when the footer enters the viewport.
	  rootMargin: "0px 0px 1000px 0px",
      threshold: 0
    });

    S.footerObserver.observe(footer);
  }

  function watchForHeaders() {
    const currentY = getY();
    S.lastY = currentY;

    configs.forEach(({ selector, bannerScroll = true }) => {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach((el, idx) => {
        const key = `${selector}[${idx}]`;
        const existing = S.headers.get(key);
        if (!existing || existing.element !== el) {
          bindHeader(el, key, bannerScroll);
        }
      });
    });

    S.headers.forEach((state, key) => {
      if (!document.body.contains(state.element)) {
        S.headers.delete(key);
      }
    });

    S.observer?.disconnect?.();
    S.observer = new MutationObserver(() => {
      let needsRebind = false;
      S.headers.forEach(state => {
        if (!document.body.contains(state.element)) {
          needsRebind = true;
        }
      });

      if (needsRebind) {
        watchForHeaders();
      } else {
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

  function initAll() {
    watchForHeaders();
    watchFooter();
  }

  initAll();
  
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  window.addEventListener("astro:after-swap", initAll);
  window.addEventListener("astro:page-load", initAll);
  window.addEventListener("popstate", initAll);
  window.addEventListener("pageshow", e => {
    if (e.persisted) initAll();
    else requestAnimationFrame(onScrollRaf);
  });
}

initStickyHeader([
  { selector: "#header", bannerScroll: true },
  { selector: ".mob-bottom-bar", bannerScroll: false },
]);