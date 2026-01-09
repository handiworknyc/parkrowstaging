"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

import SlideNavigation from "../ui/SlideNavigation";
import { getWpImage } from "../../lib/wp/get-wp-image.js";

/* ------------------ Standard Slide Component ------------------ */
const Slide = React.memo(function Slide({ image, index }) {
  const localSrc = getWpImage(image.src);

  return (
    <figure
      className={`slide-figure ${image.caption ? "has-caption" : ""}`}
    >
      <div className="image-wrapper">
        <img
          draggable={false}
          className="photo"
          src={localSrc}
          alt={image.alt || `Slide ${index + 1}`}
          decoding="async"
          loading={index === 0 ? "eager" : "lazy"}
          style={{
            aspectRatio: image.aspectRatio || "16/9",
          }}
        />
        {image.caption && (
          <figcaption className="slide-caption">
            {image.caption}
          </figcaption>
        )}
      </div>
    </figure>
  );
});

/* ------------------ Main Component ------------------ */
export default function ImageCarousel({ images }) {
  if (!Array.isArray(images) || images.length === 0) return null;

  const [api, setApi] = useState(null);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  useEffect(() => {
    if (!api) return;

    // 1. Define the ready handler
    const onReady = () => {
      setReady(true);
      // Clean up listener to avoid memory leaks
      api.off("slidesInView", onReady);
      api.off("reInit", onReady);
    };

    // 2. Event Listeners (The "API way")
    // 'slidesInView' fires when Embla has finished calculating which slides are visible.
    // 'reInit' fires if the window resizes or DOM changes, ensuring we stay ready.
    api.on("slidesInView", onReady);
    api.on("reInit", onReady);

    // 3. Initial Check
    // If Embla initialized extremely fast (before this Effect ran),
    // the event might have already fired. We check manually:
    if (api.slidesInView().length > 0) {
       onReady();
    }

    // 4. Standard Navigation Listeners
    setCurrent(api.selectedScrollSnap() + 1);
    setCanPrev(api.canScrollPrev());
    setCanNext(api.canScrollNext());

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
      setCanPrev(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    });
    
    // Cleanup on unmount
    return () => {
      api.off("slidesInView", onReady);
      api.off("reInit", onReady);
    };
  }, [api]);

  const handlePrev = useCallback(() => api?.scrollPrev(), [api]);
  const handleNext = useCallback(() => api?.scrollNext(), [api]);

  return (
    <article
      className="carousel-wrapper"
      data-ready={ready}
    >
      <div className="carousel-container">
        <Carousel
          setApi={setApi}
          className="w-full mx-auto"
          opts={{
            align: "center",
            loop: true,
            skipSnaps: false,
            dragFree: false,
            duration: 35,
            // Optimization: Watch slides to ensure events fire on visibility changes
            watchSlides: true 
          }}
        >
          <CarouselContent className="-ml-5">
            {images.map((image, index) => (
              <CarouselItem
                key={image.id || index}
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
              canNext={canNext}
              canPrev={canPrev}
            />
          </div>
        </Carousel>
      </div>

    </article>
  );
}
