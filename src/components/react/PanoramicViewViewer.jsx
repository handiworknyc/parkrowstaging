"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DEFAULT_VIEW_PHASE = 0.78;
const MOMENTUM_FRICTION = 0.92;
const MOMENTUM_MIN_VELOCITY = 0.01;
const VIEW_SWITCH_FADE_MS = 360;

const ROOT_STYLE = {
  position: "relative",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
};

const VIEWPORT_STYLE = {
  position: "relative",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
};

const LAYER_STYLE = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  transition: `opacity ${VIEW_SWITCH_FADE_MS}ms var(--cubicBez, ease)`,
  pointerEvents: "none",
  userSelect: "none",
  backgroundRepeat: "repeat-x",
  backgroundPosition: "0px 0px",
  backgroundSize: "auto 100%",
  willChange: "background-position, opacity",
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
const PAGE_SETTLE_TIMEOUT_MS = 1500;
const PAGE_SETTLE_FALLBACK_MS = 600;

const TOGGLE_GROUP_STYLE = {
  marginTop: "1.5rem",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  padding: "0.25rem",
  paddingTop: "calc(0.25rem + 0.25px)",
  paddingBottom: "calc(0.25rem - 0.25px)",
  borderRadius: "999px",
  background: "#fff",
  color: "#3a2a22",
  boxShadow: "0 10px 28px rgba(58, 42, 34, 0.12)",
};

const TOGGLE_BUTTON_STYLE = {
  appearance: "none",
  border: 0,
  background: "transparent",
  padding: "0.75rem 1.25rem",
  borderRadius: "999px",
  color: "inherit",
  cursor: "pointer",
  fontFamily: "\"Hanken Grotesk\", system-ui, sans-serif",
  fontSize: "1rem",
  fontWeight: 600,
  lineHeight: 1,
  transition: `background-color ${VIEW_SWITCH_FADE_MS}ms var(--cubicBez, ease), color ${VIEW_SWITCH_FADE_MS}ms var(--cubicBez, ease)`,
};

const scheduledWarmups = new Set();
const prefetchedPanoramaUrls = new Set();
const preloadedPanoramaPromises = new Map();
const pageSettleCallbacks = [];
let pageSettleQueued = false;
let pageHasSettled = false;

function queueLayout(callback) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function normalizeSrc(src) {
  return typeof src === "string" ? src.trim() : "";
}

function flushPageSettleCallbacks() {
  if (pageHasSettled) return;

  pageHasSettled = true;
  const callbacks = pageSettleCallbacks.splice(0, pageSettleCallbacks.length);
  callbacks.forEach((callback) => {
    try {
      callback();
    } catch {
      // Ignore warmup callback failures so the viewer remains interactive.
    }
  });
}

function runAfterPageSettles(callback) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (pageHasSettled) {
    callback();
    return;
  }

  pageSettleCallbacks.push(callback);

  if (pageSettleQueued) return;
  pageSettleQueued = true;

  const scheduleFlush = () => {
    const runFlush = () => {
      flushPageSettleCallbacks();
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(runFlush, {
        timeout: PAGE_SETTLE_TIMEOUT_MS,
      });
      return;
    }

    window.setTimeout(runFlush, PAGE_SETTLE_FALLBACK_MS);
  };

  if (document.readyState === "complete") {
    queueLayout(scheduleFlush);
    return;
  }

  window.addEventListener(
    "load",
    () => {
      queueLayout(scheduleFlush);
    },
    { once: true }
  );
}

function prefetchPanoramaImage(src) {
  if (typeof document === "undefined") return;

  const href = normalizeSrc(src);
  if (!href || prefetchedPanoramaUrls.has(href) || preloadedPanoramaPromises.has(href)) {
    return;
  }

  prefetchedPanoramaUrls.add(href);

  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "image";
  link.href = href;
  document.head.appendChild(link);
}

function schedulePanoramaWarmup(src) {
  const href = normalizeSrc(src);
  if (!href || scheduledWarmups.has(href) || preloadedPanoramaPromises.has(href)) {
    return;
  }

  scheduledWarmups.add(href);
  runAfterPageSettles(() => {
    prefetchPanoramaImage(href);
  });
}

function preloadPanoramaImage(src) {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  const href = normalizeSrc(src);
  if (!href) {
    return Promise.resolve(false);
  }

  const existingPromise = preloadedPanoramaPromises.get(href);
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
        preloadedPanoramaPromises.delete(href);
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

  preloadedPanoramaPromises.set(href, promise);
  return promise;
}

function preloadPanoramaAssets(...sources) {
  return Promise.all(sources.map((src) => preloadPanoramaImage(src)));
}

function isModalVisible(modal) {
  return Boolean(modal && !modal.hidden && modal.classList.contains("is-visible"));
}

function normalizePhase(value) {
  if (!Number.isFinite(value)) return DEFAULT_VIEW_PHASE;

  const normalized = value % 1;
  return normalized < 0 ? normalized + 1 : normalized;
}

function toCssUrl(src) {
  if (!src) return "none";
  return `url(${JSON.stringify(String(src))})`;
}

export default function PanoramicViewViewer({
  alt = "Panoramic view",
  daySrc,
  dayWidth,
  dayHeight,
  nightSrc,
  nightWidth,
  nightHeight,
  preferredView,
  showToggle = true,
}) {
  const resolveAvailableView = (requestedView) => {
    if (requestedView === "night" && nightSrc) return "night";
    if (requestedView === "day" && daySrc) return "day";
    return daySrc ? "day" : "night";
  };

  const initialView = resolveAvailableView(preferredView);
  const rootRef = useRef(null);
  const dayLayerRef = useRef(null);
  const nightLayerRef = useRef(null);
  const activeViewRef = useRef(initialView);
  const viewPhasesRef = useRef({
    day: DEFAULT_VIEW_PHASE,
    night: DEFAULT_VIEW_PHASE,
  });
  const renderPhaseRef = useRef(DEFAULT_VIEW_PHASE);
  const dragStateRef = useRef(null);
  const momentumFrameRef = useRef(0);
  const momentumVelocityRef = useRef(0);
  const [activeView, setActiveView] = useState(initialView);
  const [isPanning, setIsPanning] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileToggleHost, setMobileToggleHost] = useState(null);
  const [shouldRenderImages, setShouldRenderImages] = useState(false);

  const getVisibleModal = () => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return null;

    const panoramaModal = root.closest("[data-floorplans-panorama-modal]");
    if (panoramaModal instanceof HTMLElement) {
      return panoramaModal;
    }

    const detailModal = root.closest("[data-floorplans-modal]");
    if (detailModal instanceof HTMLElement) {
      return detailModal;
    }

    return null;
  };

  const getViewDimensions = (view) => {
    const width = Number(view === "night" ? nightWidth : dayWidth);
    const height = Number(view === "night" ? nightHeight : dayHeight);

    if (width > 0 && height > 0) {
      return { width, height };
    }

    const fallbackWidth = Number(dayWidth) || Number(nightWidth);
    const fallbackHeight = Number(dayHeight) || Number(nightHeight);

    if (fallbackWidth > 0 && fallbackHeight > 0) {
      return {
        width: fallbackWidth,
        height: fallbackHeight,
      };
    }

    return null;
  };

  const getTileWidth = (view, viewportHeight) => {
    const dimensions = getViewDimensions(view);
    if (!dimensions) return null;

    const nextViewportHeight =
      typeof viewportHeight === "number"
        ? viewportHeight
        : rootRef.current instanceof HTMLElement
          ? rootRef.current.getBoundingClientRect().height
          : 0;

    if (nextViewportHeight <= 0) return null;

    return (nextViewportHeight * dimensions.width) / dimensions.height;
  };

  const stopMomentum = () => {
    if (momentumFrameRef.current) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = 0;
    }

    momentumVelocityRef.current = 0;
  };

  const syncPanoramaLayers = () => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const phase = normalizePhase(renderPhaseRef.current);
    renderPhaseRef.current = phase;
    viewPhasesRef.current[activeViewRef.current] = phase;

    const layerConfigs = [
      {
        layerRef: dayLayerRef,
        view: "day",
      },
      {
        layerRef: nightLayerRef,
        view: "night",
      },
    ];

    layerConfigs.forEach(({ layerRef, view }) => {
      const layer = layerRef.current;
      if (!(layer instanceof HTMLElement)) return;

      const tileWidth = getTileWidth(view, rect.height);
      if (!tileWidth) return;

      layer.style.backgroundSize = `${tileWidth}px 100%`;
      layer.style.backgroundPosition = `${rect.width / 2 - phase * tileWidth}px 0px`;
    });
  };

  const applyDragDelta = (deltaX) => {
    const tileWidth = getTileWidth(activeViewRef.current);
    if (!tileWidth) return false;

    renderPhaseRef.current = normalizePhase(renderPhaseRef.current - deltaX / tileWidth);
    syncPanoramaLayers();

    return true;
  };

  const startMomentum = () => {
    stopMomentum();

    let velocity = momentumVelocityRef.current;
    if (!Number.isFinite(velocity) || Math.abs(velocity) < MOMENTUM_MIN_VELOCITY) {
      return;
    }

    let lastTime = window.performance.now();

    const step = (time) => {
      const deltaTime = Math.max(1, time - lastTime);
      lastTime = time;

      if (!applyDragDelta(velocity * deltaTime)) {
        stopMomentum();
        return;
      }

      velocity *= Math.pow(MOMENTUM_FRICTION, deltaTime / 16);
      momentumVelocityRef.current = velocity;

      if (Math.abs(velocity) < MOMENTUM_MIN_VELOCITY) {
        stopMomentum();
        return;
      }

      momentumFrameRef.current = window.requestAnimationFrame(step);
    };

    momentumFrameRef.current = window.requestAnimationFrame(step);
  };

  const finalizePanning = (event, allowMomentum) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setIsPanning(false);

    if (allowMomentum) {
      startMomentum();
      return;
    }

    stopMomentum();
  };

  const resetPanoramaPosition = () => {
    stopMomentum();
    dragStateRef.current = null;
    setIsPanning(false);
    viewPhasesRef.current = {
      day: DEFAULT_VIEW_PHASE,
      night: DEFAULT_VIEW_PHASE,
    };
    renderPhaseRef.current =
      viewPhasesRef.current[activeViewRef.current] ?? DEFAULT_VIEW_PHASE;
    queueLayout(syncPanoramaLayers);
  };

  useEffect(() => {
    const nextActiveView = resolveAvailableView(preferredView);
    const currentModal = getVisibleModal();

    activeViewRef.current = nextActiveView;
    viewPhasesRef.current = {
      day: DEFAULT_VIEW_PHASE,
      night: DEFAULT_VIEW_PHASE,
    };
    renderPhaseRef.current = DEFAULT_VIEW_PHASE;
    stopMomentum();
    setIsPanning(false);
    setActiveView(nextActiveView);
    setShouldRenderImages(isModalVisible(currentModal));
    queueLayout(syncPanoramaLayers);
  }, [daySrc, dayWidth, dayHeight, nightSrc, nightWidth, nightHeight]);

  useEffect(() => {
    schedulePanoramaWarmup(daySrc);
    schedulePanoramaWarmup(nightSrc);
  }, [daySrc, nightSrc]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const detailModal = root.closest("[data-floorplans-modal]");
    if (!(detailModal instanceof HTMLElement)) return;

    let wasVisible = false;

    const syncVisibility = () => {
      const visible = isModalVisible(detailModal);
      if (visible === wasVisible) return;

      wasVisible = visible;

      if (visible) {
        setShouldRenderImages(true);
        void preloadPanoramaAssets(daySrc, nightSrc);
      } else {
        setShouldRenderImages(false);
      }
    };

    syncVisibility();

    const observer = new MutationObserver(syncVisibility);
    observer.observe(detailModal, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });

    return () => {
      observer.disconnect();
    };
  }, [daySrc, nightSrc]);

  useEffect(() => {
    activeViewRef.current = activeView;
    renderPhaseRef.current =
      viewPhasesRef.current[activeView] ?? DEFAULT_VIEW_PHASE;
    queueLayout(syncPanoramaLayers);
  }, [activeView]);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    const modal = root.closest("[data-floorplans-panorama-modal]");
    if (!(modal instanceof HTMLElement)) return;

    let wasVisible = false;

    const syncVisibility = () => {
      const visible = isModalVisible(modal);
      if (visible === wasVisible) return;

      wasVisible = visible;

      if (visible) {
        setShouldRenderImages(true);
        void preloadPanoramaAssets(daySrc, nightSrc);
        resetPanoramaPosition();
      } else {
        stopMomentum();
        dragStateRef.current = null;
        setIsPanning(false);
      }
    };

    const observer = new MutationObserver(syncVisibility);
    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "hidden"],
    });

    syncVisibility();

    return () => {
      observer.disconnect();
    };
  }, [daySrc, nightSrc]);

  useEffect(() => {
    if (preferredView !== "day" && preferredView !== "night") return;

    const nextActiveView = resolveAvailableView(preferredView);
    if (nextActiveView === activeViewRef.current) return;

    viewPhasesRef.current[activeViewRef.current] = normalizePhase(renderPhaseRef.current);
    renderPhaseRef.current =
      viewPhasesRef.current[nextActiveView] ?? DEFAULT_VIEW_PHASE;
    activeViewRef.current = nextActiveView;
    syncPanoramaLayers();
    setActiveView(nextActiveView);
  }, [preferredView, daySrc, nightSrc]);

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
      setIsMobileLayout(false);
      setMobileToggleHost(null);
      return;
    }

    const mobileQuery = window.matchMedia(MOBILE_TOGGLE_MEDIA_QUERY);
    const syncToggleHost = () => {
      const isMobile = mobileQuery.matches;
      setIsMobileLayout(isMobile);
      setMobileToggleHost(isMobile ? copy : null);
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
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) return;

    let frame = 0;
    const scheduleSync = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncPanoramaLayers();
      });
    };

    scheduleSync();

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(scheduleSync);
      observer.observe(root);

      return () => {
        if (frame) {
          window.cancelAnimationFrame(frame);
        }

        observer.disconnect();
      };
    }

    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      window.removeEventListener("resize", scheduleSync);
    };
  }, [dayWidth, dayHeight, nightWidth, nightHeight]);

  useEffect(() => {
    return () => {
      stopMomentum();
    };
  }, []);

  const showDay = activeView !== "night";
  const showNight = activeView === "night" && Boolean(nightSrc);
  const viewportStyle = {
    ...VIEWPORT_STYLE,
    cursor: isPanning ? "grabbing" : "grab",
  };
  const viewportClassName = [
    "floorplans-panorama-viewport",
    isMobileLayout && showDay ? "floorplans-panorama-viewport--day-underlay" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const viewportProps = {
    "data-panorama-viewport": "",
    "data-panorama-mobile-layout": isMobileLayout ? "true" : undefined,
    "data-panorama-daytime-underlay": isMobileLayout && showDay ? "true" : undefined,
  };

  const handleViewChange = (nextView) => {
    const resolvedView = resolveAvailableView(nextView);
    if (resolvedView === activeViewRef.current) return;

    viewPhasesRef.current[activeViewRef.current] = normalizePhase(renderPhaseRef.current);
    renderPhaseRef.current =
      viewPhasesRef.current[resolvedView] ?? DEFAULT_VIEW_PHASE;
    activeViewRef.current = resolvedView;
    syncPanoramaLayers();
    setActiveView(resolvedView);
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    stopMomentum();

    dragStateRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastTime: event.timeStamp || window.performance.now(),
    };

    momentumVelocityRef.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.lastX;
    if (deltaX === 0) return;

    if (applyDragDelta(deltaX)) {
      const now = event.timeStamp || window.performance.now();
      const deltaTime = Math.max(1, now - dragState.lastTime);
      momentumVelocityRef.current = deltaX / deltaTime;
      dragState.lastX = event.clientX;
      dragState.lastTime = now;
      event.preventDefault();
    }
  };

  const toggleControls =
    showToggle && (daySrc || nightSrc) ? (
      <div style={isMobileLayout ? MOBILE_TOGGLE_WRAP_STYLE : TOGGLE_WRAP_STYLE}>
        <div style={TOGGLE_GROUP_STYLE}>
          {daySrc && (
            <button
              type="button"
              style={{
                ...TOGGLE_BUTTON_STYLE,
                background: showDay ? "var(--pink)" : "transparent",
                color: showDay ? "#fff" : "#3a2a22",
              }}
              onClick={() => handleViewChange("day")}
              aria-pressed={showDay ? "true" : "false"}
            >
              Day Time
            </button>
          )}
          {nightSrc && (
            <button
              type="button"
              style={{
                ...TOGGLE_BUTTON_STYLE,
                background: showNight ? "var(--pink)" : "transparent",
                color: showNight ? "#fff" : "#3a2a22",
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

      <div
        {...viewportProps}
        aria-label={alt}
        className={viewportClassName}
        onLostPointerCapture={(event) => finalizePanning(event, false)}
        onPointerCancel={(event) => finalizePanning(event, false)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finalizePanning(event, true)}
        role="img"
        style={viewportStyle}
      >
        {daySrc && (
          <div
            ref={dayLayerRef}
            aria-hidden="true"
            style={{
              ...LAYER_STYLE,
              backgroundImage: shouldRenderImages ? toCssUrl(daySrc) : "none",
              opacity: showDay ? 1 : 0,
            }}
          />
        )}
        {nightSrc && (
          <div
            ref={nightLayerRef}
            aria-hidden="true"
            style={{
              ...LAYER_STYLE,
              backgroundImage: shouldRenderImages ? toCssUrl(nightSrc) : "none",
              opacity: showNight ? 1 : 0,
            }}
          />
        )}
      </div>
    </div>
  );
}
