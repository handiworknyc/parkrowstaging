// src/scripts/smart-images.js

if (typeof window !== "undefined") {
  const CONFIG = {
    SELECTOR_IMG: "img.hw-lazy-img",
    CLASS_LOADED: "lazy-loaded",
    PARENT_CLASS_LOADED: "child-lazy-loaded",
    PARENT_CLASS_CRIT: "crit-child-lazy-loaded",
    ROOT_MARGIN: "300px",
  };

  let observer;

  // ---------------------------------------------------------
  // Viewport Detection
  // ---------------------------------------------------------
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    const margin = parseInt(CONFIG.ROOT_MARGIN);
    
    return (
      rect.top < window.innerHeight + margin &&
      rect.bottom > -margin &&
      rect.left < window.innerWidth + margin &&
      rect.right > -margin
    );
  }

  // ---------------------------------------------------------
  // Image State Checks
  // ---------------------------------------------------------
  function isImageLoaded(img) {
    return img.complete && img.naturalWidth > 0;
  }

  function isImageInView(img) {
    return img.dataset.inView === "true" || isInViewport(img);
  }

  function shouldReveal(img) {
    return (
      !img.classList.contains(CONFIG.CLASS_LOADED) &&
      isImageLoaded(img) &&
      isImageInView(img)
    );
  }

  // ---------------------------------------------------------
  // Reveal Logic
  // ---------------------------------------------------------
  function markParentLoaded(img) {
    const parent = img.closest(".img-load-par");
    if (!parent) return;

    parent.classList.add(CONFIG.PARENT_CLASS_LOADED);
    
    if (img.getAttribute("fetchpriority") === "high") {
      parent.classList.add(CONFIG.PARENT_CLASS_CRIT);
    }
  }

  function reveal(img) {
    if (img.classList.contains(CONFIG.CLASS_LOADED)) return;

    requestAnimationFrame(() => {
      img.classList.add(CONFIG.CLASS_LOADED);
      markParentLoaded(img);
      
      if (observer) observer.unobserve(img);
      
      img.dispatchEvent(
        new CustomEvent("smartimage:loaded", { bubbles: true })
      );
    });
  }

  function attemptReveal(img) {
    if (shouldReveal(img)) {
      reveal(img);
    }
  }

  // ---------------------------------------------------------
  // Intersection Observer
  // ---------------------------------------------------------
  function handleIntersection(entries) {
    entries.forEach((entry) => {
      const img = entry.target;
      img.dataset.inView = entry.isIntersecting ? "true" : "false";
      
      if (entry.isIntersecting) {
        attemptReveal(img);
      }
    });
  }

  function initObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver(handleIntersection, {
      rootMargin: CONFIG.ROOT_MARGIN,
      threshold: 0.01,
    });
  }

  // ---------------------------------------------------------
  // Locomotive Scroll Integration
  // ---------------------------------------------------------
  function createThrottledReveal() {
    let ticking = false;

    return () => {
      if (ticking) return;

      ticking = true;
      requestAnimationFrame(() => {
        const images = document.querySelectorAll(
          `${CONFIG.SELECTOR_IMG}:not(.${CONFIG.CLASS_LOADED})`
        );
        images.forEach(attemptReveal);
        ticking = false;
      });
    };
  }

  function setupLocoScrollListener() {
    if (locoScrollAttached) return;

    document.addEventListener("loco:ready", (e) => {
      const locoScroll = e.detail.instance;
      
      // Locomotive Scroll v5 doesn't need special handling
      // IntersectionObserver already works with virtual scroll
      // Just trigger a manual check on raf updates
      locoScrollAttached = true;
    });
  }

  // ---------------------------------------------------------
  // Event Listeners (Set up once)
  // ---------------------------------------------------------
  function attachGlobalListeners() {
    if (window.__smartImageListenersAttached) return;

    // Image load events
    document.addEventListener(
      "load",
      (e) => {
        if (e.target.matches?.(CONFIG.SELECTOR_IMG)) {
          attemptReveal(e.target);
        }
      },
      true
    );

    // Video ready state
    document.addEventListener(
      "loadeddata",
      (e) => {
        if (e.target.tagName !== "VIDEO") return;
        
        const parent = e.target.closest(".img-load-par");
        if (parent) {
          parent.classList.add(CONFIG.PARENT_CLASS_LOADED);
        }
      },
      true
    );

    window.__smartImageListenersAttached = true;
  }

  // ---------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------
  function initSmartImages() {
    initObserver();
    attachGlobalListeners();

    const images = document.querySelectorAll(CONFIG.SELECTOR_IMG);

    images.forEach((img) => {
      if (img.classList.contains(CONFIG.CLASS_LOADED)) return;

      observer.observe(img);
      attemptReveal(img);
    });
  }

  // ---------------------------------------------------------
  // Run on page load (Astro compatible)
  // ---------------------------------------------------------
  document.addEventListener("astro:page-load", initSmartImages);

  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    initSmartImages();
  }
}