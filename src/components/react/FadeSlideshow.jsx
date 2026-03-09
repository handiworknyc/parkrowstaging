import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import SlideNavigation from "../ui/SlideNavigation"; 

const MOBILE_BLUR_MEDIA_QUERY =
  "(max-width: 768px), (hover: none) and (pointer: coarse)";

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

export default function FadeSlideshow({ slides }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [disableBlur, setDisableBlur] = useState(false);

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

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const slide = slides[currentIndex];
  const { src: primary, srcSet } = getSlideImageProps(slide);
  const exitFilter = disableBlur ? "blur(0px)" : "blur(5px)";
  const captionOverlayBlur = disableBlur ? "0px" : "11px";

  // ---- Variants & Styles ----
  const wipeVariants = {
    initial: { 
        zIndex: 1, 
        opacity: 1,
        filter: "blur(0px)" 
    },
    animate: {
      zIndex: 2,
      opacity: 1,
      WebkitMaskPosition: "0% 0%",
      maskPosition: "0% 0%",
      filter: "blur(0px)"
    },
    exit: {
      zIndex: 3,
      opacity: 1,
      WebkitMaskPosition: "100% 100%",
      maskPosition: "100% 100%",
      filter: exitFilter,
      transition: { duration: 4, ease:  [0.19, 1, 0.32, 1] },
    },
  };

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

  return (
    <div className="relative w-full h-full">
      <div className="relative w-full h-full overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.figure
            key={currentIndex}
            className={`slide-figure absolute inset-0 w-full h-full ${
              slide.caption ? "has-caption" : ""
            }`}
            variants={wipeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={maskStyle}
          >
            <div className="image-wrapper w-full h-full">
              <motion.img
                draggable={false}
                className="photo absolute w-full h-full object-cover"
                src={primary}
                srcSet={srcSet}
                sizes="(max-width: 1200px) 100vw, 100vw"
                alt={slide.alt || `Slide ${currentIndex + 1}`}
                decoding="async" 
              />

              {slide.caption && (
                <motion.figcaption
                  className="slide-caption text-[1.25rem] absolute bottom-10 left-[var(--containerPadding)] text-white z-10"
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: 1, 
                    transition: { 
                        duration: 2.25, 
                        ease: [0.2, 1, 0.4, 1], 
                        delay: 0.65
                    }
                  }}
                  exit={{ 
                    opacity: 0, 
                    transition: { duration: 0.8, ease:  [0.19, 1, 0.32, 1] } 
                  }}
                >
                  {slide.caption}
                </motion.figcaption>
              )}
            </div>
          </motion.figure>
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
  );
}
