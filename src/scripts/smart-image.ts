// src/scripts/smart-images.js

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img";
  const CLASS_LOADED = "lazy-loaded"; // The class that triggers opacity: 1
  const PARENT_CLASS_LOADED = "child-lazy-loaded";
  const PARENT_CLASS_CRIT = "crit-child-lazy-loaded";
  
  // Triggers slightly before element enters viewport
  const IO_ROOT_MARGIN = "300px"; 

  let observer;

  // ---------------------------------------------------------
  // 1. THE REVEALER (The destination)
  // ---------------------------------------------------------
  function reveal(img) {
    if (img.classList.contains(CLASS_LOADED)) return;

    // Double rAF ensures the browser is ready to paint the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        img.classList.add(CLASS_LOADED);

        // Handle Parent Classes (for background colors/spinners)
        const parent = img.closest(".img-load-par");
        if (parent) {
          parent.classList.add(PARENT_CLASS_LOADED);
          if (img.getAttribute("fetchpriority") === "high") {
            parent.classList.add(PARENT_CLASS_CRIT);
          }
        }
        
        // Stop watching this image to save performance
        if (observer) observer.unobserve(img);
        
        // Dispatch event for other scripts
        img.dispatchEvent(new CustomEvent("smartimage:loaded", { bubbles: true }));
      });
    });
  }

  // ---------------------------------------------------------
  // 2. THE HANDSHAKE (The Logic)
  // ---------------------------------------------------------
  function attemptReveal(img) {
    // CONDITION 1: Has the browser finished downloading it?
    // We check .complete for cached images, or our custom data attribute for new loads
    const isLoaded = img.complete;
	
	console.log('hey hey');
	console.log(img);
	console.log(img.complete);
	
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
  
  // TRIGGER A: Intersection Observer (The User Scroll)
  function initObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const img = entry.target;

        if (entry.isIntersecting) {
          // User sees it -> Set Flag -> Check Handshake
          img.dataset.inView = "true";
          attemptReveal(img);
        } else {
          // User scrolled away -> Unset Flag
          // This prevents off-screen fade-ins if loading finishes while scrolled away
          img.dataset.inView = "false";
        }
      });
    }, { rootMargin: IO_ROOT_MARGIN });
  }

  // TRIGGER B: Network Events (The Browser Download)
  // We attach this globally ONCE.
  if (!window.__smartImageListenersAttached) {
    // Capture 'load' event (does not bubble, so capture=true is mandatory)
    document.addEventListener("load", (e) => {
      const img = e.target;
      if (img.matches?.(SELECTOR_IMG)) {
        // Download done -> Check Handshake
        attemptReveal(img);
      }
    }, true);

    // Handle Video ready state
    document.addEventListener("loadeddata", (e) => {
      const v = e.target;
      if (v.tagName === "VIDEO") {
        // Videos effectively auto-reveal once they have data
        // because we don't usually "lazy load" the poster frame logic the same way
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
      // If already done, skip
      if (img.classList.contains(CLASS_LOADED)) return;

      // Register with Observer
      observer.observe(img);

      // Edge Case: If image is cached, 'load' event might never fire.
      // We manually check it on init.
      if (img.complete && img.naturalHeight > 0) {
        // Note: We don't force reveal here. We let the Observer 
        // trigger the 'inView' flag first.
      }
    });
  }

  // Run on initial load and every Astro View Transition
  document.addEventListener("astro:page-load", initSmartImages);
  
  // Fallback for first load if astro:page-load misses
  if (document.readyState === "interactive" || document.readyState === "complete") {
    // slight delay to let Astro hydrate
    setTimeout(initSmartImages, 0);
  }
}