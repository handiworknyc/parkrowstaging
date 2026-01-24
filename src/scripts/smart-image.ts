// src/scripts/smart-images.js

if (typeof window !== 'undefined') {
  const CONFIG = {
    SELECTOR_IMG: 'img.hw-lazy-img',
    CLASS_LOADED: 'lazy-loaded',
    PARENT_CLASS_LOADED: 'child-lazy-loaded',
    PARENT_CLASS_CRIT: 'crit-child-lazy-loaded',
    ROOT_MARGIN: '300px',
  };

  let observer = null;
  let secondaryInitialized = false;

  /* =====================================================
     HELPERS
  ===================================================== */

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    const margin = parseInt(CONFIG.ROOT_MARGIN, 10);

    return (
      rect.top < window.innerHeight + margin &&
      rect.bottom > -margin &&
      rect.left < window.innerWidth + margin &&
      rect.right > -margin
    );
  }

  function isImageLoaded(img) {
    return img.complete && img.naturalWidth > 0;
  }

  function markParentLoaded(el) {
    const parent = el.closest('.img-load-par');
    if (!parent) return;

    parent.classList.add(CONFIG.PARENT_CLASS_LOADED);

    const isCritical =
      el.hasAttribute('data-critical') ||
      el.getAttribute('fetchpriority') === 'high';

    if (isCritical) {
      parent.classList.add(CONFIG.PARENT_CLASS_CRIT);
    }
  }

  /* =====================================================
     REVEAL
  ===================================================== */

  function reveal(el) {
    const alreadyLoaded = el.classList.contains(CONFIG.CLASS_LOADED);

    requestAnimationFrame(() => {
      if (!alreadyLoaded) {
        el.classList.add(CONFIG.CLASS_LOADED);
      }

      // ✅ always mark parent — even if SmartImage loaded it first
      markParentLoaded(el);

      if (observer && el.tagName === 'IMG') {
        observer.unobserve(el);
      }

      el.dispatchEvent(
        new CustomEvent('smartimage:loaded', { bubbles: true })
      );
    });
  }

  /* =====================================================
     SECONDARY IMAGES (NON-CRITICAL)
  ===================================================== */

  function initSecondaryImages() {
    if (secondaryInitialized) return;
    secondaryInitialized = true;

    if (observer) observer.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reveal(entry.target);
          }
        });
      },
      {
        rootMargin: CONFIG.ROOT_MARGIN,
        threshold: 0.01,
      }
    );

    // Handle images already in DOM
    const images = document.querySelectorAll(CONFIG.SELECTOR_IMG);

    images.forEach((img) => {
      if (img.classList.contains(CONFIG.CLASS_LOADED)) {
        // ensure parent state is correct
        markParentLoaded(img);
        return;
      }

      if (isImageLoaded(img) && isInViewport(img)) {
        reveal(img);
      } else {
        observer.observe(img);
      }
    });
  }

  /* =====================================================
     GLOBAL LATE LOAD HANDLERS
  ===================================================== */

  // late <img load>
  document.addEventListener(
    'load',
    (e) => {
      if (e.target?.matches?.(CONFIG.SELECTOR_IMG)) {
        reveal(e.target);
      }
    },
    true
  );

  // non-critical videos
  document.addEventListener(
    'loadeddata',
    (e) => {
      if (
        e.target?.tagName === 'VIDEO' &&
        !e.target.hasAttribute('data-critical')
      ) {
        const parent = e.target.closest('.img-load-par');
        if (parent) {
          parent.classList.add(CONFIG.PARENT_CLASS_LOADED);
        }
      }
    },
    true
  );

  /* =====================================================
     CRITICAL IMAGE HANDOFF
     (SmartImage owns decode + parent marking)
  ===================================================== */

  window.addEventListener('critImgLoaded', () => {
    initSecondaryImages();
  });

  /* =====================================================
     INIT
  ===================================================== */

  function init() {
    initSecondaryImages();
  }

  document.addEventListener('astro:page-load', init);

  if (
    document.readyState === 'interactive' ||
    document.readyState === 'complete'
  ) {
    init();
  }
}
