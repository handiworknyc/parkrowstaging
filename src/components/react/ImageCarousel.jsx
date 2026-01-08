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
                className="pl-5 basis-[85%] md:basis-[60%]"
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

      <Stylesheet />
    </article>
  );
}

/* ------------------ Stylesheet ------------------ */
function Stylesheet() {
  return (
    <style>{`
      /* 1. Wrapper Logic */
      .carousel-wrapper {
        width: 100%;
        opacity: 0;
        transform: scale(0.99); /* Tiny scale for better entry feel */
        transition: opacity 0.5s ease-out, transform 0.5s ease-out;
        will-change: opacity, transform;
      }

      .carousel-wrapper[data-ready="true"] {
        opacity: 1;
        transform: scale(1);
      }

      /* 2. Navigation */
      .carousel-nav-position {
        position: absolute;
        bottom: -6rem;
        right: var(--containerPadding, 0);
        z-index: 10;
      }

      /* 3. Slide Layout */
      .slide-figure {
        width: 100%;
        margin: 0;
        position: relative;
      }

      .image-wrapper {
        width: 100%;
        overflow: hidden;
        position: relative;
        pointer-events: none;
        user-select: none;
        border-radius: 1.333rem;
        
        backface-visibility: hidden;
        transform: translateZ(0);
        -webkit-mask-image: -webkit-radial-gradient(white, black);
      }

      .photo {
        backface-visibility: hidden;
        height: calc(var(--jsVhUnits100, 100vh) * 0.75);
        max-height: calc(var(--jsVhUnits100, 100vh) * 0.75);
        width: 100%;
        object-fit: cover;
        display: block;
        pointer-events: none;
      }

      /* 4. Captions */
      .slide-caption {
        position: absolute;
        bottom: 1.4rem;
        left: 1.8rem;
        z-index: 10;
        font-size: 1.25rem;
        font-weight: 500;
        letter-spacing: 0.02em;
        color: white;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        max-width: 80%;
        text-align: left;
        pointer-events: none;
      }

      .has-caption .image-wrapper::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 2;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.6) 0%,
          rgba(0, 0, 0, 0.3) 15%,
          rgba(0, 0, 0, 0) 40%
        );
        pointer-events: none;
        border-radius: inherit;
      }
    `}</style>
  );
}