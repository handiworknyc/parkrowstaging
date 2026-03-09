'use client';

import React, { useEffect, useRef, memo } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from 'motion/react';

/* =====================================================
   LOGO PATHS
===================================================== */

const LogoPaths = memo(({ fill = '#114636' }: { fill?: string }) => (
  <g fill={fill}>
    <path d="M140.57 191.357H136.234V152.706C140.798 150.057 144.948 146.452 148.663 141.859C156.898 131.545 161.211 117.767 161.614 100.537C164.61 102.415 167.126 104.815 169.141 107.746C174.707 116.009 177.55 127.973 177.55 143.379C177.55 173.345 165.307 191.346 140.559 191.346M188.693 256.826V230.562C188.693 210.954 178.923 196.525 159.621 192.465C169.021 189.262 176.57 183.345 182.256 174.713C187.942 166.201 190.796 155.724 190.796 143.39C190.796 127.485 186.591 114.901 178.302 105.662C169.893 96.4114 158.379 91.8514 143.663 91.8514H121.518C123.25 95.1845 124.122 98.876 124.122 102.698V146.061C127.008 144.823 129.481 142.869 131.452 140.633C133.402 138.429 134.982 135.769 136.245 132.511V95.4234H140.581C143.402 95.4234 146.038 95.6188 148.51 95.9771C148.521 96.596 148.554 97.204 148.554 97.8337C148.554 114.727 145.46 128.418 139.404 138.895C133.348 149.373 124.187 154.682 112.064 154.682H107.728V40.9857H112.064C124.187 40.9857 133.348 46.284 139.404 56.772C144.164 65.0017 147.051 75.2508 148.086 87.4217C154.937 87.552 161.331 89.6583 161.32 89.4954C160.187 74.8817 155.994 62.9606 148.685 53.6886C140.025 42.8423 128.893 37.4137 115.157 37.4137H93.0123C94.6244 40.7468 95.485 44.4383 95.6157 48.26V214.233H107.739V158.123H115.157C118.283 158.123 121.268 157.83 124.133 157.255V268.66H136.256V194.918H145.656C166.32 194.918 176.581 206.134 176.581 228.706V257.065C176.581 265.077 183.018 270.386 193.04 270.386C190.197 267.433 188.704 262.862 188.704 256.826" />
    <path d="M230.902 253.634C208.943 282.449 178.106 299.787 138.642 299.787C99.1775 299.787 68.0681 282.449 46.1086 253.634C24.149 224.819 13.1801 191.064 13.1801 151.87C13.1801 112.675 24.1599 79.1811 46.1086 50.3663C68.0573 21.812 98.9052 4.46229 138.631 4.46229C178.356 4.46229 208.943 21.8011 230.891 50.3554C252.851 79.1703 263.82 112.925 263.82 151.859C263.82 190.793 252.84 224.808 230.891 253.623M236.316 44.6554C209.106 14.7983 176.701 0 138.62 0C100.539 0 67.8939 14.7983 40.684 44.6554C13.4851 74.5017 0 110.07 0 151.87C0 193.67 13.4851 229.487 40.684 259.345C67.8939 289.202 100.528 304 138.62 304C176.711 304 209.106 289.202 236.316 259.345C263.526 229.487 277 193.659 277 151.87C277 110.081 263.515 74.5017 236.316 44.6554Z" />
  </g>
));

/* =====================================================
   LOGO LOADER
===================================================== */

type LoaderProps = {
  fadeOut?: boolean;
  onAlmostDone?: () => void;
  onFillComplete?: () => void;
  onFadeComplete?: () => void;
};

const LogoLoader = memo(function LogoLoader({
  fadeOut = false,
  onAlmostDone,
  onFillComplete,
  onFadeComplete,
}: LoaderProps) {
  /* ----------------------------------
     MOTION VALUES
  ---------------------------------- */

  // fill progress
  const progress = useMotionValue(0);

  // scale progress (longer)
  const scaleProgress = useMotionValue(0);

  const maskY = useTransform(progress, [0, 1], [520, -60]);

  const opacity = useMotionValue(0);

  // 🔥 scale continues after fill
  const scale = useTransform(scaleProgress, [0, 1], [1, 1.06]);

  const firedRef = useRef(false);

  /* ----------------------------------
     GLOBAL CSS FADE SYNC
  ---------------------------------- */

  useEffect(() => {
    const root = document.documentElement;
    const MULTIPLIER = 1.15;

    const unsub = progress.on('change', (v) => {
      const fade = 1 - Math.min(v * MULTIPLIER, 1);
      root.style.setProperty('--loaderFade', fade.toFixed(4));
    });

    return () => unsub();
  }, [progress]);

  /* ----------------------------------
     FADE IN
  ---------------------------------- */

  useEffect(() => {
    firedRef.current = false;

    progress.set(0);
    scaleProgress.set(0);

    const enter = animate(opacity, 1, {
      duration: 0.8,
      ease: [0.25, 0.1, 0.25, 1],
    });

    return () => enter.stop();
  }, []);

  /* ----------------------------------
     FILL ANIMATION (3.5s)
  ---------------------------------- */

  useEffect(() => {
    const fill = animate(progress, 1, {
      duration: 3.5,
      ease: [0.2, 0.0, 0.0, 1],
      onUpdate(v) {
        if (!firedRef.current && v > 0.9) {
          firedRef.current = true;
          onAlmostDone?.();
        }
      },
      onComplete() {
        onFillComplete?.();
      },
    });

    return () => fill.stop();
  }, []);

  /* ----------------------------------
     SCALE ANIMATION (LONGER)
     continues AFTER fill completes
  ---------------------------------- */

  useEffect(() => {
    const scaleAnim = animate(scaleProgress, 1, {
      duration: 7, // 👈 longer than fill
      ease: [0.2, 0.0, 0.0, 1],
    });

    return () => scaleAnim.stop();
  }, []);

  /* ----------------------------------
     FADE OUT
  ---------------------------------- */

  useEffect(() => {
    if (!fadeOut) return;

    const exit = animate(opacity, 0, {
      duration: 0.7,
      ease: [0.4, 0.0, 0.2, 1],
      onComplete: () => onFadeComplete?.(),
    });

    return () => exit.stop();
  }, [fadeOut]);

  /* ----------------------------------
     RENDER
  ---------------------------------- */

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ opacity, willChange: 'opacity' }}
    >
      <motion.div
        className="absolute inset-0 bg-white/80"
        aria-hidden
      />

      {/* ✅ smooth continuous scale */}
      <motion.div
        className="relative"
        style={{
          scale,
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        <svg
          viewBox="0 0 277 304"
          className="w-[180px] max-w-[60vw] h-auto"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="logoGradient"
              x1="0"
              y1="0"
              x2="277"
              y2="304"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#1a5a46" />
              <stop offset="100%" stopColor="#0a7c5b" />
            </linearGradient>

            <filter
              id="feather"
              x="-80%"
              y="-80%"
              width="260%"
              height="260%"
            >
              <feGaussianBlur stdDeviation="0 38" />
            </filter>

            <mask id="logoMask" maskUnits="userSpaceOnUse">
              <motion.rect
                x="0"
                width="277"
                height="520"
                fill="white"
                filter="url(#feather)"
                style={{ y: maskY, willChange: 'transform' }}
              />
              <motion.rect
                x="0"
                width="277"
                height="200"
                fill="white"
                opacity="0.35"
                filter="url(#feather)"
                style={{ y: maskY, willChange: 'transform' }}
              />
            </mask>
          </defs>

          <g opacity="0.12">
            <LogoPaths />
          </g>

          <g mask="url(#logoMask)">
            <LogoPaths fill="url(#logoGradient)" />
          </g>
        </svg>
      </motion.div>
    </motion.div>
  );
});

export default LogoLoader;
