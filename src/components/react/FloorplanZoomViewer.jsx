"use client";

import { useEffect, useRef } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const MAX_SCALE = 5;
const INITIAL_SCALE = 1;
const SCALE_STEP = 0.35;

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

function resetToInitialView(transformRef) {
  transformRef.current?.resetTransform(0);
  window.requestAnimationFrame(() => {
    transformRef.current?.centerView(undefined, 0);
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
          resetToInitialView(transformRef);
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

    queueLayout(() => {
      resetToInitialView(transformRef);
    });
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
        {({ zoomIn, zoomOut }) => (
          <>
            <div style={CONTROLS_STYLE} role="group" aria-label={`Zoom controls for ${alt}`}>
              <button
                type="button"
                className="floorplans-zoom-button floorplans-zoom-button--icon"
                style={ICON_CONTROL_BUTTON_STYLE}
                onClick={() => zoomIn(SCALE_STEP)}
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
                onClick={() => zoomOut(SCALE_STEP)}
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
                onClick={() => resetToInitialView(transformRef)}
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
