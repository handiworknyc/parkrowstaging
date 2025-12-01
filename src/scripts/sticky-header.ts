// /src/scripts/sticky-header.ts

// ------------------------------------
// DEBUG FLAG
// ------------------------------------
const DEBUG = false; // <— flip to true for logs

function dbg(...args: any[]) {
  if (DEBUG) console.log(...args);
}
// ------------------------------------

type StickyState = {
  installed: boolean;
  header: HTMLElement | null;
  hidden: boolean;
  lastY: number;
  ticking: boolean;
  observer?: MutationObserver;
};

declare global { interface Window { __stickyHeaderState?: StickyState } }

export default function initStickyHeader() {
  dbg("[sticky] init");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const S = (window.__stickyHeaderState ??=
    { installed: false, header: null, hidden: false, lastY: 0, ticking: false });

  if (S.installed) return;
  S.installed = true;

  // thresholds
  const HIDE_AFTER = 64;
  const DOWN_THRESHOLD = 12;
  const UP_THRESHOLD = 6;

  const scroller = document.scrollingElement || document.documentElement;

  dbg("[sticky] scroller =", scroller);

  const getY = () =>
    scroller?.scrollTop || document.documentElement.scrollTop || window.scrollY || 0;

  function setHidden(next: boolean) {
    if (!S.header) return;
    if (S.hidden === next) return;

    S.hidden = next;

    if (next) {
      S.header.classList.add("is-hidden");
    } else {
      S.header.classList.remove("is-hidden");
    }

    dbg("[sticky] setHidden:", next);
  }

  function onScrollRaf() {
    const y = getY();
    const dy = y - S.lastY;

    dbg("[sticky] y=", y, "dy=", dy, "hidden=", S.hidden);

    if (dy > DOWN_THRESHOLD && y > HIDE_AFTER) {
      setHidden(true);
    } else if (dy < -UP_THRESHOLD) {
      setHidden(false);
    } else if (y <= 0) {
      setHidden(false);
    }

    if (S.header) {
      const progress = Math.min(1, Math.max(0, y / 100));
      S.header.style.setProperty("--bannerScroll", String(progress));
    }

    S.lastY = y;
    S.ticking = false;
  }

  function onScroll() {
    if (S.ticking) return;
    S.ticking = true;
    requestAnimationFrame(onScrollRaf);
  }

  function bindHeader(el: HTMLElement) {
    dbg("[sticky] bindHeader:", el);
    S.header = el;
    S.hidden = false;
    S.lastY = getY();
    el.classList.remove("is-hidden");
    requestAnimationFrame(onScrollRaf);
  }

  function watchForHeader() {
    const el = document.getElementById("header");
    if (el) bindHeader(el);

    S.observer?.disconnect?.();
    S.observer = new MutationObserver(() => {
      if (!S.header || !document.body.contains(S.header)) {
        const h = document.getElementById("header");
        if (h) bindHeader(h);
      }
    });

    S.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // init
  watchForHeader();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  window.addEventListener("astro:after-swap", watchForHeader);
  window.addEventListener("astro:page-load", watchForHeader);
  window.addEventListener("popstate", watchForHeader);

  window.addEventListener("pageshow", e => {
    if (e.persisted) watchForHeader();
    else requestAnimationFrame(onScrollRaf);
  });
}
