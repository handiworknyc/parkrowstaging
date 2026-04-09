import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import SlideNavigation from "../ui/SlideNavigation";

const MOBILE_BLUR_MEDIA_QUERY =
  "(max-width: 768px), (hover: none) and (pointer: coarse)";
const DESKTOP_MASK_TRANSITION_DURATION_SECONDS = 1.2;
const DESKTOP_MASK_TRANSITION_EASE = [0.42, 0, 0.58, 1];
const MOBILE_CROSSFADE_DURATION_SECONDS = 1.35;
const SLIDE_TRANSITION_EASE = [0.19, 1, 0.32, 1];
const MOBILE_CROSSFADE_EASE = [0.4, 0, 0.2, 1];
const CUBIC_BEZ_EASE = [0.36, 0.01, 0.1, 1.01];
const CAPTION_FADE_DURATION_SECONDS = 0.6;
const SECTION_COPY_FADE_IN_DURATION_SECONDS = 1.1;
const SECTION_COPY_FADE_IN_DELAY_SECONDS = 0.2;
const SWIPE_MIN_DISTANCE_PX = 48;
const SWIPE_AXIS_LOCK_RATIO = 1.25;
const DESKTOP_MASK_OPAQUE_STOP_PERCENT = 35;
const DESKTOP_MASK_TRANSPARENT_STOP_PERCENT = 65;
const DESKTOP_MASK_SIZE_PERCENT = 500;
// Trim the fully-hidden / fully-visible dead travel from the old 100% -> 0%
// sweep so the visible wipe keeps the same softness at a shorter duration.
const DESKTOP_MASK_START_POSITION_PERCENT = 82;
const DESKTOP_MASK_END_POSITION_PERCENT = 18;

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
  // enteringSlide: the slide being revealed on top; currentIndex stays on the old slide
  // until the animation completes, then flips to the new index.
  const [enteringSlide, setEnteringSlide] = useState(null);
  const imageRefs = useRef([]);
  const slideshowTouchRef = useRef(null);
  const swipeStartRef = useRef(null);
  const swipeCurrentRef = useRef(null);
  const swipeTransitionLockRef = useRef(false);
  const transitionCounterRef = useRef(0);
  // When a transition completes, the incoming caption should appear instantly
  // rather than fading in from opacity 0 — prevents a visible caption gap
  // between the overlay caption (which disappears) and the base caption (which mounts).
  const captionInstantRef = useRef(false);

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
      setEnteringSlide(null);
      return;
    }

    setCurrentIndex((prev) => Math.min(prev, slidesWithImageProps.length - 1));
  }, [slidesWithImageProps.length]);

  // Two-phase cleanup + caption instant-flag management, all in one effect to
  // guarantee correct ordering across render cycles:
  //
  //   Render A (currentIndex just flipped, enteringSlide still set):
  //     → sets captionInstantRef = true, calls setEnteringSlide(null) → Render B
  //
  //   Render B (enteringSlide now null):
  //     → caption reads captionInstantRef = true → mounts at opacity 1 (no flash)
  //     → this effect's else-branch resets captionInstantRef = false for next time
  //
  // Keeping both branches in the same [currentIndex, enteringSlide] effect ensures
  // the reset happens in Render B's effect flush, not in Render A's (which would
  // clear the flag before Render B ever reads it).
  useEffect(() => {
    if (enteringSlide && currentIndex === enteringSlide.targetIndex) {
      captionInstantRef.current = true;
      setEnteringSlide(null);
    } else if (!enteringSlide) {
      // Render B: caption has mounted at opacity 1 — safe to reset for next use.
      captionInstantRef.current = false;
    }
  }, [currentIndex, enteringSlide]);

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
      // Use ref-based guard so the check is never stale across React renders.
      // A state-based check (enteringSlide !== null) would be captured in the
      // useCallback closure and remain true until the callback is rememoized
      // (i.e. until the *next* render), causing the buttons to feel locked
      // even after the animation has finished.
      if (swipeTransitionLockRef.current) {
        return;
      }

      if (slidesWithImageProps.length <= 1) {
        return;
      }

      const nextIndex = getNextIndex(currentIndex);

      if (nextIndex === currentIndex) {
        return;
      }

      const nextEntry = slidesWithImageProps[nextIndex];

      if (!nextEntry) {
        return;
      }

      // Lock for both mobile and desktop — cleared inside flushSync in
      // onAnimationComplete, so it's always released before React queues effects.
      swipeTransitionLockRef.current = true;

      transitionCounterRef.current += 1;
      const enterEntry = {
        ...nextEntry,
        // Unique key so React always mounts a fresh motion element
        key: `enter-${nextEntry.key}-${transitionCounterRef.current}`,
        // Store the target index so onAnimationComplete can flip currentIndex
        targetIndex: nextIndex,
      };

      // Only set enteringSlide — do NOT touch currentIndex yet.
      // currentIndex flips in onAnimationComplete, after the overlay has
      // fully animated in. This guarantees the new slide is never visible
      // for even a single frame before the animation begins.
      setEnteringSlide(enterEntry);
    },
    [slidesWithImageProps, currentIndex]
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

    if (!start || !end || slidesWithImageProps.length <= 1 || swipeTransitionLockRef.current) {
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
  }, [clearSwipeGesture, handleNext, handlePrev, slidesWithImageProps.length]);

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
  const captionFadeDuration = CAPTION_FADE_DURATION_SECONDS;
  const captionFadeDelay = disableBlur ? 0.15 : 0;

  // During a transition the "display index" is the entering slide's index so that
  // captions and section content switch at the start of the transition, not the end.
  const displayIndex = enteringSlide?.targetIndex ?? currentIndex;
  const displaySlide = slidesWithImageProps[displayIndex]?.slide || slides[0];

  // Resolve section content for the current slide
  const currentSectionContent = useMemo(
    () => resolveSectionContent(displaySlide, sectionContent),
    [displaySlide, sectionContent]
  );

  // UPDATED: Extremely wide gradient for feathering
  const maskStyle = {
    WebkitMaskImage: `linear-gradient(135deg, black ${DESKTOP_MASK_OPAQUE_STOP_PERCENT}%, transparent ${DESKTOP_MASK_TRANSPARENT_STOP_PERCENT}%)`,
    maskImage: `linear-gradient(135deg, black ${DESKTOP_MASK_OPAQUE_STOP_PERCENT}%, transparent ${DESKTOP_MASK_TRANSPARENT_STOP_PERCENT}%)`,
    WebkitMaskSize: `${DESKTOP_MASK_SIZE_PERCENT}% ${DESKTOP_MASK_SIZE_PERCENT}%`,
    maskSize: `${DESKTOP_MASK_SIZE_PERCENT}% ${DESKTOP_MASK_SIZE_PERCENT}%`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
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
              key={`section-${displayIndex}`}
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

  // Entering slide animation config.
  //
  // Desktop (mask wipe): the overlay starts fully hidden and animates only
  // across the portion of the mask path where the wipe is actually visible.
  // That keeps the same soft reveal while avoiding the dead travel that made
  // the old 4s timing feel sluggish.
  //
  // Mobile (crossfade): overlay starts at opacity 0 and fades to opacity 1.
  // In both cases currentIndex only flips in onAnimationComplete, after the
  // overlay is already fully visible, so there is no flash at either end.
  const enteringSlideInitial = disableBlur
    ? { opacity: 0 }
    : {
        opacity: 1,
        WebkitMaskPosition: `${DESKTOP_MASK_START_POSITION_PERCENT}% ${DESKTOP_MASK_START_POSITION_PERCENT}%`,
        maskPosition: `${DESKTOP_MASK_START_POSITION_PERCENT}% ${DESKTOP_MASK_START_POSITION_PERCENT}%`,
      };

  const enteringSlideAnimate = disableBlur
    ? {
        opacity: 1,
        transition: {
          duration: MOBILE_CROSSFADE_DURATION_SECONDS,
          ease: MOBILE_CROSSFADE_EASE,
        },
      }
    : {
        opacity: 1,
        WebkitMaskPosition: `${DESKTOP_MASK_END_POSITION_PERCENT}% ${DESKTOP_MASK_END_POSITION_PERCENT}%`,
        maskPosition: `${DESKTOP_MASK_END_POSITION_PERCENT}% ${DESKTOP_MASK_END_POSITION_PERCENT}%`,
        transition: {
          duration: DESKTOP_MASK_TRANSITION_DURATION_SECONDS,
          ease: DESKTOP_MASK_TRANSITION_EASE,
        },
      };

  // The style prop is applied by React synchronously on mount — before any
  // Framer Motion useLayoutEffect — so it guarantees the overlay starts in
  // the correct hidden state on the very first paint.
  const enteringSlideStyle = disableBlur
    ? { zIndex: 3, opacity: 0, willChange: "opacity" }
    : {
        ...maskStyle,
        zIndex: 3,
        WebkitMaskPosition: `${DESKTOP_MASK_START_POSITION_PERCENT}% ${DESKTOP_MASK_START_POSITION_PERCENT}%`,
        maskPosition: `${DESKTOP_MASK_START_POSITION_PERCENT}% ${DESKTOP_MASK_START_POSITION_PERCENT}%`,
      };

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

          {/* Entering overlay: new slide animates in from fully hidden to fully visible.
              currentIndex does not change until onAnimationComplete, so the old slide
              remains the "base" throughout — no flash is possible. */}
          {enteringSlide && (
            <motion.figure
              key={enteringSlide.key}
              className={`slide-figure absolute inset-0 w-full h-full pointer-events-none ${
                enteringSlide.slide.caption ? "has-caption" : ""
              }`}
              initial={enteringSlideInitial}
              animate={enteringSlideAnimate}
              style={enteringSlideStyle}
              onAnimationComplete={() => {
                // flushSync forces React to commit the base-layer update
                // synchronously, before Framer Motion can do any post-animation
                // style cleanup (e.g. resetting WebkitMaskPosition). After this
                // returns the new base slide is already painted, so whatever
                // happens to the overlay afterward cannot cause a visible flash.
                // The useEffect above then clears enteringSlide on the next render.
                flushSync(() => {
                  swipeTransitionLockRef.current = false;
                  setCurrentIndex(enteringSlide.targetIndex);
                });
              }}
            >
              <div className="image-wrapper w-full h-full">
                {renderSlideImage(enteringSlide, enteringSlide.index, {
                  fetchPriority: "low",
                  refIndex: null,
                })}
                {enteringSlide.slide.caption && (
                  <motion.figcaption
                    className="slide-caption text-[1.25rem] absolute bottom-10 left-[var(--containerPadding)] text-white z-10"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: {
                        duration: captionFadeDuration,
                        ease: CUBIC_BEZ_EASE,
                        delay: captionFadeDelay,
                      },
                    }}
                  >
                    {enteringSlide.slide.caption}
                  </motion.figcaption>
                )}
              </div>
            </motion.figure>
          )}

          <AnimatePresence initial={false} mode="wait">
            {slide?.caption && !enteringSlide && (
              <motion.figcaption
                key={`caption-${currentIndex}`}
                className="slide-caption text-[1.25rem] absolute bottom-10 left-[var(--containerPadding)] text-white z-10"
                initial={{ opacity: captionInstantRef.current ? 1 : 0 }}
                animate={{
                  opacity: 1,
                  transition: {
                    duration: captionFadeDuration,
                    ease: CUBIC_BEZ_EASE,
                    delay: captionFadeDelay,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: CAPTION_FADE_DURATION_SECONDS,
                    ease: CUBIC_BEZ_EASE,
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
