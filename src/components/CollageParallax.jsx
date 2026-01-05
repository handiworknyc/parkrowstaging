"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef } from "react";

export default function CollageParallax({ 
  children, 
  strength = 5, 
  scaleMax = 1.08,
  invert = false 
}) {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // Inertia configuration
  const smoothProgress = useSpring(scrollYProgress, {
    mass: 0.4,      // Reduced from 1: Makes it lightweight so it starts INSTANTLY
    stiffness: 150, // Tension: Controls how tightly it follows the scroll
    damping: 25,    // Friction: Lower = longer "drift" at the end
    restDelta: 0.001
  });

  const xRange = invert ? [strength, -strength] : [-strength, strength];
  
  // Apply transforms to the smoothed progress
  const x = useTransform(smoothProgress, [0, 1], xRange);
  const scale = useTransform(smoothProgress, [0, 1.06], [1.06, scaleMax]);

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
      <motion.div
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
    </div>
  );
}