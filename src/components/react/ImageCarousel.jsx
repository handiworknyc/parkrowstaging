"use client"

import { useEffect, useState } from "react"
import { Carousel, useCarousel, useTickerItem } from "motion-plus/react"
import { motion, useTransform } from "motion/react"
import SlideNavigation from "../ui/SlideNavigation" // Adjust path as needed

/* ------------------ Parallax Slide Component ------------------ */
function ParallaxSlide({ image, index }) {
    const { offset } = useTickerItem()

    const x = useTransform(offset, [-500, 0, 500], ["5%", "0%", "-5%"])
    const captionOpacity = useTransform(offset, [-200, 0, 200], [0, 1, 0])
    const captionY = useTransform(offset, [-200, 0, 200], ["10%", "0%", "10%"])

    return (
        <figure className={`slide-figure ${image.caption ? "has-caption" : ""}`}>
            <div className="image-wrapper">
                <motion.img
                    draggable={false}
                    className="photo"
                    src={image.src}
                    alt={image.alt || `Slide ${index + 1}`}
                    style={{
                        aspectRatio: image.aspectRatio || "16/9",
                        x,
                        scale: 1.05,
                    }}
                />

                {image.caption && (
                    <motion.figcaption
                        className="slide-caption"
                        style={{
                            opacity: captionOpacity,
                            y: captionY
                        }}
                    >
                        {image.caption}
                    </motion.figcaption>
                )}
            </div>
        </figure>
    )
}

/* ------------------ Navigation Wrapper ------------------ */
// We create a tiny wrapper to access the hook context
function CarouselControls() {
    try {
        const { nextPage, prevPage, isNextActive, isPrevActive } = useCarousel()
        return (
            <SlideNavigation 
                onNext={nextPage}
                onPrev={prevPage}
                canNext={isNextActive}
                canPrev={isPrevActive}
                className="carousel-nav-position" // Used for CSS positioning
            />
        )
    } catch (err) {
        return null
    }
}

/* ------------------ Main Carousel ------------------ */
export default function ImageCarousel({ images }) {
    if (!Array.isArray(images) || images.length === 0) return null

    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    return (
        <article
            className="carousel-wrapper carousel-fade-wrapper"
            data-mounted={mounted}
        >
            <div className="carousel-container">
                <div className="carousel-center-mask">
                    <Carousel
                        className="carousel"
                        items={images.map((image, index) => (
                            <ParallaxSlide
                                key={image.id || index}
                                image={image}
                                index={index}
                            />
                        ))}
                        overflow
                        gap={20}
                        snap="page"
                        loop={true}
                        align="center"
                    >
                        <CarouselControls />
                    </Carousel>
                </div>
            </div>

            <Stylesheet />
            <FadeStyles />
        </article>
    )
}

/* ------------------ Stylesheet ------------------ */
function FadeStyles() {
    return (
        <style>{`
            .carousel-fade-wrapper {
                opacity: 0;
                will-change: opacity;
                transition: opacity .55s var(--cubicBez, ease-out);
            }
            .carousel-fade-wrapper[data-mounted="true"] {
                opacity: 1;
            }
        `}</style>
    )
}

function Stylesheet() {
    return (
        <style>{`
            .carousel-center-mask { width: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden; }
            .ticker-item { overflow: hidden; }
            .carousel { width: min(80vw, 900px); }

            /* Positioning for the new SlideNavigation component specific to this Carousel */
            .carousel-nav-position {
                position: absolute; 
                bottom: -6rem; 
                right: var(--containerPadding, 0); 
            }

            .carousel li:hover { cursor: grab; }
            .carousel li:active { cursor: grabbing; }

            .carousel li {
                width: min(50vw, 900px) !important;
                flex: 0 0 min(50vw, 900px) !important;
                display: flex; justify-content: center; align-items: flex-start;
            }

            .slide-figure { width: 100%; margin: 0; position: relative; }

            .image-wrapper {
                width: 100%;
                overflow: hidden;
                position: relative;
                border-radius: 1.333rem;
                corner-shape: squircle;
            }
            
            .photo {
                height: round(nearest, calc(var(--jsVhUnits100) * .75), 1rem);
                max-height: round(nearest, calc(var(--jsVhUnits100) * .75), 1rem);
                max-width: 100%; min-width: 100%; 
                object-fit: cover; 
                display: block; 
                will-change: transform;
            }

            .slide-caption {
                position: absolute;
                bottom: 1.4rem;
                left: 1.8rem;
                z-index: 10;
                font-size: 1.25rem;
                font-weight: 500;
                letter-spacing: 0.02em;
                color: white;
                text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                max-width: 80%;
                text-align: left;
                pointer-events: none;
                will-change: transform, opacity;
            }

            .has-caption .image-wrapper::before {
                content: "";
                position: absolute;
                inset: -0.75rem -1rem;
                z-index: 2;
                mix-blend-mode: multiply;
                background: linear-gradient(
                    32deg,
                    rgba(0,0,0,0.55) 0%,
                    rgba(0,0,0,0.4) 7%,
                    rgba(0,0,0,0.0) 17%
                );
                border-radius: 6px;
                filter: blur(11px);
                pointer-events: none;
            }
        `}</style>
    )
}