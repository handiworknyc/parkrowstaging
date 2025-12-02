// src/components/react/ImageCarousel.jsx
"use client"

import { Carousel, useCarousel, useTickerItem } from "motion-plus/react"
import { motion, useTransform } from "motion/react"

console.log("Checking imports:", { Carousel, useCarousel, useTickerItem })

/* ------------------ Parallax Slide Component ------------------ */
function ParallaxSlide({ image, index }) {
    const { offset } = useTickerItem()

    // Subtle horizontal parallax
    const x = useTransform(offset, [-500, 0, 500], ["5%", "0%", "-5%"])

    return (
        <motion.img
            draggable={false}
            className="photo"
            src={image.src}
            alt={image.alt || `Slide ${index + 1}`}
            style={{
                aspectRatio: image.aspectRatio || "16/9",
                x,
                scale: 1.05, // subtle zoom like demo
            }}
            onLoad={() => console.log(`Loaded image ${index}`)}
            onError={(e) => console.error(`Image ${index} error`, e)}
        />
    )
}

/* ------------------ Navigation ------------------ */
function Navigation() {
    try {
        const { nextPage, prevPage, isNextActive, isPrevActive } = useCarousel()

        return (
            <nav className="navigation">
                <motion.button
                    className="nav-arrow"
                    onClick={prevPage}
                    animate={{ opacity: isPrevActive ? 1 : 0.3 }}
                >
                    <ChevronLeftIcon />
                </motion.button>
                <motion.button
                    className="nav-arrow"
                    onClick={nextPage}
                    animate={{ opacity: isNextActive ? 1 : 0.3 }}
                >
                    <ChevronRightIcon />
                </motion.button>
            </nav>
        )
    } catch (err) {
        console.error("Navigation error", err)
        return null
    }
}

/* ------------------ Main Carousel ------------------ */
export default function ImageCarousel({ images }) {
    if (!Array.isArray(images) || images.length === 0) return null

    return (
        <article className="carousel-wrapper">
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
                        loop="true"
                        align="center"
                    >
                        <Navigation />
                    </Carousel>

                </div>
            </div>

            <Stylesheet />
        </article>
    )
}

/* ------------------ Stylesheet ------------------ */
function Stylesheet() {
    return (
        <style>{`
            .carousel-center-mask {
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                overflow: hidden;
            }

			.ticker-item {
				overflow: hidden
			}
            
			.carousel {
                width: min(80vw, 900px);
            }
            .carousel li {
                width: min(50vw, 900px) !important;
                flex: 0 0 min(50vw, 900px) !important;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .photo {
                height: round(nearest, calc(var(--jsVhUnits100) * .75), 1rem);
                max-height: round(nearest, calc(var(--jsVhUnits100) * .75), 1rem);
                max-width: 100%;
                min-width: 100%;
                object-fit: cover;
                display: block;
                margin-inline: auto;
                will-change: transform;
            }

			.navigation {
				position: absolute;
				bottom: -6rem;
				right: var(--containerPadding);
				display: flex;
				align-items: center;
				gap: 16px;
				z-index: 30;
			}

			.nav-arrow {
				background: none;
				border: none;
				color: white;
				cursor: pointer;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 50%;
				transition: opacity 0.2s ease, transform 0.2s ease;
				will-change: transform, opacity;
				backface-visibility: hidden;
				transform: translateZ(0);
				svg {
					width: 4rem;
					height: 4rem
				}
			}

			.nav-arrow:hover {
				opacity: 0.8;
				transform: scale(1.05) translateZ(0);
			}

			.nav-arrow:focus-visible {
				outline: 2px solid white;
			}

			.nav-arrow:disabled {
				opacity: 0.3;
				cursor: not-allowed;
			}

        `}</style>
    )
}


function ChevronLeftIcon() {
    return (
        <svg
            width="36"
            height="34"
            viewBox="0 0 36 34"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Background pill */}
            <rect
                x="1"
                y="0"
                width="34"
                height="34"
                rx="17"
                fill="#EDEDED"
                fillOpacity="0.8"
            />

            {/* Arrow */}
            <path
                d="M24.2856 17.5C24.5618 17.5 24.7856 17.2761 24.7856 17C24.7856 16.7239 24.5618 16.5 24.2856 16.5L24.2856 17.5ZM9.36066 16.6464C9.1654 16.8417 9.1654 17.1583 9.36066 17.3536L12.5426 20.5355C12.7379 20.7308 13.0545 20.7308 13.2497 20.5355C13.445 20.3403 13.445 20.0237 13.2497 19.8284L10.4213 17L13.2498 14.1716C13.445 13.9763 13.445 13.6597 13.2498 13.4645C13.0545 13.2692 12.7379 13.2692 12.5426 13.4645L9.36066 16.6464ZM24.2856 16.5L9.71422 16.5L9.71422 17.5L24.2856 17.5L24.2856 16.5Z"
                fill="#3A2A22"
            />
        </svg>
    )
}


function ChevronRightIcon() {
    return (
        <svg
            width="36"
            height="34"
            viewBox="0 0 36 34"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Background pill */}
            <rect
                x="1"
                y="0"
                width="34"
                height="34"
                rx="17"
                fill="#EDEDED"
                fillOpacity="0.8"
            />

            {/* Arrow */}
            <path
                d="M9.71436 16.5C9.43821 16.5 9.21436 16.7239 9.21436 17C9.21436 17.2761 9.43821 17.5 9.71436 17.5V16.5ZM24.6393 17.3536C24.8346 17.1583 24.8346 16.8417 24.6393 16.6464L21.4574 13.4645C21.2621 13.2692 20.9455 13.2692 20.7502 13.4645C20.555 13.6597 20.555 13.9763 20.7502 14.1716L23.5787 17L20.7502 19.8284C20.555 20.0237 20.555 20.3403 20.7502 20.5355C20.9455 20.7308 21.2621 20.7308 21.4574 20.5355L24.6393 17.3536ZM9.71436 17.5H24.2858V16.5H9.71436V17.5Z"
                fill="#3A2A22"
            />
        </svg>
    )
}
