"use client";

import { useEffect, useRef } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const MAX_SCALE = 5;
const INITIAL_SCALE = 1;
const SCALE_STEP = 0.35;
const ZOOM_ANIMATION_MS = 200;

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
  overflow: "visible",
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
  position: "fixed",
  top: "calc(var(--headerHeight) + var(--floorplans-reset-top, 1rem))",
  right: "var(--floorplans-reset-right, 5.75rem)",
  zIndex: 3,
  display: "flex",
  gap: "0.5rem",
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

const ICON_CONTROL_BUTTON_STYLE = {
  ...CONTROL_BUTTON_STYLE,
  minWidth: "2.75rem",
  padding: 0,
};

function queueLayout(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function isModalVisible(modal) {
  return Boolean(modal && !modal.hidden && modal.classList.contains("is-visible"));
}

function roundScale(scale) {
  return Math.round(scale * 1000) / 1000;
}

function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(INITIAL_SCALE, roundScale(scale)));
}

function getNextScale(currentScale, direction) {
  return clampScale(currentScale * Math.exp(direction * SCALE_STEP));
}

function centerOnImage(transformRef, imageRef, scale = INITIAL_SCALE, animationTime = 0) {
  const image = imageRef.current;

  if (image instanceof HTMLElement) {
    transformRef.current?.zoomToElement(image, scale, animationTime);
    return;
  }

  transformRef.current?.centerView(scale, animationTime);
}

function resetToInitialView(transformRef, imageRef) {
  transformRef.current?.resetTransform(0);
  window.requestAnimationFrame(() => {
    centerOnImage(transformRef, imageRef, INITIAL_SCALE, 0);
  });
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
  const imageRef = useRef(null);
  const isSvg = /\.svg(?:[?#].*)?$/i.test(String(src ?? ""));
  const queueResetToInitialView = () => {
    queueLayout(() => {
      resetToInitialView(transformRef, imageRef);
    });
  };

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
        queueResetToInitialView();
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

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement) || !("ResizeObserver" in window)) return;

    const modal = root.closest("[data-floorplans-modal]");
    if (!(modal instanceof HTMLElement)) return;

    let previousWidth = 0;
    let previousHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const nextWidth = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      if (nextWidth <= 0 || nextHeight <= 0) return;

      if (
        Math.abs(nextWidth - previousWidth) < 1 &&
        Math.abs(nextHeight - previousHeight) < 1
      ) {
        return;
      }

      previousWidth = nextWidth;
      previousHeight = nextHeight;

      if (!isModalVisible(modal)) return;

      queueResetToInitialView();
    });

    observer.observe(root);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-modal]");
    if (!(modal instanceof HTMLElement)) return;

    const scrollRegion = modal.querySelector("[data-floorplans-modal-scroll]");
    if (!(scrollRegion instanceof HTMLElement)) return;

    const handleWheel = (event) => {
      if (event.ctrlKey || event.deltaY === 0) return;
      if (scrollRegion.scrollHeight <= scrollRegion.clientHeight) return;

      scrollRegion.scrollTop += event.deltaY;
      event.preventDefault();
    };

    root.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      root.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleImageLoad = () => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-modal]");
    if (!isModalVisible(modal)) return;

    queueResetToInitialView();
  };

  const handleZoomButton = (direction) => {
    const currentScale = transformRef.current?.instance?.transformState?.scale ?? INITIAL_SCALE;
    const nextScale = getNextScale(currentScale, direction);

    if (nextScale === currentScale) return;

    centerOnImage(transformRef, imageRef, nextScale, ZOOM_ANIMATION_MS);
  };

  const imageStyle = {
    display: "block",
    width: "100%",
    height: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    objectPosition: "center center",
  };

  if (imageAspectRatio) {
    imageStyle.aspectRatio = imageAspectRatio;
  }

  const image = (
    <img
      alt={alt}
      className={isSvg ? "floorplans-zoom-image floorplans-zoom-image--svg" : "floorplans-zoom-image"}
      decoding="async"
      height={height}
      loading="eager"
      onLoad={handleImageLoad}
      ref={imageRef}
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
        initialScale={INITIAL_SCALE}
        maxScale={MAX_SCALE}
        minScale={INITIAL_SCALE}
        panning={{
          velocityDisabled: true,
          wheelPanning: false,
        }}
        pinch={{ disabled: false }}
        wheel={{ disabled: true }}
      >
        {() => (
          <>
            <div style={CONTROLS_STYLE} role="group" aria-label={`Zoom controls for ${alt}`}>
              <button
                type="button"
                className="floorplans-zoom-button floorplans-zoom-button--icon"
                style={ICON_CONTROL_BUTTON_STYLE}
                onClick={() => handleZoomButton(1)}
                aria-label={`Zoom in on ${alt}`}
              >
                <span
                  className="floorplans-zoom-button-icon floorplans-zoom-button-icon--plus"
                  aria-hidden="true"
                ></span>
              </button>
              <button
                type="button"
                className="floorplans-zoom-button floorplans-zoom-button--icon"
                style={ICON_CONTROL_BUTTON_STYLE}
                onClick={() => handleZoomButton(-1)}
                aria-label={`Zoom out on ${alt}`}
              >
                <span
                  className="floorplans-zoom-button-icon floorplans-zoom-button-icon--minus"
                  aria-hidden="true"
                ></span>
              </button>
              <button
                type="button"
                className="floorplans-zoom-button floorplans-zoom-button--reset"
                style={CONTROL_BUTTON_STYLE}
                onClick={() => resetToInitialView(transformRef, imageRef)}
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
