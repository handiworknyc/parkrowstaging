"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";
import { getWpImage } from "../lib/wp/get-wp-image.js"; // Adjust path to where you saved the helper

export default function CollageParallax({ 
  children,
  // New Image Props
  src,
  alt = "",
  className = "", // Applied to the inner motion element
  // Parallax Props
  strength = 5, 
  scaleMax = 1.1,
  invert = false 
}) {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Inertia configuration
  const smoothProgress = useSpring(scrollYProgress, {
    mass: 0.4,
    stiffness: 150,
    damping: 25,
    restDelta: 0.001
  });

  const xRange = invert ? [strength, -strength] : [-strength, strength];
  
  // Apply transforms
  const x = useTransform(smoothProgress, [0, 1], xRange);
  const scale = useTransform(smoothProgress, [0, 1.06], [1.06, scaleMax]);

  // Convert src if present
  const localSrc = src ? getWpImage(src) : null;

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden", 
      }}
    >
      {src ? (
        /* MODE A: Smart Image (Auto-cached) */
        <motion.img
          src={localSrc}
          alt={alt}
          className={className}
          style={{
            x,
            scale,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            willChange: "transform",
          }}
        />
      ) : (
        /* MODE B: Wrapper (Backwards compatible) */
        <motion.div
          className={className}
          style={{
            x,
            scale,
            width: "100%",
            height: "100%",
            display: "block",
            willChange: "transform",
          }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}