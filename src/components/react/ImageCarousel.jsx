import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import SlideNavigation from "../ui/SlideNavigation";

const Slide = React.memo(
  function Slide({ image }) {
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
  }
);

export default function ImageCarousel({ images, instanceId }) {
  const [api, setApi] = useState(null);
  const [ready, setReady] = useState(false);
  const [navState, setNavState] = useState({
    current: 0,
    canPrev: false,
    canNext: true,
  });
  const rootRef = useRef(null);
  const frameIdsRef = useRef([]);

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

  const clearScheduledReinit = useCallback(() => {
    frameIdsRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
    frameIdsRef.current = [];
  }, []);

  const updateNav = useCallback(() => {
    if (!api) return;

    setNavState({
      current: api.selectedScrollSnap() + 1,
      canPrev: api.canScrollPrev(),
      canNext: api.canScrollNext(),
    });
  }, [api]);

  const scheduleReinit = useCallback(() => {
    if (!api?.reInit) return;

    clearScheduledReinit();

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        api.reInit();
        setReady(true);
        updateNav();
      });

      frameIdsRef.current = frameIdsRef.current.filter((id) => id !== firstFrame);
      frameIdsRef.current.push(secondFrame);
    });

    frameIdsRef.current.push(firstFrame);
  }, [api, clearScheduledReinit, updateNav]);

  useEffect(() => {
    if (!api) return;

    const handleReady = () => {
      setReady(true);
      updateNav();
    };

    // Initialize immediately if slides exist
    if (api.slideNodes?.().length > 0) {
      handleReady();
    }

    api.on("init", handleReady);
    api.on("reInit", handleReady);
    api.on("select", updateNav);

    scheduleReinit();

    return () => {
      api.off("init", handleReady);
      api.off("reInit", handleReady);
      api.off("select", updateNav);
    };
  }, [api, scheduleReinit, updateNav]);

  useEffect(() => {
    if (!api || !rootRef.current) return;

    const handleAstroPageLoad = () => scheduleReinit();
    const handleLocoReady = () => scheduleReinit();
    const handleResize = () => scheduleReinit();
    const handleAssetLoad = (event) => {
      const target = event.target;
      if (target?.tagName === "IMG" || target?.tagName === "VIDEO") {
        scheduleReinit();
      }
    };

    document.addEventListener("astro:page-load", handleAstroPageLoad);
    document.addEventListener("loco:ready", handleLocoReady);
    window.addEventListener("resize", handleResize, { passive: true });
    rootRef.current.addEventListener("load", handleAssetLoad, true);

    let resizeObserver = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        scheduleReinit();
      });
      resizeObserver.observe(rootRef.current);
    }

    return () => {
      document.removeEventListener("astro:page-load", handleAstroPageLoad);
      document.removeEventListener("loco:ready", handleLocoReady);
      window.removeEventListener("resize", handleResize);
      rootRef.current?.removeEventListener("load", handleAssetLoad, true);
      resizeObserver?.disconnect();
      clearScheduledReinit();
    };
  }, [api, clearScheduledReinit, scheduleReinit]);

  const handlePrev = useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const handleNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  return (
    <article
      ref={rootRef}
      className="carousel-wrapper"
      data-ready={ready}
      data-carousel-instance={instanceId || undefined}
    >
      <div className="carousel-container">
        <Carousel setApi={setApi} className="w-full mx-auto" opts={carouselOpts}>
          <CarouselContent className="-ml-5">
            {images.map((image) => (
              <CarouselItem
                key={image.id}
                className="pl-5 basis-[85%] min-[1400px]:basis-[60%] min-[2200px]:basis-[40%]"
              >
                <Slide image={image} />
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
