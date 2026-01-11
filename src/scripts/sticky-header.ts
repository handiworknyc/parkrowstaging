// ------------------------------------
// DEBUG FLAG - ENABLED
// ------------------------------------
const DEBUG = true;

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
  footerVisible: boolean;
  observer?: MutationObserver;
  footerObserver?: IntersectionObserver;
};

declare global { interface Window { __stickyHeaderState?: StickyState } }

export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("🚀 [sticky] initStickyHeader called");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dbg("🛑 [sticky] Reduced motion detected, exiting.");
    return;
  }

  const S = (window.__stickyHeaderState ??= { 
    installed: false, 
    headers: new Map(), 
    lastY: 0, 
    ticking: false,
    footerVisible: false
  });

  // NOTE: If installed is true, we return. 
  // Make sure this isn't preventing re-binding if that's your intention.
  if (S.installed) {
    dbg("ℹ️ [sticky] Already installed globally.");
    return;
  }
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

    dbg(`[sticky] setHidden: ${key} -> ${next}`);
  }

  function onScrollRaf() {
    const y = getY();
    const dy = y - S.lastY;
    
    // Commented out to prevent console spam, uncomment if debugging scroll delta
    // dbg("[sticky] y=", y, "dy=", dy);

    const shouldHide = dy > DOWN_THRESHOLD && y > HIDE_AFTER;
    const shouldShow = dy < -UP_THRESHOLD || y <= 0;

    S.headers.forEach((state, key) => {
      const isMobBottomBar = key.startsWith(".mob-bottom-bar");

      if (isMobBottomBar && S.footerVisible) {
         setHidden(key, false);
      } 
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
    dbg(`🔗 [sticky] Binding header: ${key}`);
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
    dbg("👀 [sticky] watchFooter running...");
    
    // 1. Disconnect previous
    if(S.footerObserver) {
        dbg("🧹 [sticky] Disconnecting old footer observer");
        S.footerObserver.disconnect();
    }

    // 2. Find new footer
    const footer = document.querySelector("#footer");
    
    if (!footer) {
        console.error("❌ [sticky] Critical: #footer element NOT FOUND in DOM.");
        return;
    } else {
        dbg("✅ [sticky] Found #footer element", footer);
    }

    // 3. Create Observer
    S.footerObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      
      dbg(`⚡ [sticky] Footer Intersection Change: isIntersecting=${entry.isIntersecting}`);
      
      S.footerVisible = entry.isIntersecting; 

      if (entry.isIntersecting) {
        document.documentElement.classList.add("footer-visible");
        
        S.headers.forEach((_, key) => {
            if (key.startsWith(".mob-bottom-bar")) {
                dbg(`🔓 [sticky] Forcing ${key} visible due to footer`);
                setHidden(key, false);
            }
        });

      } else {
        document.documentElement.classList.remove("footer-visible");
      }
    }, {
      root: null,
      // DEBUG NOTE: Check if this string is valid for iOS. 
      // Sometimes just "0px" or "100%" is safer than mixed syntax if not working.
      rootMargin: "0px 0px 1000px 0px", 
      threshold: 0
    });

    S.footerObserver.observe(footer);
    dbg("🔭 [sticky] Observer attached to footer");
  }

  function watchForHeaders() {
    dbg("🔎 [sticky] watchForHeaders called");
    const currentY = getY();
    S.lastY = currentY;

    configs.forEach(({ selector, bannerScroll = true }) => {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      dbg(`   - found ${elements.length} elements for selector: ${selector}`);
      
      elements.forEach((el, idx) => {
        const key = `${selector}[${idx}]`;
        const existing = S.headers.get(key);
        if (!existing || existing.element !== el) {
          bindHeader(el, key, bannerScroll);
        }
      });
    });

    // Cleanup removed elements
    S.headers.forEach((state, key) => {
      if (!document.body.contains(state.element)) {
        dbg(`🗑️ [sticky] Removing stale header: ${key}`);
        S.headers.delete(key);
      }
    });

    S.observer?.disconnect?.();
    S.observer = new MutationObserver(() => {
        // Reduced log noise here, but can enable if DOM isn't updating
        // dbg("[sticky] MutationObserver triggered"); 
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
            const currentCount = elements.length;
            const storedCount = Array.from(S.headers.keys()).filter(k => k.startsWith(selector)).length;
            
            if (currentCount !== storedCount) {
                dbg(`🔄 [sticky] Re-run watchForHeaders (Count mismatch: ${currentCount} vs ${storedCount})`);
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

  function initAll(eventSource?: any) {
    // If this comes from an event, log the event type
    const eventName = eventSource?.type || "direct call";
    dbg(`🏁 [sticky] initAll triggered via: ${eventName}`);
    
    // Small timeout to allow DOM to settle on iOS after swap
    setTimeout(() => {
        watchForHeaders();
        watchFooter();
    }, 50);
  }

  initAll();
  
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  
  // LOGGING ADDED HERE
  window.addEventListener("astro:after-swap", (e) => {
      dbg("🔁 [sticky] Event: astro:after-swap");
      initAll(e);
  });
  window.addEventListener("astro:page-load", (e) => {
      dbg("📄 [sticky] Event: astro:page-load");
      initAll(e);
  });
  
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