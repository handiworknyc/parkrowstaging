import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import SlideNavigation from "../ui/SlideNavigation"; 

const MOBILE_BLUR_MEDIA_QUERY =
  "(max-width: 768px), (hover: none) and (pointer: coarse)";
const SLIDE_EXIT_DURATION_SECONDS = 4;
const MOBILE_CROSSFADE_DURATION_SECONDS = 1.35;
const SLIDE_TRANSITION_EASE = [0.19, 1, 0.32, 1];
const MOBILE_CROSSFADE_EASE = [0.4, 0, 0.2, 1];
const CUBIC_BEZ_EASE = [0.36, 0.01, 0.1, 1.01];
const SECTION_COPY_FADE_IN_DURATION_SECONDS = 1.1;
const SECTION_COPY_FADE_IN_DELAY_SECONDS = 0.2;
const SWIPE_MIN_DISTANCE_PX = 48;
const SWIPE_AXIS_LOCK_RATIO = 1.25;

// 1. Helper function
const getSlideImageProps = (slide) => {
  const parts = [];
  if (slide.smartImg?.xl) parts.push({ url: slide.smartImg.xl, w: 2048 });
  if (slide.smartImg?.large) parts.push({ url: slide.smartImg.large, w: 1600 });
  if (slide.smartImg?.med) parts.push({ url: slide.smartImg.med, w: 1200 });
  if (slide.smartImg?.small) parts.push({ url: slide.smartImg.small, w: 800 });

  const srcSet = parts.map((p) => `${p.url} ${p.w}w`).join(", ");
  const src =
    slide.smartImg?.xl ||
    slide.smartImg?.large ||
    slide.smartImg?.med ||
    slide.smartImg?.small ||
    slide.smartImg?.url ||
    "";

  return { src, srcSet };
};

// Helper: resolve per-slide section text with module-level fallback
function resolveSectionContent(slide, sectionContent) {
  const title = slide.section_title || sectionContent?.section_title || null;
  const h3 = slide.section_h3 || sectionContent?.section_h3 || null;
  const text = slide.section_text || sectionContent?.section_text || null;
  if (!title && !h3 && !text) return null;
  return { title, h3, text };
}

// Helper: check if a title string is "long" (same logic as LayoutRenderer)
function isLongSectionTitle(title) {
  if (!title) return false;
  const lines = title.split(/<br\s*\/?>/i).map(l => l.replace(/<[^>]+>/g, "").trim());
  return lines.some(l => l.length >= 18);
}

function getSectionContentKey(...parts) {
  return JSON.stringify(parts.map((part) => part || null));
}

export default function FadeSlideshow({ slides, sectionContent = null, placeBelow = false, sectionBgColorClass = null, tallestSectionIndex = 0 }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [disableBlur, setDisableBlur] = useState(false);
  const [exitingSlides, setExitingSlides] = useState([]);
  const imageRefs = useRef([]);
  const slideshowTouchRef = useRef(null);
  const swipeStartRef = useRef(null);
  const swipeCurrentRef = useRef(null);
  const swipeTransitionLockRef = useRef(false);
  const transitionCounterRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(MOBILE_BLUR_MEDIA_QUERY);
    const syncBlurMode = () => setDisableBlur(mediaQueryList.matches);

    syncBlurMode();

    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", syncBlurMode);

      return () => {
        mediaQueryList.removeEventListener("change", syncBlurMode);
      };
    }

    mediaQueryList.addListener(syncBlurMode);

    return () => {
      mediaQueryList.removeListener(syncBlurMode);
    };
  }, []);

  const slidesWithImageProps = useMemo(
    () =>
      slides.map((slide, index) => ({
        key: `${slide.id ?? "slide"}-${index}`,
        index,
        slide,
        imageProps: getSlideImageProps(slide),
      })),
    [slides]
  );

  useEffect(() => {
    imageRefs.current = imageRefs.current.slice(0, slidesWithImageProps.length);
  }, [slidesWithImageProps.length]);

  useEffect(() => {
    if (slidesWithImageProps.length === 0) {
      setCurrentIndex(0);
      setExitingSlides([]);
      return;
    }

    setCurrentIndex((prev) => Math.min(prev, slidesWithImageProps.length - 1));
  }, [slidesWithImageProps.length]);

  useEffect(() => {
    const cleanups = [];

    imageRefs.current.forEach((image) => {
      if (!(image instanceof HTMLImageElement)) {
        return;
      }

      const warmImage = () => {
        if (typeof image.decode === "function") {
          void image.decode().catch(() => {});
        }
      };

      if (image.complete && image.naturalWidth > 0) {
        warmImage();
        return;
      }

      image.addEventListener("load", warmImage, { once: true });
      cleanups.push(() => {
        image.removeEventListener("load", warmImage);
      });
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [slidesWithImageProps]);

  const advanceSlide = useCallback(
    (getNextIndex) => {
      if (disableBlur && swipeTransitionLockRef.current) {
        return;
      }

      if (slidesWithImageProps.length <= 1) {
        return;
      }

      const nextIndex = getNextIndex(currentIndex);

      if (nextIndex === currentIndex) {
        return;
      }

      const previousEntry = slidesWithImageProps[currentIndex];

      if (previousEntry) {
        if (disableBlur) {
          swipeTransitionLockRef.current = true;
        }

        transitionCounterRef.current += 1;
        const exitEntry = {
          ...previousEntry,
          key: `exit-${previousEntry.key}-${transitionCounterRef.current}`,
        };

        // Call both updates at the same level so React 18 batches them into
        // a single commit — prevents a flash frame where the old slide drops
        // to opacity 0 before the exiting overlay figure is mounted.
        setCurrentIndex(nextIndex);
        setExitingSlides((current) => [...current, exitEntry]);
      } else {
        setCurrentIndex(nextIndex);
      }
    },
    [disableBlur, slidesWithImageProps, currentIndex]
  );

  const handleNext = useCallback(() => {
    advanceSlide((prev) => (prev + 1) % slidesWithImageProps.length);
  }, [advanceSlide, slidesWithImageProps.length]);

  const handlePrev = useCallback(() => {
    advanceSlide((prev) => (prev - 1 + slidesWithImageProps.length) % slidesWithImageProps.length);
  }, [advanceSlide, slidesWithImageProps.length]);

  const clearSwipeGesture = useCallback(() => {
    swipeStartRef.current = null;
    swipeCurrentRef.current = null;
  }, []);

  const handleSwipeStart = useCallback((event) => {
    if (event.touches.length !== 1 || slidesWithImageProps.length <= 1) {
      clearSwipeGesture();
      return;
    }

    const touch = event.touches[0];
    const point = { x: touch.clientX, y: touch.clientY };
    swipeStartRef.current = point;
    swipeCurrentRef.current = point;
  }, [clearSwipeGesture, slidesWithImageProps.length]);

  const handleSwipeMove = useCallback((event) => {
    if (!swipeStartRef.current || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    swipeCurrentRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleSwipeEnd = useCallback((event) => {
    const start = swipeStartRef.current;
    const endTouch = event.changedTouches[0];
    const end = endTouch
      ? { x: endTouch.clientX, y: endTouch.clientY }
      : swipeCurrentRef.current;

    clearSwipeGesture();

    if (!start || !end || slidesWithImageProps.length <= 1 || swipeTransitionLockRef.current || exitingSlides.length > 0) {
      return;
    }

    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < SWIPE_MIN_DISTANCE_PX || absX < absY * SWIPE_AXIS_LOCK_RATIO) {
      return;
    }

    if (deltaX < 0) {
      handleNext();
      return;
    }

    handlePrev();
  }, [clearSwipeGesture, exitingSlides.length, handleNext, handlePrev, slidesWithImageProps.length]);

  useEffect(() => {
    const slideshowNode = slideshowTouchRef.current;

    if (!slideshowNode) {
      return undefined;
    }

    slideshowNode.addEventListener("touchstart", handleSwipeStart, { passive: true });
    slideshowNode.addEventListener("touchmove", handleSwipeMove, { passive: true });
    slideshowNode.addEventListener("touchend", handleSwipeEnd, { passive: true });
    slideshowNode.addEventListener("touchcancel", clearSwipeGesture, { passive: true });

    return () => {
      slideshowNode.removeEventListener("touchstart", handleSwipeStart);
      slideshowNode.removeEventListener("touchmove", handleSwipeMove);
      slideshowNode.removeEventListener("touchend", handleSwipeEnd);
      slideshowNode.removeEventListener("touchcancel", clearSwipeGesture);
    };
  }, [clearSwipeGesture, handleSwipeEnd, handleSwipeMove, handleSwipeStart]);

  const activeEntry = slidesWithImageProps[currentIndex] || null;
  const slide = activeEntry?.slide || slides[0];
  const captionOverlayBlur = disableBlur ? "0px" : "11px";
  const captionFadeDuration = disableBlur ? 0.8 : 2.25;
  const captionFadeDelay = disableBlur ? 0.15 : 0.65;

  // Resolve section content for the current slide
  const currentSectionContent = useMemo(
    () => resolveSectionContent(slide, sectionContent),
    [slide, sectionContent]
  );

  // UPDATED: Extremely wide gradient for feathering
  const maskStyle = {
    WebkitMaskImage: "linear-gradient(135deg, black 35%, transparent 65%)",
    maskImage: "linear-gradient(135deg, black 35%, transparent 65%)",
    WebkitMaskSize: "500% 500%", // Huge size allows for a very long fade
    maskSize: "500% 500%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    "--slide-caption-overlay-blur": captionOverlayBlur,
  };

  // Pre-resolve all slide section contents for the ghost height-setter
  const allSectionContents = useMemo(
    () => sectionContent
      ? slides.map(s => resolveSectionContent(s, sectionContent))
      : [],
    [slides, sectionContent]
  );

  const tallestContent = allSectionContents[tallestSectionIndex];
  const staticSectionTitle = useMemo(() => {
    if (!allSectionContents.length) return null;

    const [firstTitle] = allSectionContents.map((content) => content?.title || null);
    if (!firstTitle) return null;

    return allSectionContents.every((content) => (content?.title || null) === firstTitle)
      ? firstTitle
      : null;
  }, [allSectionContents]);
  const slideshowHasAnyBody = useMemo(
    () => allSectionContents.some((content) => content?.h3 || content?.text),
    [allSectionContents]
  );
  const currentSectionBodyKey = useMemo(
    () => getSectionContentKey(currentSectionContent?.h3, currentSectionContent?.text),
    [currentSectionContent]
  );
  const currentHasBody = !!(currentSectionContent?.h3 || currentSectionContent?.text);

  const renderSectionTitle = (title) => {
    if (!title) return null;

    return (
      <h2
        className={`antiga section-title min-[1400px]:col-5 min-[960px]:col-6 col-12 min-[960px]:mb-0 min-[700px]:mb-7 ${
          isLongSectionTitle(title) ? "long-title" : ""
        }`}
        dangerouslySetInnerHTML={{ __html: title }}
      />
    );
  };

  const renderSectionBody = (content) => {
    if (!(content?.h3 || content?.text)) return null;

    return (
      <>
        {content.h3 && (
          <h3
            className="figure figure-h3 min-[960px]:mt-0 min-[700px]:mt-5 max-[699px]:mt-[4.75rem]"
            dangerouslySetInnerHTML={{ __html: content.h3 }}
          />
        )}
        {content.text && (
          <div
            className="section-text"
            dangerouslySetInnerHTML={{ __html: content.text }}
          />
        )}
      </>
    );
  };

  // Shared renderer for section content inner markup
  const renderSectionInner = (content) => (
    <div className="row">
      <div className="min-[1400px]:push-1 min-[1400px]:col-10 min-[1180px]:col-11 col-12 flex">
        <div className="row">
          {renderSectionTitle(content.title)}
          <div className="section-text-wrap max-[960px]:ml-0 ml-auto min-[1400px]:col-5 min-[1100px]:col-5 min-[960px]:col-6 max-[1180px]:min-[1100px]:push-1 col-12">
            {renderSectionBody(content)}
          </div>
        </div>
      </div>
    </div>
  );

  // Build the cross-fading section content block with ghost height-setter
  const sectionContentBlock = sectionContent ? (
    <div className="slideshow-section-stack">
      {/* Ghost: tallest content in normal flow, invisible, sets the height */}
      {tallestContent && (
        <div
          className={`flex-section-content hw-contain slideshow-section-ghost ${
            !(tallestContent.h3 || tallestContent.text) ? "title-only" : ""
          }`}
          aria-hidden="true"
          role="presentation"
          inert=""
        >
          {renderSectionInner(tallestContent)}
        </div>
      )}

      {/* When the title is identical across slides, keep it mounted and only fade the changing copy */}
      {staticSectionTitle ? (
        <div
          className={`flex-section-content hw-contain slideshow-section-inner slideshow-section-active ${
            !slideshowHasAnyBody ? "title-only" : ""
          }`}
        >
          <div className="row">
            <div className="min-[1400px]:push-1 min-[1400px]:col-10 min-[1180px]:col-11 col-12 flex">
              <div className="row">
                {renderSectionTitle(staticSectionTitle)}
                {slideshowHasAnyBody && (
                  <div className="section-text-wrap max-[960px]:ml-0 ml-auto min-[1400px]:col-5 min-[1100px]:col-5 min-[960px]:col-6 max-[1180px]:min-[1100px]:push-1 col-12">
                    <AnimatePresence mode="wait" initial={false}>
                      {currentHasBody && (
                        <motion.div
                          key={`section-copy-${currentSectionBodyKey}`}
                          initial={{ opacity: 0 }}
                          animate={{
                            opacity: 1,
                            transition: {
                              duration: SECTION_COPY_FADE_IN_DURATION_SECONDS,
                              ease: CUBIC_BEZ_EASE,
                              delay: SECTION_COPY_FADE_IN_DELAY_SECONDS,
                            }
                          }}
                          exit={{
                            opacity: 0,
                            transition: { duration: 0.5, ease: [0.4, 0, 1, 1] }
                          }}
                        >
                          {renderSectionBody(currentSectionContent)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {currentSectionContent && (
            <motion.div
              key={`section-${currentIndex}`}
              className={`flex-section-content hw-contain slideshow-section-inner slideshow-section-active ${
                !(currentSectionContent.h3 || currentSectionContent.text) ? "title-only" : ""
              }`}
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                transition: {
                  duration: SECTION_COPY_FADE_IN_DURATION_SECONDS,
                  ease: CUBIC_BEZ_EASE,
                  delay: SECTION_COPY_FADE_IN_DELAY_SECONDS,
                }
              }}
              exit={{ 
                opacity: 0,
                transition: { duration: 0.5, ease: [0.4, 0, 1, 1] }
              }}
            >
              {renderSectionInner(currentSectionContent)}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  ) : null;

  // Wrap section content in bg color class if needed
  const wrappedSectionContent = sectionContentBlock
    ? sectionBgColorClass
      ? <div className={sectionBgColorClass}>{sectionContentBlock}</div>
      : sectionContentBlock
    : null;

  const exitingSlideInitial = disableBlur
    ? {
        zIndex: 3,
        opacity: 1,
      }
    : {
        zIndex: 3,
        opacity: 1,
        WebkitMaskPosition: "0% 0%",
        maskPosition: "0% 0%",
      };

  const exitingSlideAnimate = disableBlur
    ? {
        zIndex: 3,
        opacity: 0,
        transition: {
          duration: MOBILE_CROSSFADE_DURATION_SECONDS,
          ease: MOBILE_CROSSFADE_EASE,
        },
      }
    : {
        zIndex: 3,
        opacity: 1,
        WebkitMaskPosition: "100% 100%",
        maskPosition: "100% 100%",
        transition: {
          duration: SLIDE_EXIT_DURATION_SECONDS,
          ease: SLIDE_TRANSITION_EASE,
        },
      };

  const exitingSlideStyle = disableBlur
    ? { zIndex: 3, opacity: 1, willChange: "opacity" }
    : maskStyle;

  const renderSlideImage = (entry, index, options = {}) => {
    if (!entry?.imageProps?.src) {
      return null;
    }

    const {
      className = "photo absolute w-full h-full object-cover",
      fetchPriority = index === 0 ? "high" : "low",
      refIndex = index,
    } = options;

    return (
      <img
        ref={(node) => {
          if (typeof refIndex === "number") {
            imageRefs.current[refIndex] = node;
          }
        }}
        draggable={false}
        className={className}
        src={entry.imageProps.src}
        srcSet={entry.imageProps.srcSet}
        sizes="(max-width: 1200px) 100vw, 100vw"
        alt={entry.slide.alt || `Slide ${entry.index + 1}`}
        decoding="async"
        loading="eager"
        fetchpriority={fetchPriority}
      />
    );
  };

  // Image slideshow block
  const slideshowBlock = (
    <div className="full-width-slideshow-wrap relative w-full h-[calc(var(--jsVhUnits100)*.8-var(--headerHeight))]">
      <div className="relative w-full h-full">
        <div
          ref={slideshowTouchRef}
          className="relative w-full h-full overflow-hidden"
        >
          {slidesWithImageProps.map((entry, index) => {
            const isCurrent = index === currentIndex;

            return (
              <figure
                key={`base-${entry.key}`}
                className={`slide-figure absolute inset-0 w-full h-full pointer-events-none ${
                  entry.slide.caption ? "has-caption" : ""
                }`}
                aria-hidden={!isCurrent}
                style={{
                  opacity: isCurrent ? 1 : 0,
                  zIndex: isCurrent ? 1 : 0,
                }}
              >
                <div className="image-wrapper w-full h-full">
                  {renderSlideImage(entry, index)}
                </div>
              </figure>
            );
          })}

          {exitingSlides.map((entry) => (
            <motion.figure
              key={entry.key}
              className={`slide-figure absolute inset-0 w-full h-full pointer-events-none ${
                entry.slide.caption ? "has-caption" : ""
              }`}
              initial={exitingSlideInitial}
              animate={exitingSlideAnimate}
              style={exitingSlideStyle}
              onAnimationComplete={() => {
                swipeTransitionLockRef.current = false;
                setExitingSlides((current) =>
                  current.filter((item) => item.key !== entry.key)
                );
              }}
            >
              <div className="image-wrapper w-full h-full">
                {renderSlideImage(entry, entry.index, {
                  fetchPriority: "low",
                  refIndex: null,
                })}
                {entry.slide.caption && (
                  <motion.figcaption
                    className="slide-caption text-[1.25rem] absolute bottom-10 left-[var(--containerPadding)] text-white z-10"
                    initial={{ opacity: 1 }}
                    animate={{
                      opacity: 0,
                      transition: {
                        duration: disableBlur ? MOBILE_CROSSFADE_DURATION_SECONDS : 0.8,
                        ease: disableBlur ? MOBILE_CROSSFADE_EASE : SLIDE_TRANSITION_EASE,
                      },
                    }}
                  >
                    {entry.slide.caption}
                  </motion.figcaption>
                )}
              </div>
            </motion.figure>
          ))}

          <AnimatePresence initial={false} mode="wait">
            {slide?.caption && (
              <motion.figcaption
                key={`caption-${currentIndex}`}
                className="slide-caption text-[1.25rem] absolute bottom-10 left-[var(--containerPadding)] text-white z-10"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: {
                    duration: captionFadeDuration,
                    ease: [0.2, 1, 0.4, 1],
                    delay: captionFadeDelay,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: 0.8,
                    ease: SLIDE_TRANSITION_EASE,
                  },
                }}
              >
                {slide.caption}
              </motion.figcaption>
            )}
          </AnimatePresence>
        </div>

        <SlideNavigation 
            onNext={handleNext} 
            onPrev={handlePrev}
            canNext={slides.length > 1}
            canPrev={slides.length > 1}
            className="carousel-nav-position"
        />
      </div>
    </div>
  );

  return (
    <div className="slideshow-with-sections">
      {!placeBelow && wrappedSectionContent}
      {slideshowBlock}
      {placeBelow && wrappedSectionContent}
    </div>
  );
}
