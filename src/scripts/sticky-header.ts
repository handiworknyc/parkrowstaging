// /src/scripts/sticky-header.ts

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
  observer?: MutationObserver;
  footerObserver?: IntersectionObserver;
  mobObserver?: IntersectionObserver;
};

declare global {
  interface Window {
    __stickyHeaderState?: StickyState;
  }
}

export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("[sticky] init");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const S =
    (window.__stickyHeaderState ??=
      {
        installed: false,
        headers: new Map(),
        lastY: 0,
        ticking: false,
      });

  if (S.installed) return;
  S.installed = true;

  const configs: HeaderConfig[] = (
    Array.isArray(config) ? config : [config]
  ).map((item) =>
    typeof item === "string"
      ? { selector: item, bannerScroll: true }
      : { bannerScroll: true, ...item }
  );

  const HIDE_AFTER = 64;
  const DOWN_THRESHOLD = 12;
  const UP_THRESHOLD = 6;

  const scroller = document.scrollingElement || document.documentElement;

  const getY = () =>
    scroller?.scrollTop ||
    document.documentElement.scrollTop ||
    window.scrollY ||
    0;

  function setHidden(key: string, next: boolean) {
    const state = S.headers.get(key);
    if (!state || state.hidden === next) return;

    state.hidden = next;

    state.element.classList.toggle("is-hidden", next);

    dbg("[sticky] setHidden:", key, next);
  }

  function onScrollRaf() {
    const y = getY();
    const dy = y - S.lastY;

    const shouldHide = dy > DOWN_THRESHOLD && y > HIDE_AFTER;
    const shouldShow = dy < -UP_THRESHOLD || y <= 0;

    S.headers.forEach((state, key) => {
      if (shouldHide) setHidden(key, true);
      else if (shouldShow) setHidden(key, false);

      if (state.bannerScroll) {
        const progress = Math.min(1, Math.max(0, y / 100));
        state.element.style.setProperty(
          "--bannerScroll",
          String(progress)
        );
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
      bannerScroll,
    });

    el.classList.remove("is-hidden");
  }

  // ---------------------------------------------------------
  // FOOTER VISIBILITY
  // ---------------------------------------------------------
  function watchFooter() {
    S.footerObserver?.disconnect();

    const footer = document.querySelector("#footer");
    if (!footer) return;

    S.footerObserver = new IntersectionObserver(
      ([entry]) => {
        document.documentElement.classList.toggle(
          "footer-visible",
          entry.isIntersecting
        );
      },
      {
        root: null,
        rootMargin: "0px 0px 300px 0px",
        threshold: 0,
      }
    );

    S.footerObserver.observe(footer);
  }

  // ---------------------------------------------------------
  // MOBILE BOTTOM BAR — STICKY DETECTION
  // ---------------------------------------------------------
  function watchMobBottomBar() {
    S.mobObserver?.disconnect();

    const bar = document.querySelector<HTMLElement>(".mob-bottom-bar");
    if (!bar) return;

    let sentinel = bar.nextElementSibling as HTMLElement | null;

	S.mobObserver = new IntersectionObserver(
      ([entry]) => {
        const unstuck = entry.isIntersecting;

        bar.classList.toggle(
          "mob-bar-unstuck",
          unstuck
        );

      },
      {
        root: null,
        threshold: 0,
      }
    );

    S.mobObserver.observe(sentinel);
  }

  // ---------------------------------------------------------
  // HEADER DISCOVERY
  // ---------------------------------------------------------
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

    S.observer?.disconnect();

    S.observer = new MutationObserver(() => {
      watchForHeaders();
      watchMobBottomBar();
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
    watchMobBottomBar();
  }

  initAll();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  window.addEventListener("astro:after-swap", initAll);
  window.addEventListener("astro:page-load", initAll);
  window.addEventListener("popstate", initAll);

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) initAll();
    else requestAnimationFrame(onScrollRaf);
  });
}

initStickyHeader([
  { selector: "#header", bannerScroll: true },
  { selector: ".mob-bottom-bar", bannerScroll: false },
]);
