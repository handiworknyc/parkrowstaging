// src/scripts/smart-images.js

if (typeof window !== "undefined") {

  const SELECTOR_IMG = "img.hw-lazy-img";
  const CLASS_LOADED = "lazy-loaded"; 
  const PARENT_CLASS_LOADED = "child-lazy-loaded";
  const PARENT_CLASS_CRIT = "crit-child-lazy-loaded";
  
  const IO_ROOT_MARGIN = "300px"; 

  let observer;

  // ---------------------------------------------------------
  // Check if element is actually in viewport RIGHT NOW
  // ---------------------------------------------------------
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    const margin = parseInt(IO_ROOT_MARGIN);
    const inView = (
      rect.top < (window.innerHeight + margin) &&
      rect.bottom > -margin &&
      rect.left < (window.innerWidth + margin) &&
      rect.right > -margin
    );
    console.log('[isInViewport]', el.src?.slice(-30), 'inView:', inView, 'rect:', rect);
    return inView;
  }

  // ---------------------------------------------------------
  // 1. THE REVEALER (The destination)
  // ---------------------------------------------------------
  function reveal(img) {
    if (img.classList.contains(CLASS_LOADED)) return;

    console.log('[reveal] REVEALING:', img.src?.slice(-30));

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
      console.log('[reveal] COMPLETE:', img.src?.slice(-30));
    });
  }

  // ---------------------------------------------------------
  // 2. THE HANDSHAKE (The Logic)
  // ---------------------------------------------------------
  function attemptReveal(img) {
    // CONDITION 1: Has the browser finished downloading it?
    const isLoaded = img.complete && img.naturalWidth > 0;
    
    // CONDITION 2: Is the user actually looking at it?
    // Check BOTH the dataset flag AND do a synchronous viewport check
    const isInView = img.dataset.inView === "true" || isInViewport(img);

    console.log('[attemptReveal]', img.src?.slice(-30), {
      isLoaded,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      datasetInView: img.dataset.inView,
      isInView,
      willReveal: isLoaded && isInView
    });

    // If both are true, show immediately
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
        console.log('[IntersectionObserver]', img.src?.slice(-30), 'isIntersecting:', entry.isIntersecting);

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

    // Check on scroll for instant reveals
    let scrollTimeout;
    document.addEventListener("scroll", () => {
      console.log('[scroll] Checking for images to reveal...');
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const images = document.querySelectorAll(SELECTOR_IMG);
        console.log('[scroll timeout] Found', images.length, 'images');
        images.forEach((img) => {
          if (!img.classList.contains(CLASS_LOADED)) {
            attemptReveal(img);
          }
        });
      }, 50);
    }, { passive: true });

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

      // Immediately check and reveal if conditions are met
      attemptReveal(img);
    });
  }

  document.addEventListener("astro:page-load", initSmartImages);
  
  if (document.readyState === "interactive" || document.readyState === "complete") {
    setTimeout(initSmartImages, 0);
  }
}