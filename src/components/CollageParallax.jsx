"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef, useMemo } from "react";

const DEFAULT_CONFIG = {
  strength: 5,
  scaleMax: 1.1,
  springConfig: {
    mass: 0.4,
    stiffness: 150,
    damping: 25,
    restDelta: 0.001,
  },
};

export default function CollageParallax({
  children,
  src,
  alt = "",
  className = "",
  strength = DEFAULT_CONFIG.strength,
  scaleMax = DEFAULT_CONFIG.scaleMax,
  invert = false,
}) {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const smoothProgress = useSpring(
    scrollYProgress,
    DEFAULT_CONFIG.springConfig
  );

  // ✅ compute ranges normally
  const xRange = invert
    ? [strength, -strength]
    : [-strength, strength];

  // ✅ hooks must be top-level
  const x = useTransform(smoothProgress, [0, 1], xRange);
  const scale = useTransform(
    smoothProgress,
    [0, 1.06],
    [1.06, scaleMax]
  );

  // ✅ memo styles only
  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
    }),
    []
  );

  const motionStyle = useMemo(
    () => ({
      x,
      scale,
      width: "100%",
      height: "100%",
      display: "block",
      willChange: "transform",
    }),
    [x, scale]
  );

  const imageStyle = useMemo(
    () => ({
      ...motionStyle,
      objectFit: "cover",
    }),
    [motionStyle]
  );

  return (
    <div ref={ref} style={containerStyle}>
      {src ? (
        <motion.img
          src={src}
          alt={alt}
          className={className}
          style={imageStyle}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <motion.div className={className} style={motionStyle}>
          {children}
        </motion.div>
      )}
    </div>
  );
}
