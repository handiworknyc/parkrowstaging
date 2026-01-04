// Native lazy loader for <img.hw-lazy-img>
// Updated for Astro View Transitions compatibility + video support

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img",
    SELECTOR_LAZY = `${SELECTOR_IMG}[data-src]:not(.critical)`,
    SELECTOR_CRIT_DEFERRED = `${SELECTOR_IMG}.critical[data-src]`,
    SELECTOR_CRIT_FETCH = `${SELECTOR_IMG}[fetchpriority="high"]`,
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

  function markLoaded(img) {
    if (img.classList.contains("lazy-loaded")) return;
    img.classList.add("lazy-loaded");
    img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
    tagParentEl(img, isCritFetch(img));
  }

  function markVideoLoaded(video) {
    const parent = video.closest(".img-load-par");
    if (!parent || parent.classList.contains(PARENT_CLASS_ON_LOAD)) return;
    parent.classList.add(PARENT_CLASS_ON_LOAD);
  }

  function upgrade(img) {
    const { src: ds, srcset: dss, sizes: dsz } = img.dataset;

    if (ds) img.src = ds;
    if (dss) img.srcset = dss;
    if (dsz) img.sizes = dsz;

    img.removeAttribute("data-src");
    img.removeAttribute("data-srcset");
    img.removeAttribute("data-sizes");

    if (img.complete && img.naturalWidth > 0) markLoaded(img);
  }

  function onLoadedOrError(e) {
    const img = e.target;
    if (!img?.matches?.(SELECTOR_IMG)) return;
    if (e.type === "load") markLoaded(img);
    else img.dispatchEvent(new CustomEvent("smartimage:error", { bubbles: true }));
  }

  const observeLazy = (img) => {
    if (!img.matches(SELECTOR_LAZY)) return;
    if (io) io.observe(img);
    else upgrade(img);
  };

  function finalSweep() {
    // ⭐ THIS FIXES MISSED IMAGES ⭐
    qsa(document, SELECTOR_IMG).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) {
        markLoaded(img);
      }
    });
  }

  function initSmartImages() {
    if (!io && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const ent of entries) {
            if (!ent.isIntersecting) continue;
            upgrade(ent.target);
            io.unobserve(ent.target);
          }
        },
        { rootMargin: IO_ROOT_MARGIN }
      );
    }

    qsa(document, SELECTOR_CRIT_DEFERRED).forEach(upgrade);
    qsa(document, SELECTOR_LAZY).forEach(observeLazy);

    qsa(document, SELECTOR_CRIT_FETCH).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) markLoaded(img);
    });

    document.querySelectorAll("video").forEach((v) => {
      if (v.readyState >= 2) markVideoLoaded(v);
    });

    // ⭐ RUN FINAL SWEEP ⭐
    finalSweep();

    if (mo) mo.disconnect();

    mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => n instanceof Element && handleElement(n));
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleElement(el) {
    qsa(el, SELECTOR_CRIT_DEFERRED).forEach(upgrade);
    qsa(el, SELECTOR_LAZY).forEach(observeLazy);

    qsa(el, SELECTOR_CRIT_FETCH).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) markLoaded(img);
    });

    qsa(el, SELECTOR_IMG).forEach((img) => {
      if (img.complete && img.naturalWidth > 0) markLoaded(img);
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
