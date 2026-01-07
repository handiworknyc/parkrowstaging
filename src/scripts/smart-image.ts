// Native lazy loader for <img.hw-lazy-img>
// Behavior:
// 1. loading="eager" -> Fetched immediately by browser, but only fades in when in Viewport.
// 2. loading="lazy"  -> Fetched by browser when near Viewport, fades in when in Viewport.

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img",
    PARENT_CLASS_ON_LOAD = "child-lazy-loaded",
    PARENT_CLASS_ON_CRIT = "crit-child-lazy-loaded",
    IO_ROOT_MARGIN = "200px"; // Load/Fade slightly before they appear

  let io = null;
  let mo = null;

  const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

  const isCritFetch = (img) =>
    (img.getAttribute("fetchpriority") || "").toLowerCase() === "high";

  function tagParentEl(el, isCrit = false) {
    const parent = el.closest(".img-load-par");
    if (!parent) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
    if (isCrit) parent.classList.add(PARENT_CLASS_ON_CRIT);
  }

  // This adds the class that sets opacity: 1
  function markLoaded(img) {
    if (img.classList.contains("lazy-loaded")) return;
    
    // Using rAF ensures the fade transition catches the paint cycle
    requestAnimationFrame(() => {
        img.classList.add("lazy-loaded");
        img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
        tagParentEl(img, isCritFetch(img));
    });
  }

  function markVideoLoaded(video) {
    const parent = video.closest(".img-load-par");
    if (!parent || parent.classList.contains(PARENT_CLASS_ON_LOAD)) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
  }

  // Global handler for network load events
  function onLoadedOrError(e) {
    const img = e.target;
    if (!img?.matches?.(SELECTOR_IMG)) return;

    if (e.type === "load") {
        // If the image is ALREADY considered "in-view" by the observer,
        // but was just waiting for the network, mark it now.
        if (img.dataset.inView === "true") {
            markLoaded(img);
            // Cleanup observer if it was being watched
            if (io) io.unobserve(img);
        }
    } else {
        img.dispatchEvent(new CustomEvent("smartimage:error", { bubbles: true }));
    }
  }

  function initSmartImages() {
    // 1. Create a single robust observer for EVERYTHING
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            const img = ent.target;
            
            // Logic: Is it on screen?
            if (ent.isIntersecting) {
                // Yes, it is in viewport.
                
                // Case A: Image is fully downloaded -> Show it.
                if (img.complete && img.naturalWidth > 0) {
                    markLoaded(img);
                    io.unobserve(img); // Done with this image
                } 
                // Case B: In viewport, but still downloading -> Mark it as seen.
                // We wait for the 'load' event (see onLoadedOrError) to actually fade it in.
                else {
                    img.dataset.inView = "true";
                }
            } else {
                // If it scrolls OUT of view before loading, unmark it.
                // This prevents off-screen fades if user scrolls past quickly.
                img.dataset.inView = "false";
            }
          }
        },
        { rootMargin: IO_ROOT_MARGIN }
      );
    }

    // 2. Observe ALL images (Lazy AND Eager)
    // This ensures Eager images don't "pop" in if they are off-screen or 
    // if the CSS hides them by default. They will follow the same fade logic.
    qsa(document, SELECTOR_IMG).forEach((img) => {
        if (img.classList.contains("lazy-loaded")) return; // Skip if already done
        if (io) io.observe(img);
        else {
             // Fallback if no IO support (rare) - just show loaded ones
             if(img.complete) markLoaded(img);
        }
    });

    // 3. Check videos
    document.querySelectorAll("video").forEach((v) => {
      if (v.readyState >= 2) markVideoLoaded(v);
    });

    // 4. MutationObserver for View Transitions / Client Routing
    if (mo) mo.disconnect();
    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => n instanceof Element && handleElement(n));
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleElement(el) {
    // Observe new images injected into DOM
    qsa(el, SELECTOR_IMG).forEach((img) => {
        if (io) io.observe(img);
    });
    
    qsa(el, "video").forEach((v) => {
      if (v.readyState >= 2) markVideoLoaded(v);
    });
  }

  if (!(window).__smartImageListenersAttached) {
    document.addEventListener("load", onLoadedOrError, true);
    document.addEventListener("error", onLoadedOrError, true);

    document.addEventListener("loadeddata", (e) => {
      const t = e.target;
      if (t instanceof HTMLVideoElement) markVideoLoaded(t);
    }, true);

    (window).__smartImageListenersAttached = true;
  }

  document.addEventListener("astro:page-load", initSmartImages);

  if (document.readyState === "interactive" || document.readyState === "complete") {
    initSmartImages();
  }
}