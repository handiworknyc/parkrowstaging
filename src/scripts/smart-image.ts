// Native lazy loader for <img.hw-lazy-img>
// Updated for Astro View Transitions compatibility

// Check for window to avoid SSR errors
if (typeof window !== "undefined") {
  
  const SELECTOR_IMG = "img.hw-lazy-img",
    SELECTOR_LAZY = `${SELECTOR_IMG}[data-src]:not(.critical)`,
    SELECTOR_CRIT_DEFERRED = `${SELECTOR_IMG}.critical[data-src]`,
    SELECTOR_CRIT_FETCH = `${SELECTOR_IMG}[fetchpriority="high"]`,
    PARENT_CLASS_ON_LOAD = "child-lazy-loaded",
    PARENT_CLASS_ON_CRIT = "crit-child-lazy-loaded",
    IO_ROOT_MARGIN = "200px";

  // State trackers
  let io: IntersectionObserver | null = null;
  let mo: MutationObserver | null = null;

  const qsa = (root: ParentNode, sel: string) =>
    Array.from(root.querySelectorAll<HTMLImageElement>(sel));

  const isCritFetch = (img: HTMLImageElement) =>
    (img.getAttribute("fetchpriority") || "").toLowerCase() === "high";

  // --- Core Actions ---

  function upgrade(img: HTMLImageElement) {
    const { src: ds, srcset: dss, sizes: dsz } = img.dataset;
    
    if (ds) img.src = ds;
    if (dss) img.srcset = dss;
    if (dsz) img.sizes = dsz;

    img.removeAttribute("data-src");
    img.removeAttribute("data-srcset");
    img.removeAttribute("data-sizes");

    // Check immediately in case it was cached
    if (img.complete && img.naturalWidth > 0) markLoaded(img);
  }

  function tagParent(img: HTMLImageElement) {
    const parent = img.closest<HTMLElement>(".img-load-par");
    if (!parent) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
    if (isCritFetch(img)) parent.classList.add(PARENT_CLASS_ON_CRIT);
  }

  function markLoaded(img: HTMLImageElement) {
    if (img.classList.contains("lazy-loaded")) return;
    
    img.classList.add("lazy-loaded");
    img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
    tagParent(img);
  }

  // --- Event Handlers ---

  function onLoadedOrError(e: Event) {
    const img = e.target as HTMLImageElement;
    if (!img?.matches?.(SELECTOR_IMG)) return;

    if (e.type === "load") {
      markLoaded(img);
    } else {
      img.dispatchEvent(new CustomEvent("smartimage:error", { bubbles: true }));
    }
  }

  const observeLazy = (img: HTMLImageElement) => {
    if (!img.matches(SELECTOR_LAZY)) return;
    if (io) io.observe(img);
    else upgrade(img);
  };

  // --- Initialization Logic (Runs on every page nav) ---

  function initSmartImages() {
    // 1. Setup IntersectionObserver (Singleton)
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            if (!ent.isIntersecting) continue;
            const img = ent.target as HTMLImageElement;
            upgrade(img);
            io!.unobserve(img);
          }
        },
        { rootMargin: IO_ROOT_MARGIN }
      );
    }

    // 2. Initial Pass: Upgrade criticals & Observe lazy
    qsa(document, SELECTOR_CRIT_DEFERRED).forEach(upgrade);
    qsa(document, SELECTOR_LAZY).forEach(observeLazy);
    
    // 3. Check already loaded images
    qsa(document, SELECTOR_CRIT_FETCH).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) markLoaded(img);
    });

    // 4. Setup MutationObserver (Reset for new DOM)
    if (mo) mo.disconnect();
    
    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) handleElement(n);
        });
      }
    });
    
    // Re-observe documentElement (persists across swaps, but good to be safe)
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleElement(el: Element) {
    qsa(el, SELECTOR_CRIT_DEFERRED).forEach(upgrade);
    qsa(el, SELECTOR_LAZY).forEach(observeLazy);

    qsa(el, SELECTOR_CRIT_FETCH).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) markLoaded(img);
    });

    if (el.matches?.(SELECTOR_IMG)) {
      const img = el as HTMLImageElement;
      if (img.matches(SELECTOR_CRIT_DEFERRED)) upgrade(img);
      else if (img.matches(SELECTOR_LAZY)) observeLazy(img);
      if (img.matches(SELECTOR_CRIT_FETCH) && img.complete && img.naturalWidth > 0) {
        markLoaded(img);
      }
    }
  }

  // --- Attach Listeners ---

  // 1. Global load/error (only attach once)
  // We check if we've already attached to avoid duplicates during HMR/dev
  if (!(window as any).__smartImageListenersAttached) {
    document.addEventListener("load", onLoadedOrError, true);
    document.addEventListener("error", onLoadedOrError, true);
    (window as any).__smartImageListenersAttached = true;
  }

  // 2. Lifecycle Hook for Astro View Transitions
  // 'astro:page-load' fires on the initial visit AND after every swap.
  document.addEventListener("astro:page-load", initSmartImages);

  // 3. Fallback for non-Astro environments or if event already missed
  if (document.readyState === "interactive" || document.readyState === "complete") {
     // Optional: check if we are NOT in an Astro environment to avoid double run
     // But initSmartImages is idempotent enough to run twice safely
     initSmartImages();
  }
}