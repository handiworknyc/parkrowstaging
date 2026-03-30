import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import SlideNavigation from "../ui/SlideNavigation"; 

const MOBILE_BLUR_MEDIA_QUERY =
  "(max-width: 768px), (hover: none) and (pointer: coarse)";
const SLIDE_EXIT_DURATION_SECONDS = 4;
const SLIDE_TRANSITION_EASE = [0.19, 1, 0.32, 1];

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
        key: slide.id || index,
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
      setCurrentIndex((prevIndex) => {
        if (slidesWithImageProps.length <= 1) {
          return prevIndex;
        }

        const nextIndex = getNextIndex(prevIndex);

        if (nextIndex === prevIndex) {
          return prevIndex;
        }

        const previousEntry = slidesWithImageProps[prevIndex];

        if (previousEntry) {
          transitionCounterRef.current += 1;
          setExitingSlides((current) => [
            ...current,
            {
              key: `exit-${previousEntry.key}-${transitionCounterRef.current}`,
              ...previousEntry,
            },
          ]);
        }

        return nextIndex;
      });
    },
    [slidesWithImageProps]
  );

  const handleNext = useCallback(() => {
    advanceSlide((prev) => (prev + 1) % slidesWithImageProps.length);
  }, [advanceSlide, slidesWithImageProps.length]);

  const handlePrev = useCallback(() => {
    advanceSlide((prev) => (prev - 1 + slidesWithImageProps.length) % slidesWithImageProps.length);
  }, [advanceSlide, slidesWithImageProps.length]);

  const activeEntry = slidesWithImageProps[currentIndex] || null;
  const slide = activeEntry?.slide || slides[0];
  const exitFilter = disableBlur ? "blur(0px)" : "blur(5px)";
  const captionOverlayBlur = disableBlur ? "0px" : "11px";

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
                            transition: { duration: 0.8, ease: [0.2, 1, 0.4, 1], delay: 0.3 }
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
                transition: { duration: 0.8, ease: [0.2, 1, 0.4, 1], delay: 0.3 }
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
        fetchPriority={fetchPriority}
      />
    );
  };

  // Image slideshow block
  const slideshowBlock = (
    <div className="full-width-slideshow-wrap relative w-full h-[calc(var(--jsVhUnits100)*.8-var(--headerHeight))]">
      <div className="relative w-full h-full">
        <div className="relative w-full h-full overflow-hidden">
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
              initial={{
                zIndex: 3,
                opacity: 1,
                WebkitMaskPosition: "0% 0%",
                maskPosition: "0% 0%",
                filter: "blur(0px)",
              }}
              animate={{
                zIndex: 3,
                opacity: 1,
                WebkitMaskPosition: "100% 100%",
                maskPosition: "100% 100%",
                filter: exitFilter,
                transition: {
                  duration: SLIDE_EXIT_DURATION_SECONDS,
                  ease: SLIDE_TRANSITION_EASE,
                },
              }}
              style={maskStyle}
              onAnimationComplete={() => {
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
                        duration: 0.8,
                        ease: SLIDE_TRANSITION_EASE,
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
                    duration: 2.25,
                    ease: [0.2, 1, 0.4, 1],
                    delay: 0.65,
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
