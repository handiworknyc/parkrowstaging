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
  configs?: HeaderConfig[]; // Store configs globally
};

declare global { interface Window { __stickyHeaderState?: StickyState; __stickyHeaderReinit?: () => void; } }

export default function initStickyHeader(
  config: string | string[] | HeaderConfig | HeaderConfig[] = "#header"
) {
  dbg("🚀 [sticky] initStickyHeader called");

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  // 1. Initialize State Singleton
  const S = (window.__stickyHeaderState ??= { 
    installed: false,
    headers: new Map(), 
    lastY: 0, 
    ticking: false,
    footerVisible: false
  });

  // 2. Parse and Store Configs (Update them even if installed, in case they changed)
  const configs: HeaderConfig[] = (Array.isArray(config) ? config : [config]).map(item =>
    typeof item === "string" ? { selector: item, bannerScroll: true } : { bannerScroll: true, ...item }
  );
  S.configs = configs; // Save to state for re-use during reinit

  // 3. Prevent Double Installation of Global Listeners
  if (S.installed) {
    dbg("ℹ️ [sticky] Already installed. Running re-initialization only.");
    (window as any).__stickyHeaderReinit?.();
    return;
  }
  S.installed = true;

  const HIDE_AFTER = 64;
  const DOWN_THRESHOLD = 12;
  const UP_THRESHOLD = 6;

  const scroller = document.scrollingElement || document.documentElement;

  const getY = () =>
    scroller?.scrollTop || document.documentElement.scrollTop || window.scrollY || 0;

  function setHidden(key: string, next: boolean) {
    const state = S.headers.get(key);
    if (!state) return;
    
    // Safety check: ensure the element is still in DOM
    if (!document.body.contains(state.element)) {
        S.headers.delete(key);
        return;
    }

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

      // LOGIC: If footer is visible, force SHOW (false)
      if (isMobBottomBar && S.footerVisible) {
         // Only log if we are changing state to avoid spam
         if(state.hidden) dbg(`[sticky] Footer visible -> Forcing SHOW on ${key}`);
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
    
    // CRITICAL FIX: Reset 'hidden' state to false for new elements.
    // New pages start with visible headers. If we inherit 'true' from old state,
    // logic will fail to toggle the class.
    S.headers.set(key, {
      element: el,
      hidden: false, 
      bannerScroll
    });
    
    // Ensure DOM matches state
    el.classList.remove("is-hidden");
  }

  // ---------------------------------------------------------
  // Cleanup Function
  // ---------------------------------------------------------
  function cleanup() {
    dbg("🧹 [sticky] Cleanup running...");
    
    if (S.footerObserver) {
      S.footerObserver.disconnect();
      S.footerObserver = undefined;
    }
    
    if (S.observer) {
      S.observer.disconnect();
      S.observer = undefined;
    }
    
    // Clear Header Map to remove stale references from previous page
    S.headers.clear();
    
    // Reset Footer State
    S.footerVisible = false;
    document.documentElement.classList.remove("footer-visible");
  }

  // ---------------------------------------------------------
  // Footer Observer Logic
  // ---------------------------------------------------------
  function watchFooter() {
    dbg("👀 [sticky] watchFooter running...");
    
    const footer = document.querySelector("#footer");
    
    if (!footer) {
        console.error("❌ [sticky] Critical: #footer element NOT FOUND in DOM.");
        // If not found, footerVisible stays false, scroll logic applies normally
        return;
    } else {
        dbg("✅ [sticky] Found #footer element", footer);
    }

    S.footerObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      S.footerVisible = entry.isIntersecting; 

      dbg(`⚡ [sticky] Footer Intersection: ${entry.isIntersecting}`);

      if (entry.isIntersecting) {
        document.documentElement.classList.add("footer-visible");
        
        // Force update immediately
        S.headers.forEach((_, key) => {
            if (key.startsWith(".mob-bottom-bar")) {
                setHidden(key, false);
            }
        });
      } else {
        document.documentElement.classList.remove("footer-visible");
      }
    }, {
      root: null,
      // NOTE: 1000px margin means it triggers VERY early (1000px before reaching bottom)
      // If you want it to trigger only when footer is ACTUALLY on screen, change to "0px"
      rootMargin: "0px 0px 1000px 0px", 
      threshold: 0
    });

    S.footerObserver.observe(footer);
  }

  function watchForHeaders() {
    dbg("🔎 [sticky] watchForHeaders called");
    const currentY = getY();
    S.lastY = currentY;

    // Use S.configs to ensure we have the latest config even after reload
    (S.configs || []).forEach(({ selector, bannerScroll = true }) => {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      
      elements.forEach((el, idx) => {
        const key = `${selector}[${idx}]`;
        const existing = S.headers.get(key);
        
        // If it's a new element (or we cleared map), bind it
        if (!existing || existing.element !== el) {
          bindHeader(el, key, bannerScroll);
        }
      });
    });

    // Observer to handle dynamic content within the current page
    S.observer = new MutationObserver(() => {
        let needsRebind = false;
        S.headers.forEach(state => {
            if (!document.body.contains(state.element)) needsRebind = true;
        });
        if (needsRebind) watchForHeaders();
    });

    S.observer.observe(document.documentElement, { childList: true, subtree: true });
    requestAnimationFrame(onScrollRaf);
  }

  // ---------------------------------------------------------
  // Re-Init (Called on Swap)
  // ---------------------------------------------------------
  function reinit() {
    dbg(`🏁 [sticky] Reinitializing...`);
    cleanup();
    
    // Increased timeout slightly to ensure Astro View Transition DOM is ready
    setTimeout(() => {
        watchForHeaders();
        watchFooter();
    }, 100);
  }

  // Expose reinit globally
  (window as any).__stickyHeaderReinit = reinit;

  // Initial setup
  watchForHeaders();
  watchFooter();
  
  // Persistent Listeners (Added only once due to S.installed check)
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  
  // Astro Listeners
  document.addEventListener("astro:after-swap", () => {
      dbg("🔁 [sticky] Event: astro:after-swap");
      (window as any).__stickyHeaderReinit?.();
  });
}

// ---------------------------------------------------------
// Execute
// ---------------------------------------------------------
initStickyHeader([
  { selector: "#header", bannerScroll: true },
  { selector: ".mob-bottom-bar", bannerScroll: false },
]);