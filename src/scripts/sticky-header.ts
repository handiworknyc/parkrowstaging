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
  headers: Map<string, HeaderState>;
  lastY: number;
  ticking: boolean;
  footerVisible: boolean;
  observer?: MutationObserver;
  footerObserver?: IntersectionObserver;
  configs?: HeaderConfig[];
};

declare global { interface Window { __stickyHeaderState?: StickyState } }

function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("🚀 [sticky] initStickyHeader called");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dbg("🛑 [sticky] Reduced motion detected, exiting.");
    return;
  }

  const S = (window.__stickyHeaderState ??= { 
    headers: new Map(), 
    lastY: 0, 
    ticking: false,
    footerVisible: false
  });

  const configs: HeaderConfig[] = (Array.isArray(config) ? config : [config]).map(item =>
    typeof item === "string" ? { selector: item, bannerScroll: true } : { bannerScroll: true, ...item }
  );
  
  // Store configs for later use
  S.configs = configs;

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
  // Cleanup Function
  // ---------------------------------------------------------
  function cleanup() {
    dbg("🧹 [sticky] Cleanup running...");
    
    if (S.footerObserver) {
      dbg("   - Disconnecting footer observer");
      S.footerObserver.disconnect();
      S.footerObserver = undefined;
    }
    
    if (S.observer) {
      dbg("   - Disconnecting mutation observer");
      S.observer.disconnect();
      S.observer = undefined;
    }
    
    // Reset footer state
    S.footerVisible = false;
    document.documentElement.classList.remove("footer-visible");
    
    dbg("✅ [sticky] Cleanup complete");
  }

  // ---------------------------------------------------------
  // Footer Observer Logic
  // ---------------------------------------------------------
  function watchFooter() {
    dbg("👀 [sticky] watchFooter running...");
    
    const footer = document.querySelector("#footer");
    
    if (!footer) {
        console.error("❌ [sticky] Critical: #footer element NOT FOUND in DOM.");
        return;
    } else {
        dbg("✅ [sticky] Found #footer element", footer);
    }

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

  function reinit() {
    dbg(`🏁 [sticky] Reinitializing...`);
    cleanup();
    
    setTimeout(() => {
        watchForHeaders();
        watchFooter();
    }, 50);
  }

  // Expose reinit globally
  (window as any).__stickyHeaderReinit = reinit;

  // Initial setup
  watchForHeaders();
  watchFooter();
  
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  
  window.addEventListener("pageshow", e => {
    if (e.persisted) reinit();
    else requestAnimationFrame(onScrollRaf);
  });
}

// Initialize on first load
initStickyHeader([
  { selector: "#header", bannerScroll: true },
  { selector: ".mob-bottom-bar", bannerScroll: false },
]);

// Handle Astro view transitions
document.addEventListener("astro:before-swap", () => {
  dbg("🔄 [sticky] Event: astro:before-swap");
  const state = window.__stickyHeaderState;
  if (state?.footerObserver) {
    state.footerObserver.disconnect();
  }
  if (state?.observer) {
    state.observer.disconnect();
  }
});

document.addEventListener("astro:after-swap", () => {
  alert("astro:after-swap fired!");
  dbg("🔁 [sticky] Event: astro:after-swap");
  (window as any).__stickyHeaderReinit?.();
});

document.addEventListener("astro:page-load", () => {
  alert("astro:page-load fired!");
  dbg("📄 [sticky] Event: astro:page-load");
});