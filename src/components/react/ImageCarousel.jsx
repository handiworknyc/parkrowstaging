import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import SlideNavigation from "../ui/SlideNavigation";

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
  }
);

export default function ImageCarousel({ images }) {
  const [api, setApi] = useState(null);
  const [ready, setReady] = useState(false);
  const [navState, setNavState] = useState({
    current: 0,
    canPrev: false,
    canNext: true,
  });

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

    return () => {
      api.off("init", handleReady);
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

  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  return (
    <article className="carousel-wrapper" data-ready={ready} suppressHydrationWarning>
      <div className="carousel-container" suppressHydrationWarning>
        <Carousel setApi={setApi} className="w-full mx-auto" opts={carouselOpts}>
          <CarouselContent className="-ml-5">
            {images.map((image, index) => (
              <CarouselItem
                key={image.id}
                className="pl-5 basis-[85%] min-[1400px]:basis-[60%] min-[2200px]:basis-[40%]"
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