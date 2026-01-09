"use client"
import { motion } from "motion/react" 

export default function SlideNavigation({ 
    onPrev, 
    onNext, 
    canPrev = true, 
    canNext = true,
    className = "" 
}) {
    // Shared animation props
    const buttonAnim = {
        whileHover: { scale: 1.03 },
        whileTap: { scale: 0.97 },
        transition: { type: "spring", stiffness: 400, damping: 21 }
    }

    return (
        <>
            <nav className={`slide-navigation ${className}`}>
                <motion.button
                    className="nav-arrow"
                    onClick={onPrev}
                    animate={{ opacity: canPrev ? 1 : 0.3 }}
                    disabled={!canPrev}
                    {...buttonAnim}
                >
                    <ChevronLeftIcon />
                </motion.button>
                <motion.button
                    className="nav-arrow"
                    onClick={onNext}
                    animate={{ opacity: canNext ? 1 : 0.3 }}
                    disabled={!canNext}
                    {...buttonAnim}
                >
                    <ChevronRightIcon />
                </motion.button>
            </nav>
        </>
    )
}

function ChevronLeftIcon() { return <svg width="36" height="34" viewBox="0 0 36 34" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="0" width="34" height="34" rx="17" fill="#EDEDED" fillOpacity="0.8" /><path d="M24.2856 17.5C24.5618 17.5 24.7856 17.2761 24.7856 17C24.7856 16.7239 24.5618 16.5 24.2856 16.5L24.2856 17.5ZM9.36066 16.6464C9.1654 16.8417 9.1654 17.1583 9.36066 17.3536L12.5426 20.5355C12.7379 20.7308 13.0545 20.7308 13.2497 20.5355C13.445 20.3403 13.445 20.0237 13.2497 19.8284L10.4213 17L13.2498 14.1716C13.445 13.9763 13.445 13.6597 13.2498 13.4645C13.0545 13.2692 12.7379 13.2692 12.5426 13.4645L9.36066 16.6464ZM24.2856 16.5L9.71422 16.5L9.71422 17.5L24.2856 17.5L24.2856 16.5Z" fill="#3A2A22" /></svg> }
function ChevronRightIcon() { return <svg width="36" height="34" viewBox="0 0 36 34" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="0" width="34" height="34" rx="17" fill="#EDEDED" fillOpacity="0.8" /><path d="M9.71436 16.5C9.43821 16.5 9.21436 16.7239 9.21436 17C9.21436 17.2761 9.43821 17.5 9.71436 17.5V16.5ZM24.6393 17.3536C24.8346 17.1583 24.8346 16.8417 24.6393 16.6464L21.4574 13.4645C21.2621 13.2692 20.9455 13.2692 20.7502 13.4645C20.555 13.6597 20.555 13.9763 20.7502 14.1716L23.5787 17L20.7502 19.8284C20.555 20.0237 20.555 20.3403 20.7502 20.5355C20.9455 20.7308 21.2621 20.7308 21.4574 20.5355L24.6393 17.3536ZM9.71436 17.5H24.2858V16.5H9.71436V17.5Z" fill="#3A2A22" /></svg> }