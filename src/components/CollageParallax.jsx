"use client";

import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { useMemo, useRef } from "react";

const DEFAULT_CONFIG = {
  strength: 5,
  scaleMax: 1.1,
  baseScale: 1.06,
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

  const horizontalOverscan = Math.max(strength, 0);

  const xRange = invert
    ? [strength, -strength]
    : [-strength, strength];

  const x = useTransform(smoothProgress, [0, 1], xRange);
  const scale = useTransform(
    smoothProgress,
    [0, 1.06],
    [DEFAULT_CONFIG.baseScale, scaleMax]
  );

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
      width: horizontalOverscan
        ? `calc(100% + ${horizontalOverscan * 2}px)`
        : "100%",
      minWidth: "100%",
      height: "100%",
      minHeight: "100%",
      display: "block",
      position: "relative",
      left: horizontalOverscan ? `${horizontalOverscan * -1}px` : 0,
      willChange: "transform",
      transformOrigin: "center center",
    }),
    [horizontalOverscan, x, scale]
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
