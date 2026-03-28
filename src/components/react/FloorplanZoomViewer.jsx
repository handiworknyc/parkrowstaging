"use client";

import { useEffect, useRef } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const MAX_SCALE = 5;

const ROOT_STYLE = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
};

const VIEWPORT_STYLE = {
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  overscrollBehavior: "contain",
};

const CONTENT_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
};

const CONTROLS_STYLE = {
  position: "absolute",
  top: "var(--floorplans-reset-top, 1rem)",
  right: "3.75rem",
  zIndex: 2,
  display: "flex",
};

const CONTROL_BUTTON_STYLE = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "auto",
  height: "2.75rem",
  padding: "0 1rem",
  border: 0,
  borderRadius: "999px",
  background: "#fff",
  color: "#3a2a22",
  cursor: "pointer",
  fontFamily: "\"Hanken Grotesk\", system-ui, sans-serif",
  fontSize: "0.95rem",
  lineHeight: 1,
};

function queueLayout(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function isModalVisible(modal) {
  return Boolean(modal && !modal.hidden && modal.classList.contains("is-visible"));
}

export default function FloorplanZoomViewer({
  alt = "Floor plan",
  src,
  width,
  height,
  imageAspectRatio,
}) {
  const rootRef = useRef(null);
  const transformRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-modal]");
    if (!(modal instanceof HTMLElement)) return;

    let wasVisible = isModalVisible(modal);

    const syncVisibility = () => {
      const visible = isModalVisible(modal);
      if (visible === wasVisible) return;

      wasVisible = visible;

      if (visible) {
        queueLayout(() => {
          transformRef.current?.centerView(1, 0);
          transformRef.current?.resetTransform(0);
        });
      }
    };

    const observer = new MutationObserver(syncVisibility);
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleImageLoad = () => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-modal]");
    if (!isModalVisible(modal)) return;

    queueLayout(() => {
      transformRef.current?.centerView(1, 0);
    });
  };

  const imageStyle = {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  };

  if (imageAspectRatio) {
    imageStyle.aspectRatio = imageAspectRatio;
  }

  const image = (
    <img
      alt={alt}
      decoding="async"
      height={height}
      loading="eager"
      onLoad={handleImageLoad}
      src={src}
      style={imageStyle}
      width={width}
    />
  );

  return (
    <div ref={rootRef} style={ROOT_STYLE}>
      <TransformWrapper
        ref={transformRef}
        centerOnInit
        centerZoomedOut
        doubleClick={{ disabled: true }}
        maxScale={MAX_SCALE}
        minScale={1}
        panning={{
          velocityDisabled: true,
          wheelPanning: false,
        }}
        pinch={{ disabled: false }}
        wheel={{
          disabled: false,
          step: 0.15,
          touchPadDisabled: false,
        }}
      >
        {({ resetTransform }) => (
          <>
            <div style={CONTROLS_STYLE}>
              <button
                type="button"
                style={CONTROL_BUTTON_STYLE}
                onClick={() => resetTransform()}
                aria-label={`Reset zoom for ${alt}`}
              >
                Reset zoom
              </button>
            </div>
            <TransformComponent
              contentStyle={CONTENT_STYLE}
              wrapperStyle={VIEWPORT_STYLE}
            >
              {image}
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
