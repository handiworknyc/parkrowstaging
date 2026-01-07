// Native lazy loader for <img.hw-lazy-img>
// Behavior:
// 1. loading="eager" -> Fetched immediately, animates in when in Viewport.
// 2. loading="lazy"  -> Fetched near Viewport, animates in when in Viewport.
// 3. Animation       -> Uses Native Web Animations API (WAAPI).

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img",
    PARENT_CLASS_ON_LOAD = "child-lazy-loaded",
    PARENT_CLASS_ON_CRIT = "crit-child-lazy-loaded",
    IO_ROOT_MARGIN = "200px";

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

  // ⭐ UPDATED: Native JS Animation
  function markLoaded(img) {
    if (img.classList.contains("lazy-loaded")) return;
    
    // 1. Mark state immediately to prevent double-fires
    img.classList.add("lazy-loaded");

    // 2. Trigger Native Fade In
    const anim = img.animate(
      [
        { opacity: 0 },
        { opacity: 1 }
      ], 
      {
        duration: 1000, // 1 second
        easing: "cubic-bezier(0.22, 1, 0.36, 1)", // Custom ease-out
        fill: "forwards" // Keeps the element at opacity: 1 when done
      }
    );

    // 3. Hard set opacity on finish for safety
    anim.onfinish = () => {
        img.style.opacity = "1";
    };

    // 4. Notify Parents / Events
    img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
    tagParentEl(img, isCritFetch(img));
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
        // If image is fully loaded AND marked as 'in-view' by observer
        if (img.dataset.inView === "true") {
            markLoaded(img);
            if (io) io.unobserve(img);
        }
    } else {
        img.dispatchEvent(new CustomEvent("smartimage:error", { bubbles: true }));
    }
  }

  function initSmartImages() {
    // 1. Setup Intersection Observer
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            const img = ent.target;

            if (ent.isIntersecting) {
                // If loaded already, fade in now
                if (img.complete && img.naturalWidth > 0) {
                    markLoaded(img);
                    io.unobserve(img);
                } 
                // If still downloading, mark as ready for the 'load' event
                else {
                    img.dataset.inView = "true";
                }
            } else {
                // Scrolled away before loading? Cancel the pending fade.
                img.dataset.inView = "false";
            }
          }
        },
        { rootMargin: IO_ROOT_MARGIN }
      );
    }

    // 2. Observe ALL images (Lazy AND Eager)
    qsa(document, SELECTOR_IMG).forEach((img) => {
        if (img.classList.contains("lazy-loaded")) return;
        
        if (io) io.observe(img);
        else {
             // Fallback for no IO support
             if(img.complete) markLoaded(img);
        }
    });

    // 3. Check videos
    document.querySelectorAll("video").forEach((v) => {
      if (v.readyState >= 2) markVideoLoaded(v);
    });

    // 4. MutationObserver for View Transitions
    if (mo) mo.disconnect();
    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => n instanceof Element && handleElement(n));
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleElement(el) {
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