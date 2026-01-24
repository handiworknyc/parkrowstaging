import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import SlideNavigation from "../ui/SlideNavigation";

/* ------------------ Slide Component ------------------ */
const Slide = React.memo(
  function Slide({ image, index }) {
    return (
      <figure className={image.caption ? "slide-figure has-caption" : "slide-figure"}>
        <div className="image-wrapper">
          <img
            draggable={false}
            className="photo"
            src={image.src}
            alt={image.alt}
            decoding="async"
            loading="eager"
            style={{
              aspectRatio: image.aspectRatio,
            }}
          />
          {image.caption && (
            <figcaption className="slide-caption">{image.caption}</figcaption>
          )}
        </div>
      </figure>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if image data actually changed
    return (
      prevProps.image.src === nextProps.image.src &&
      prevProps.image.caption === nextProps.image.caption &&
      prevProps.image.alt === nextProps.image.alt
    );
  }
);

/* ------------------ Main Component ------------------ */
export default function ImageCarousel({ images }) {
  const [api, setApi] = useState(null);
  const [ready, setReady] = useState(false);
  const [navState, setNavState] = useState({
    current: 0,
    canPrev: false,
    canNext: true,
  });

  // Memoize carousel options to prevent recreation on every render
  const carouselOpts = useMemo(
    () => ({
      align: "center",
      loop: true,
      skipSnaps: false,
      dragFree: false,
      duration: 35,
      watchSlides: true,
    }),
    []
  );

  // Single state update for navigation (reduces re-renders)
  const updateNav = useCallback(() => {
    if (!api) return;

    setNavState({
      current: api.selectedScrollSnap() + 1,
      canPrev: api.canScrollPrev(),
      canNext: api.canScrollNext(),
    });
  }, [api]);

  useEffect(() => {
    if (!api) return;

    let mounted = true;

    const handleReady = () => {
      if (!mounted) return;
      setReady(true);
    };

    // Check if already ready
    if (api.slidesInView?.().length > 0) {
      handleReady();
    } else {
      api.on("slidesInView", handleReady);
      api.on("reInit", handleReady);
    }

    // Initial navigation state
    updateNav();
    api.on("select", updateNav);

    return () => {
      mounted = false;
      api.off("slidesInView", handleReady);
      api.off("reInit", handleReady);
      api.off("select", updateNav);
    };
  }, [api, updateNav]);

  const handlePrev = useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const handleNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  // Early return after hooks (React rules)
  if (!Array.isArray(images) || images.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ImageCarousel] No images provided");
    }
    return null;
  }

  return (
    <article className="carousel-wrapper" data-ready={ready}>
      <div className="carousel-container">
        <Carousel setApi={setApi} className="w-full mx-auto" opts={carouselOpts}>
          <CarouselContent className="-ml-5">
            {images.map((image, index) => (
              <CarouselItem
                key={image.id}
                className="pl-5 basis-[85%] min-[1400px]:basis-[60%]"
              >
                <Slide image={image} index={index} />
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="carousel-nav-position">
            <SlideNavigation
              onNext={handleNext}
              onPrev={handlePrev}
              canNext={navState.canNext}
              canPrev={navState.canPrev}
            />
          </div>
        </Carousel>
      </div>
    </article>
  );
}