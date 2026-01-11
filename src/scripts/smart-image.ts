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
  function reveal(img) {
    if (img.classList.contains(CLASS_LOADED)) return;

    // Optional: Use decode() ensures the image is painted to the GPU 
    // before we fade it in, preventing "white flash" on large JPEGs.
    const promise = img.decode ? img.decode() : Promise.resolve();

    promise.catch(() => {
        // If decode fails (e.g. broken image), we still reveal so alt text shows
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
    // CONDITION 1: Has the browser finished downloading it?
    // We assume loaded if:
    // A) .complete is true (Standard check)
    // B) .naturalWidth > 0 (Fallback: Browser has parsed dimensions, so data exists)
    const isLoaded = img.complete || img.naturalWidth > 0;
    
    // CONDITION 2: Is the user actually looking at it?
    const isInView = img.dataset.inView === "true";

    // If both are true, we show it.
    if (isLoaded && isInView) {
      reveal(img);
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

      // Check immediately. 
      // This catches images that were cached or loaded before this script ran.
      if (img.complete || img.naturalWidth > 0) {
        // We simulate the "inView" check here just in case they are already visible
        // But strictly speaking, the observer callback will handle the visibility check.
        // However, checking the load state ensures we are ready when the observer fires.
        attemptReveal(img);
      }
    });
  }

  document.addEventListener("astro:page-load", initSmartImages);
  
  if (document.readyState === "interactive" || document.readyState === "complete") {
    setTimeout(initSmartImages, 0);
  }
}