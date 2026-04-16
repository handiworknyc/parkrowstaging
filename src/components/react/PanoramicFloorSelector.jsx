"use client";

import { useEffect, useRef, useState } from "react";
import PanoramicViewViewer from "./PanoramicViewViewer.jsx";

const preloadedFloorViewPromises = new Map();
const FLOOR_SWITCH_FADE_MS = 360;

const VIEWER_STACK_STYLE = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const VIEWER_LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  transition: `opacity ${FLOOR_SWITCH_FADE_MS}ms var(--cubicBez, ease)`,
  willChange: "opacity",
};

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];

  return options.filter((option) => {
    const daySrc = String(option?.daySrc ?? "").trim();
    const nightSrc = String(option?.nightSrc ?? "").trim();
    const label = String(option?.label ?? "").trim();
    const key = String(option?.key ?? "").trim();

    return Boolean(label && key && (daySrc || nightSrc));
  });
}

function normalizeSrc(src) {
  return typeof src === "string" ? src.trim() : "";
}

function hasFloorViewSrc(src) {
  return Boolean(normalizeSrc(src));
}

function resolveOptionView(option, requestedView) {
  const hasDay = hasFloorViewSrc(option?.daySrc);
  const hasNight = hasFloorViewSrc(option?.nightSrc);

  if (requestedView === "night" && hasNight) return "night";
  if (requestedView === "day" && hasDay) return "day";
  if (hasDay) return "day";
  if (hasNight) return "night";

  return "";
}

function isModalVisible(modal) {
  return Boolean(modal && !modal.hidden && modal.classList.contains("is-visible"));
}

function preloadFloorViewImage(src) {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  const href = normalizeSrc(src);
  if (!href) {
    return Promise.resolve(false);
  }

  const existingPromise = preloadedFloorViewPromises.get(href);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise((resolve) => {
    const image = new window.Image();
    let settled = false;

    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      if (!loaded) {
        preloadedFloorViewPromises.delete(href);
      }
      resolve(loaded);
    };

    image.decoding = "async";

    if ("fetchPriority" in image) {
      image.fetchPriority = "high";
    }

    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = href;

    if (image.complete) {
      finish(image.naturalWidth > 0);
    }
  });

  preloadedFloorViewPromises.set(href, promise);
  return promise;
}

function preloadFloorViewOptions(options) {
  const sources = [
    ...new Set(
      options.flatMap((option) => [option?.daySrc, option?.nightSrc].map(normalizeSrc).filter(Boolean))
    ),
  ];

  return Promise.all(sources.map((src) => preloadFloorViewImage(src)));
}

export default function PanoramicFloorSelector({
  options = [],
  disclaimer = "",
}) {
  const viewOptions = normalizeOptions(options);
  const [activeKey, setActiveKey] = useState(viewOptions[0]?.key ?? "");
  const [preferredView, setPreferredView] = useState(
    () => resolveOptionView(viewOptions[0], "day") || "day"
  );
  const [previousKey, setPreviousKey] = useState("");
  const [transitionEntered, setTransitionEntered] = useState(false);
  const optionKeys = viewOptions.map((option) => option.key).join("|");
  const optionSourcesSignature = viewOptions
    .flatMap((option) => [option?.daySrc, option?.nightSrc].map(normalizeSrc).filter(Boolean))
    .join("|");
  const scrollRef = useRef(null);
  const transitionTimerRef = useRef(0);
  const transitionFrameRef = useRef(0);
  const transitionRunRef = useRef(0);

  useEffect(() => {
    const nextInitialKey = viewOptions[0]?.key ?? "";

    setActiveKey((currentKey) => {
      if (viewOptions.some((option) => option.key === currentKey)) {
        return currentKey;
      }

      return nextInitialKey;
    });

    setPreviousKey("");
    setTransitionEntered(false);
  }, [optionKeys]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = 0;
      }

      if (transitionFrameRef.current) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    const scrollRegion = scrollRef.current;
    if (!(scrollRegion instanceof HTMLElement)) return;

    const modal = scrollRegion.closest("[data-floorplans-panorama-modal]");
    if (!(modal instanceof HTMLElement)) return;

    let wasVisible = false;

    const syncVisibility = () => {
      const visible = isModalVisible(modal);
      if (visible === wasVisible) return;

      wasVisible = visible;

      if (visible) {
        void preloadFloorViewOptions(viewOptions);
      } else {
        if (transitionTimerRef.current) {
          window.clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = 0;
        }

        if (transitionFrameRef.current) {
          window.cancelAnimationFrame(transitionFrameRef.current);
          transitionFrameRef.current = 0;
        }

        transitionRunRef.current += 1;
        setPreviousKey("");
        setTransitionEntered(false);
      }
    };

    syncVisibility();

    const observer = new MutationObserver(syncVisibility);
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });

    return () => {
      observer.disconnect();
    };
  }, [optionSourcesSignature]);

  const activeOption =
    viewOptions.find((option) => option.key === activeKey) ?? viewOptions[0] ?? null;
  const activeDisplayView = resolveOptionView(activeOption, preferredView) || "day";
  const hasDayView = hasFloorViewSrc(activeOption?.daySrc);
  const hasNightView = hasFloorViewSrc(activeOption?.nightSrc);

  useEffect(() => {
    const nextPreferredView = resolveOptionView(activeOption, preferredView);
    if (nextPreferredView && nextPreferredView !== preferredView) {
      setPreferredView(nextPreferredView);
    }
  }, [activeOption, preferredView]);

  const renderToggle = (modifierClassName = "") => {
    if (!(hasDayView || hasNightView)) return null;

    return (
      <div
        className={["page-title-floor-views-toggle", modifierClassName].filter(Boolean).join(" ")}
        role="group"
        aria-label="Select panorama lighting"
      >
        {hasDayView ? (
          <button
            type="button"
            className="page-title-floor-views-toggle-button"
            data-active={activeDisplayView === "day" ? "true" : "false"}
            aria-pressed={activeDisplayView === "day" ? "true" : "false"}
            onClick={() => setPreferredView("day")}
          >
            Day Time
          </button>
        ) : null}
        {hasNightView ? (
          <button
            type="button"
            className="page-title-floor-views-toggle-button"
            data-active={activeDisplayView === "night" ? "true" : "false"}
            aria-pressed={activeDisplayView === "night" ? "true" : "false"}
            onClick={() => setPreferredView("night")}
          >
            Evening
          </button>
        ) : null}
      </div>
    );
  };

  const handleOptionSelect = (nextKey) => {
    if (!nextKey || nextKey === activeKey) return;

    const nextOption = viewOptions.find((option) => option.key === nextKey);
    if (!nextOption) return;

    void preloadFloorViewOptions([nextOption]);

    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = 0;
    }

    if (transitionFrameRef.current) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = 0;
    }

    const nextRun = transitionRunRef.current + 1;
    transitionRunRef.current = nextRun;

    setPreviousKey(activeKey);
    setActiveKey(nextKey);
    setTransitionEntered(false);

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      transitionFrameRef.current = 0;

      if (transitionRunRef.current !== nextRun) return;
      setTransitionEntered(true);
    });

    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = 0;

      if (transitionRunRef.current !== nextRun) return;
      setPreviousKey("");
      setTransitionEntered(false);
    }, FLOOR_SWITCH_FADE_MS);
  };

  return (
    <>
      <div className="floorplans-detail-copy floorplans-panorama-copy">
        <div className="floorplans-detail-meta">
          {renderToggle("page-title-floor-views-toggle--mobile")}
          <nav
            className="page-title-floor-views-nav"
            aria-label="Select indicative floor view"
          >
            {viewOptions.map((option) => {
              const isActive = option.key === activeOption?.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  className="page-title-floor-views-nav-button"
                  data-active={isActive ? "true" : "false"}
                  aria-pressed={isActive ? "true" : "false"}
                  onClick={() => handleOptionSelect(option.key)}
                >
                  {option.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="floorplans-panorama-scroll"
        data-floorplans-panorama-scroll
      >
        <div className="floorplans-panorama-shell">
          <div className="floorplans-panorama-stage">
            {renderToggle("page-title-floor-views-toggle--desktop")}
            <div className="floorplans-panorama-viewer" style={VIEWER_STACK_STYLE}>
              {viewOptions.map((option) => {
                const isActive = option.key === activeKey;
                const isPrevious = option.key === previousKey;
                const isVisible = isActive || isPrevious;
                const opacity = isActive
                  ? previousKey
                    ? transitionEntered
                      ? 1
                      : 0
                    : 1
                  : isPrevious
                    ? transitionEntered
                      ? 0
                      : 1
                    : 0;

                return (
                  <div
                    key={option.key}
                    aria-hidden={isVisible ? "false" : "true"}
                    style={{
                      ...VIEWER_LAYER_STYLE,
                      opacity,
                      visibility: isVisible ? "visible" : "hidden",
                      pointerEvents: isActive ? "auto" : "none",
                      zIndex: isActive ? 2 : isPrevious ? 1 : 0,
                    }}
                  >
                    <PanoramicViewViewer
                      alt={`Panoramic view for ${option.label}`}
                      daySrc={option.daySrc}
                      dayWidth={option.dayWidth}
                      dayHeight={option.dayHeight}
                      nightSrc={option.nightSrc}
                      nightWidth={option.nightWidth}
                      nightHeight={option.nightHeight}
                      preferredView={preferredView}
                      showToggle={false}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {disclaimer ? (
            <div className="floorplans-detail-disclaimer floorplans-panorama-disclaimer">
              <p>{disclaimer}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
