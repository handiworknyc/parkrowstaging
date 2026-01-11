// src/scripts/smart-images.js

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img";
  const CLASS_LOADED = "lazy-loaded"; 
  const PARENT_CLASS_LOADED = "child-lazy-loaded";
  const PARENT_CLASS_CRIT = "crit-child-lazy-loaded";
  
  const IO_ROOT_MARGIN = "300px"; 

  let observer;

  // ---------------------------------------------------------
  // 1. THE REVEALER (The destination)
  // ---------------------------------------------------------
  function reveal(img, skipDecode = false) {
    if (img.classList.contains(CLASS_LOADED)) return;

    // Skip decode for images that are already fully loaded and in cache
    if (skipDecode) {
      requestAnimationFrame(() => {
        img.classList.add(CLASS_LOADED);

        const parent = img.closest(".img-load-par");
        if (parent) {
          parent.classList.add(PARENT_CLASS_LOADED);
          if (img.getAttribute("fetchpriority") === "high") {
            parent.classList.add(PARENT_CLASS_CRIT);
          }
        }
        
        if (observer) observer.unobserve(img);
        img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
      });
      return;
    }

    // Use decode() for images still loading to prevent flash
    const promise = img.decode ? img.decode() : Promise.resolve();

    promise.catch(() => {
      return; 
    }).then(() => {
      requestAnimationFrame(() => {
        img.classList.add(CLASS_LOADED);

        const parent = img.closest(".img-load-par");
        if (parent) {
          parent.classList.add(PARENT_CLASS_LOADED);
          if (img.getAttribute("fetchpriority") === "high") {
            parent.classList.add(PARENT_CLASS_CRIT);
          }
        }
        
        if (observer) observer.unobserve(img);
        img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
      });
    });
  }

  // ---------------------------------------------------------
  // 2. THE HANDSHAKE (The Logic)
  // ---------------------------------------------------------
  function attemptReveal(img) {
    const isLoaded = img.complete || img.naturalWidth > 0;
    const isInView = img.dataset.inView === "true";

    if (isLoaded && isInView) {
      // If image is complete AND has natural dimensions, it's fully cached
      // Skip decode() for instant reveal
      const isFullyCached = img.complete && img.naturalWidth > 0;
      reveal(img, isFullyCached);
    }
  }

  // ---------------------------------------------------------
  // 3. THE TRIGGERS
  // ---------------------------------------------------------
  
  function initObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const img = entry.target;

        if (entry.isIntersecting) {
          img.dataset.inView = "true";
          attemptReveal(img);
        } else {
          img.dataset.inView = "false";
        }
      });
    }, { rootMargin: IO_ROOT_MARGIN, threshold: 0.01 });
  }

  if (!window.__smartImageListenersAttached) {
    // Capture 'load' event
    document.addEventListener("load", (e) => {
      const img = e.target;
      if (img.matches?.(SELECTOR_IMG)) {
        attemptReveal(img);
      }
    }, true);

    // Handle Video ready state
    document.addEventListener("loadeddata", (e) => {
      const v = e.target;
      if (v.tagName === "VIDEO") {
        const parent = v.closest(".img-load-par");
        if (parent) parent.classList.add(PARENT_CLASS_LOADED);
      }
    }, true);

    window.__smartImageListenersAttached = true;
  }

  // ---------------------------------------------------------
  // 4. INITIALIZATION (Astro Friendly)
  // ---------------------------------------------------------
  function initSmartImages() {
    initObserver();

    const images = document.querySelectorAll(SELECTOR_IMG);
    
    images.forEach((img) => {
      if (img.classList.contains(CLASS_LOADED)) return;

      observer.observe(img);

      // Immediately reveal if already loaded and in viewport
      if (img.complete || img.naturalWidth > 0) {
        attemptReveal(img);
      }
    });
  }

  document.addEventListener("astro:page-load", initSmartImages);
  
  if (document.readyState === "interactive" || document.readyState === "complete") {
    setTimeout(initSmartImages, 0);
  }
}