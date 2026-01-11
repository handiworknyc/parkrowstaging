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
  let lenisBound = false;

  const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

  const isCritFetch = (img) =>
    (img.getAttribute("fetchpriority") || "").toLowerCase() === "high";

  function tagParentEl(el, isCrit = false) {
    const parent = el.closest(".img-load-par");
    if (!parent) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
    if (isCrit) parent.classList.add(PARENT_CLASS_ON_CRIT);
  }

  // Fade-in + fire event
  function markLoaded(img) {
    if (img.classList.contains("lazy-loaded")) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.classList.add("lazy-loaded");
        img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
        tagParentEl(img, isCritFetch(img));
      });
    });
  }

  function markVideoLoaded(video) {
    const parent = video.closest(".img-load-par");
    if (!parent || parent.classList.contains(PARENT_CLASS_ON_LOAD)) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
  }

  // Handle <img> network events
  function onLoadedOrError(e) {
    const img = e.target;
    if (!img?.matches?.(SELECTOR_IMG)) return;

    if (e.type === "load") {
      if (img.dataset.inView === "true") {
        markLoaded(img);
        if (io) io.unobserve(img);
      }
    } else {
      img.dispatchEvent(new CustomEvent("smartimage:error", { bubbles: true }));
    }
  }

  /* ------------------------------------------------------------
     LENIS SYNC — THIS IS THE FIX
     Forces IO to re-evaluate when Lenis moves content via transform
  ------------------------------------------------------------ */
  function bindLenis() {
    if (lenisBound) return;

    const lenis = window.lenis || window.__lenis || null;
    if (!lenis || !io || typeof lenis.on !== "function") return;

    lenis.on("scroll", () => {
      // Forces IntersectionObserver to recalc with transformed content
      io.takeRecords();
    });

    lenisBound = true;
  }

  function initSmartImages() {

    // 1. Create IO
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            const img = ent.target;

            if (ent.isIntersecting) {
              if (img.complete && img.naturalWidth > 0) {
                markLoaded(img);
                io.unobserve(img);
              } else {
                img.dataset.inView = "true";
              }
            } else {
              // Remove stale state — this fixes offscreen fade bugs
              delete img.dataset.inView;
            }
          }
        },
        { rootMargin: IO_ROOT_MARGIN }
      );
    }

    // Bind Lenis AFTER IO exists
    bindLenis();

    // 2. Observe all images
    qsa(document, SELECTOR_IMG).forEach((img) => {
      if (img.classList.contains("lazy-loaded")) return;

      if (io) io.observe(img);
      else if (img.complete) markLoaded(img); // safe fallback
    });

    // 3. Videos
    document.querySelectorAll("video").forEach((v) => {
      if (v.readyState >= 2) markVideoLoaded(v);
    });

    // 4. MutationObserver (Astro view transitions / client nav)
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

  /* ------------------------------------------------------------
     Global event listeners (only once)
  ------------------------------------------------------------ */
  if (!(window).__smartImageListenersAttached) {
    document.addEventListener("load", onLoadedOrError, true);
    document.addEventListener("error", onLoadedOrError, true);

    document.addEventListener("loadeddata", (e) => {
      const t = e.target;
      if (t instanceof HTMLVideoElement) markVideoLoaded(t);
    }, true);

    (window).__smartImageListenersAttached = true;
  }

  // Astro routing
  document.addEventListener("astro:page-load", initSmartImages);

  if (document.readyState === "interactive" || document.readyState === "complete") {
    initSmartImages();
  }
}
