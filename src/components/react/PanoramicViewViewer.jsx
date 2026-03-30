"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

const ROOT_STYLE = {
  position: "relative",
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
  overflow: "hidden",
  overscrollBehavior: "contain",
};

const CONTENT_STYLE = {
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
  width: "max-content",
  minWidth: "100%",
  height: "100%",
  position: "relative",
};

const TOGGLE_WRAP_STYLE = {
  position: "absolute",
  top: "1rem",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2,
};

const MOBILE_TOGGLE_WRAP_STYLE = {
  position: "relative",
};

const MOBILE_TOGGLE_MEDIA_QUERY = "(max-width: 474px)";

const TOGGLE_GROUP_STYLE = {
  marginTop: "1.5rem",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.75rem",
  color: "#fff",
};

const TOGGLE_BUTTON_STYLE = {
  appearance: "none",
  border: 0,
  background: "transparent",
  padding: 0,
  color: "inherit",
  cursor: "pointer",
  fontFamily: "\"Hanken Grotesk\", system-ui, sans-serif",
  fontSize: "1.35rem",
  lineHeight: 1,
};

const TOGGLE_SEPARATOR_STYLE = {
  fontFamily: "\"Hanken Grotesk\", system-ui, sans-serif",
  fontSize: "1.35rem",
  lineHeight: 1,
  marginInline: "1rem",
  opacity: 0.7,
};

function queueLayout(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function isModalVisible(modal) {
  return Boolean(modal && !modal.hidden && modal.classList.contains("is-visible"));
}

export default function PanoramicViewViewer({
  alt = "Panoramic view",
  daySrc,
  dayWidth,
  dayHeight,
  nightSrc,
  nightWidth,
  nightHeight,
}) {
  const rootRef = useRef(null);
  const transformRef = useRef(null);
  const viewTransformsRef = useRef({
    day: null,
    night: null,
  });
  const [activeView, setActiveView] = useState(daySrc ? "day" : "night");
  const [isPanning, setIsPanning] = useState(false);
  const [mobileToggleHost, setMobileToggleHost] = useState(null);

  useEffect(() => {
    setActiveView(daySrc ? "day" : "night");
  }, [daySrc, nightSrc]);

  const saveCurrentTransform = (view) => {
    if (view !== "day" && view !== "night") return;

    const state = transformRef.current?.state;
    if (!state) return;

    viewTransformsRef.current[view] = {
      positionX: state.positionX,
      positionY: state.positionY,
      scale: state.scale,
    };
  };

  const applyViewTransform = (view) => {
    queueLayout(() => {
      const savedTransform = viewTransformsRef.current[view];

      if (savedTransform) {
        transformRef.current?.setTransform(
          savedTransform.positionX,
          savedTransform.positionY,
          savedTransform.scale,
          0
        );
        return;
      }

      transformRef.current?.resetTransform(0);
      transformRef.current?.centerView(1, 0);
    });
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-panorama-modal]");
    if (!(modal instanceof HTMLElement)) return;

    let wasVisible = isModalVisible(modal);

    const syncVisibility = () => {
      const visible = isModalVisible(modal);
      if (visible === wasVisible) return;

      wasVisible = visible;

      if (visible) {
        viewTransformsRef.current = {
          day: null,
          night: null,
        };
        applyViewTransform(activeView);
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
  }, [activeView]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-panorama-modal]");
    if (!(modal instanceof HTMLElement)) return;

    const scrollRegion = modal.querySelector("[data-floorplans-panorama-scroll]");
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

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-panorama-modal]");
    if (!(modal instanceof HTMLElement)) return;

    const copy = modal.querySelector(".floorplans-panorama-copy");
    if (!(copy instanceof HTMLElement)) {
      setMobileToggleHost(null);
      return;
    }

    const mobileQuery = window.matchMedia(MOBILE_TOGGLE_MEDIA_QUERY);
    const syncToggleHost = () => {
      setMobileToggleHost(mobileQuery.matches ? copy : null);
    };

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", syncToggleHost);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(syncToggleHost);
    }

    syncToggleHost();

    return () => {
      if (typeof mobileQuery.removeEventListener === "function") {
        mobileQuery.removeEventListener("change", syncToggleHost);
      } else if (typeof mobileQuery.removeListener === "function") {
        mobileQuery.removeListener(syncToggleHost);
      }
    };
  }, [daySrc, nightSrc]);

  useEffect(() => {
    applyViewTransform(activeView);
  }, [activeView]);

  const handleImageLoad = (view) => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-panorama-modal]");
    if (!isModalVisible(modal)) return;

    if (view === activeView) {
      applyViewTransform(view);
    }
  };

  const primaryWidth = Number(dayWidth) || Number(nightWidth) || undefined;
  const primaryHeight = Number(dayHeight) || Number(nightHeight) || undefined;

  const stageStyle = {
    position: "relative",
    flex: "0 0 auto",
    height: "100%",
    aspectRatio:
      primaryWidth && primaryHeight ? `${primaryWidth} / ${primaryHeight}` : undefined,
  };

  const layerStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    transition: "opacity 360ms ease",
    pointerEvents: "none",
    userSelect: "none",
  };

  const imageStyle = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    userSelect: "none",
    pointerEvents: "none",
  };

  const viewportStyle = {
    ...VIEWPORT_STYLE,
    cursor: isPanning ? "grabbing" : "grab",
  };

  const handleViewChange = (nextView) => {
    if (nextView === activeView) return;

    saveCurrentTransform(activeView);
    setActiveView(nextView);
  };

  const showDay = activeView !== "night";
  const showNight = activeView === "night" && nightSrc;
  const toggleControls =
    daySrc || nightSrc ? (
      <div style={mobileToggleHost ? MOBILE_TOGGLE_WRAP_STYLE : TOGGLE_WRAP_STYLE}>
        <div style={TOGGLE_GROUP_STYLE}>
          {daySrc && (
            <button
              type="button"
              style={{
                ...TOGGLE_BUTTON_STYLE,
                opacity: showDay ? 1 : 0.45,
                textDecoration: showDay ? "underline" : "none",
                textUnderlineOffset: "0.25em",
              }}
              onClick={() => handleViewChange("day")}
              aria-pressed={showDay ? "true" : "false"}
            >
              Day Time
            </button>
          )}
          {daySrc && nightSrc && <span style={TOGGLE_SEPARATOR_STYLE}>|</span>}
          {nightSrc && (
            <button
              type="button"
              style={{
                ...TOGGLE_BUTTON_STYLE,
                opacity: showNight ? 1 : 0.45,
                textDecoration: showNight ? "underline" : "none",
                textUnderlineOffset: "0.25em",
              }}
              onClick={() => handleViewChange("night")}
              aria-pressed={showNight ? "true" : "false"}
            >
              Evening
            </button>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div ref={rootRef} style={ROOT_STYLE}>
      {!mobileToggleHost && toggleControls}
      {mobileToggleHost && toggleControls ? createPortal(toggleControls, mobileToggleHost) : null}

      <TransformWrapper
        ref={transformRef}
        centerOnInit
        centerZoomedOut
        disablePadding
        doubleClick={{ disabled: true }}
        limitToBounds
        maxScale={1}
        minScale={1}
        onPanningStart={() => setIsPanning(true)}
        onPanningStop={() => setIsPanning(false)}
        panning={{
          disabled: false,
          lockAxisY: true,
          velocityDisabled: false,
          wheelPanning: false,
        }}
        velocityAnimation={{
          disabled: false,
          sensitivity: 0.2,
          animationTime: 420,
          animationType: "easeOutQuad",
          equalToMove: false,
        }}
        onTransformed={(_, state) => {
          viewTransformsRef.current[activeView] = {
            positionX: state.positionX,
            positionY: state.positionY,
            scale: state.scale,
          };
        }}
        pinch={{ disabled: true }}
        wheel={{ disabled: true }}
      >
        <TransformComponent contentStyle={CONTENT_STYLE} wrapperStyle={viewportStyle}>
          <div style={stageStyle}>
            {daySrc && (
              <img
                alt={showDay ? alt : ""}
                aria-hidden={showDay ? undefined : "true"}
                decoding="async"
                draggable="false"
                height={dayHeight}
                loading="eager"
                onLoad={() => handleImageLoad("day")}
                src={daySrc}
                style={{
                  ...layerStyle,
                  opacity: showDay ? 1 : 0,
                }}
                width={dayWidth}
              />
            )}
            {nightSrc && (
              <img
                alt={showNight ? alt : ""}
                aria-hidden={showNight ? undefined : "true"}
                decoding="async"
                draggable="false"
                height={nightHeight}
                loading="eager"
                onLoad={() => handleImageLoad("night")}
                src={nightSrc}
                style={{
                  ...layerStyle,
                  opacity: showNight ? 1 : 0,
                }}
                width={nightWidth}
              />
            )}
            <div
              aria-hidden="true"
              style={{
                width: "100%",
                height: "100%",
              }}
            >
              <img
                alt=""
                draggable="false"
                height={primaryHeight}
                src={daySrc || nightSrc}
                style={imageStyle}
                width={primaryWidth}
              />
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
