import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import SlideNavigation from "../ui/SlideNavigation";

const EMPTY_CONTENT_ITEM = Object.freeze({
  title: "",
  text: "",
  twoColList: false,
  wideListColumns: false,
  listItems: [],
});

const TEXT_FADE_DURATION = 0.7;
const TEXT_FADE_OUT_DURATION = 0.45;
const TEXT_FADE_OVERLAP = 0.1;
const TEXT_FADE_IN_DELAY = TEXT_FADE_OUT_DURATION - TEXT_FADE_OVERLAP;
const TEXT_FADE_IN_EASE = [0.32, 0, 0.2, 1];
const TEXT_FADE_OUT_EASE = [0.22, 1, 0.36, 1];

async function loadFsLightboxConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof window.FsLightbox === "function") {
    return window.FsLightbox;
  }

  await import("../../scripts/plugins/fslightbox.js");

  return typeof window.FsLightbox === "function" ? window.FsLightbox : null;
}

function getColumnClass(index, total, items) {
  if (total === 1) {
    return "min-[990px]:col-5 max-[990px]:col-12 column-content";
  }

  if (index === 1) {
    if (items[1]?.wideListColumns) {
      return "min-[1050px]:col-6 min-[990px]:col-6 min-[990px]:ml-auto max-[990px]:mt-6 max-[990px]:col-12 column-content";
    }

    const mobileMt = items[1]?.title ? "max-[990px]:mt-20" : "max-[990px]:mt-6";
    return `min-[1050px]:col-4 min-[990px]:col-5 min-[1050px]:push-2 min-[990px]:push-1 ${mobileMt} max-[990px]:col-12 column-content`;
  }

  return "min-[1050px]:col-4 min-[990px]:col-5 col-12 column-content";
}

function normalizeContentItem(item) {
  return {
    title: item?.title || "",
    text: item?.text || "",
    twoColList: item?.two_col_list || false,
    wideListColumns: item?.wide_list_columns || false,
    listItems:
      typeof item?.list === "string"
        ? item.list.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : [],
  };
}

function normalizeContentItems(rawContent) {
  if (!Array.isArray(rawContent)) {
    return [];
  }

  return rawContent.map((item) => normalizeContentItem(item));
}

function toLeftSlotItem(item) {
  return {
    title: item?.title || "",
    text: item?.text || "",
    twoColList: false,
    wideListColumns: false,
    listItems: [],
  };
}

function toRightSlotItem(item) {
  return {
    title: "",
    text: "",
    twoColList: item?.twoColList || false,
    wideListColumns: item?.wideListColumns || false,
    listItems: item?.listItems || [],
  };
}

function hasRenderableItem(item) {
  return Boolean(item && (item.title || item.text || item.listItems.length > 0));
}

function hasRenderableContent(items) {
  return Array.isArray(items) && items.some(hasRenderableItem);
}

function getFirstRenderableItem(items) {
  return items.find(hasRenderableItem) || EMPTY_CONTENT_ITEM;
}

function buildLinkedSlotItems(items, defaultItem) {
  let linkedItem = defaultItem;

  return items.map((item) => {
    if (hasRenderableItem(item)) {
      linkedItem = item;
    }

    return linkedItem;
  });
}

function stripHtml(value) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getItemWeight(item) {
  if (!hasRenderableItem(item)) {
    return 0;
  }

  const listLength = item.listItems.reduce(
    (sum, line) => sum + stripHtml(line).length,
    0
  );

  return stripHtml(item.title).length + stripHtml(item.text).length + listLength;
}

function getItemKey(item) {
  if (!hasRenderableItem(item)) {
    return "";
  }

  return JSON.stringify({
    title: item.title,
    text: item.text,
    listItems: item.listItems,
    twoColList: item.twoColList,
    wideListColumns: item.wideListColumns,
  });
}

function enhanceListItemHtml(html) {
  if (!html || !/<h4\b/i.test(html)) {
    return html;
  }

  return html.replace(/<h4\b([^>]*)>/gi, (_match, attrs = "") => {
    const classMatch = attrs.match(/\bclass=(["'])(.*?)\1/i);

    if (classMatch) {
      const quote = classMatch[1];
      const classes = classMatch[2].split(/\s+/).filter(Boolean);
      const nextClasses = Array.from(new Set([...classes, "figure"])).join(" ");

      return `<h4${attrs.replace(classMatch[0], `class=${quote}${nextClasses}${quote}`)}>`;
    }

    return `<h4 class="figure"${attrs}>`;
  });
}

function isStandaloneListHeading(html) {
  return /^<h4\b[^>]*>[\s\S]*<\/h4>$/i.test((html || "").trim());
}

function getLightboxButtonLabel(image, index, total) {
  const readableLabel = stripHtml(image.caption || image.alt || "").trim();

  if (readableLabel) {
    return `Open gallery image ${index + 1} of ${total}: ${readableLabel}`;
  }

  return `Open gallery image ${index + 1} of ${total}`;
}

function ColumnContentInner({ item }) {
  if (!hasRenderableItem(item)) {
    return null;
  }

  const ulClass = [
    "section-text",
    item.twoColList ? "two-col-list" : "",
    item.wideListColumns ? "wide-list-columns" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const standaloneHeadingCount = item.listItems.filter(isStandaloneListHeading).length;
  const liftedHeadingHtml = standaloneHeadingCount === 1 && isStandaloneListHeading(item.listItems[0])
    ? enhanceListItemHtml(item.listItems[0])
    : null;
  const renderedListItems = liftedHeadingHtml ? item.listItems.slice(1) : item.listItems;

  return (
    <>
      {item.title && (
        <h3
          className="figure-h3"
          dangerouslySetInnerHTML={{ __html: item.title }}
        />
      )}
      {item.text && (
        <div
          className="section-text"
          dangerouslySetInnerHTML={{ __html: item.text }}
        />
      )}
      {liftedHeadingHtml && (
        <div
          className="section-text-list-heading"
          dangerouslySetInnerHTML={{ __html: liftedHeadingHtml }}
        />
      )}
      {renderedListItems.length > 0 && (
        <ul className={ulClass}>
          {renderedListItems.map((line, lineIndex) => (
            <li
              key={`list-item-${lineIndex}`}
              dangerouslySetInnerHTML={{ __html: enhanceListItemHtml(line) }}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ColumnContent({ item, className }) {
  if (!hasRenderableItem(item)) {
    return null;
  }

  return (
    <div className={className}>
      <ColumnContentInner item={item} />
    </div>
  );
}

function ContentColumns({ items }) {
  return (
    <div className="row">
      {items.map((item, index) => (
        <ColumnContent
          key={`column-${index}`}
          item={item}
          className={getColumnClass(index, items.length, items)}
        />
      ))}
    </div>
  );
}

const Slide = React.memo(
  function Slide({ image, index, gallerySize, onOpenLightbox }) {
    const isLightboxEnabled = typeof onOpenLightbox === "function" && Boolean(image.lightboxSrc || image.src);
    const figureClassName = [
      "slide-figure",
      image.caption ? "has-caption" : "",
      isLightboxEnabled ? "is-lightbox-enabled" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <figure className={figureClassName}>
        <div className="image-wrapper">
          {isLightboxEnabled && (
            <button
              type="button"
              className="carousel-lightbox-trigger"
              onClick={() => onOpenLightbox(index)}
              aria-label={getLightboxButtonLabel(image, index, gallerySize)}
            >
              <span className="carousel-lightbox-indicator" aria-hidden="true">
                <Search size={20} strokeWidth={2.25} />
              </span>
            </button>
          )}
          <img
            draggable={false}
            className="photo"
            src={image.src}
            alt={image.alt}
            decoding="async"
            loading="eager"
            style={{
              aspectRatio: image.aspectRatio,
            }}
          />
          {image.caption && (
            <figcaption className="slide-caption">{image.caption}</figcaption>
          )}
        </div>
      </figure>
    );
  }
);

export default function ImageCarousel({
  images,
  instanceId,
  defaultContent = [],
  caption = "",
  captionPos = "left",
}) {
  const [api, setApi] = useState(null);
  const [ready, setReady] = useState(false);
  const [navState, setNavState] = useState({
    current: 0,
    canPrev: false,
    canNext: true,
  });
  const rootRef = useRef(null);
  const frameIdsRef = useRef([]);
  const lightboxRef = useRef(null);
  const lightboxInitPromiseRef = useRef(null);
  const lightboxSignatureRef = useRef("");

  const defaultContentItems = useMemo(
    () => normalizeContentItems(defaultContent),
    [defaultContent]
  );

  const defaultLeftItem = useMemo(
    () => toLeftSlotItem(defaultContentItems[0] || EMPTY_CONTENT_ITEM),
    [defaultContentItems]
  );

  const defaultRightItem = useMemo(
    () => getFirstRenderableItem(defaultContentItems.slice(1).map(toRightSlotItem)),
    [defaultContentItems]
  );

  const normalizedSlideContent = useMemo(
    () => images.map((image) => normalizeContentItems(image.slideContent)),
    [images]
  );

  const slideLeftItems = useMemo(
    () => normalizedSlideContent.map((items) => getFirstRenderableItem(items.map(toLeftSlotItem))),
    [normalizedSlideContent]
  );

  const slideRightItems = useMemo(
    () => normalizedSlideContent.map((items) => getFirstRenderableItem(items.map(toRightSlotItem))),
    [normalizedSlideContent]
  );

  const linkedLeftItems = useMemo(
    () => buildLinkedSlotItems(slideLeftItems, defaultLeftItem),
    [defaultLeftItem, slideLeftItems]
  );

  const linkedRightItems = useMemo(
    () => buildLinkedSlotItems(slideRightItems, defaultRightItem),
    [defaultRightItem, slideRightItems]
  );

  const hasLeftOverrides = useMemo(
    () => slideLeftItems.some(hasRenderableItem),
    [slideLeftItems]
  );

  const hasRightOverrides = useMemo(
    () => slideRightItems.some(hasRenderableItem),
    [slideRightItems]
  );

  const hasSlideOverrides = hasLeftOverrides || hasRightOverrides;

  const initialLeftState = useMemo(
    () => ({
      key: getItemKey(defaultLeftItem),
      item: defaultLeftItem,
    }),
    [defaultLeftItem]
  );

  const initialRightState = useMemo(
    () => ({
      key: getItemKey(defaultRightItem),
      item: defaultRightItem,
    }),
    [defaultRightItem]
  );

  const [displayedLeftState, setDisplayedLeftState] = useState(initialLeftState);
  const [displayedRightState, setDisplayedRightState] = useState(initialRightState);

  useEffect(() => {
    setDisplayedLeftState(initialLeftState);
  }, [initialLeftState]);

  useEffect(() => {
    setDisplayedRightState(initialRightState);
  }, [initialRightState]);

  const leftVariants = useMemo(() => {
    const uniqueVariants = new Map();

    [defaultLeftItem, ...linkedLeftItems].forEach((item) => {
      const key = getItemKey(item);

      if (!key || uniqueVariants.has(key)) {
        return;
      }

      uniqueVariants.set(key, item);
    });

    return Array.from(uniqueVariants.values());
  }, [defaultLeftItem, linkedLeftItems]);

  const rightVariants = useMemo(() => {
    const uniqueVariants = new Map();

    [defaultRightItem, ...linkedRightItems].forEach((item) => {
      const key = getItemKey(item);

      if (!key || uniqueVariants.has(key)) {
        return;
      }

      uniqueVariants.set(key, item);
    });

    return Array.from(uniqueVariants.values());
  }, [defaultRightItem, linkedRightItems]);

  const tallestLeftItem = useMemo(
    () => leftVariants.reduce((tallest, item) => {
      if (getItemWeight(item) > getItemWeight(tallest)) {
        return item;
      }

      return tallest;
    }, EMPTY_CONTENT_ITEM),
    [leftVariants]
  );

  const tallestRightItem = useMemo(
    () => rightVariants.reduce((tallest, item) => {
      if (getItemWeight(item) > getItemWeight(tallest)) {
        return item;
      }

      return tallest;
    }, EMPTY_CONTENT_ITEM),
    [rightVariants]
  );

  const hasLeftSlot = useMemo(
    () => hasRenderableItem(defaultLeftItem) || hasLeftOverrides,
    [defaultLeftItem, hasLeftOverrides]
  );

  const hasRightSlot = useMemo(
    () => hasRenderableItem(defaultRightItem) || hasRightOverrides,
    [defaultRightItem, hasRightOverrides]
  );

  const slotCount = hasRightSlot ? 2 : 1;
  const slotLayoutItems = [displayedLeftState.item, displayedRightState.item];
  const useWideRightLayout = Boolean(displayedRightState.item?.wideListColumns);

  const captionWrapperClass = useMemo(() => {
    const alignmentMap = {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    };

    return [
      "hw-contain",
      "full-bleed-caption",
      "mt-5",
      alignmentMap[captionPos] || "text-left",
    ].join(" ");
  }, [captionPos]);

  const captionInnerClass = useMemo(
    () => (useWideRightLayout ? "col-12" : "min-[1240px]:push-1 col-12"),
    [useWideRightLayout]
  );

  const contentWrapClass = useMemo(
    () => `full-bleed-content-wrap ${useWideRightLayout ? "mt-24" : "mt-16"}`,
    [useWideRightLayout]
  );

  const hasCaptionContent = Boolean(caption)
    || (hasSlideOverrides
      ? hasLeftSlot || hasRightSlot
      : hasRenderableContent(defaultContentItems));

  const lightboxSources = useMemo(
    () => images.map((image) => image.lightboxSrc || image.src),
    [images]
  );

  const lightboxSignature = useMemo(
    () => JSON.stringify(lightboxSources),
    [lightboxSources]
  );

  const carouselOpts = useMemo(
    () => ({
      align: "center",
      loop: true,
      skipSnaps: false,
      dragFree: false,
      duration: 35,
      watchSlides: true,
    }),
    []
  );

  const clearScheduledReinit = useCallback(() => {
    frameIdsRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
    frameIdsRef.current = [];
  }, []);

  const syncDisplayedContent = useCallback((selectedIndex) => {
    const nextLeftItem = linkedLeftItems[selectedIndex];
    const nextRightItem = linkedRightItems[selectedIndex];

    if (hasRenderableItem(nextLeftItem)) {
      const nextLeftKey = getItemKey(nextLeftItem);

      setDisplayedLeftState((currentState) => {
        if (!nextLeftKey || currentState.key === nextLeftKey) {
          return currentState;
        }

        return {
          key: nextLeftKey,
          item: nextLeftItem,
        };
      });
    }

    if (hasRenderableItem(nextRightItem)) {
      const nextRightKey = getItemKey(nextRightItem);

      setDisplayedRightState((currentState) => {
        if (!nextRightKey || currentState.key === nextRightKey) {
          return currentState;
        }

        return {
          key: nextRightKey,
          item: nextRightItem,
        };
      });
    }
  }, [linkedLeftItems, linkedRightItems]);

  const updateNav = useCallback(() => {
    if (!api) return;

    const selectedIndex = api.selectedScrollSnap();

    setNavState({
      current: selectedIndex + 1,
      canPrev: api.canScrollPrev(),
      canNext: api.canScrollNext(),
    });

    syncDisplayedContent(selectedIndex);
  }, [api, syncDisplayedContent]);

  const scheduleReinit = useCallback(() => {
    if (!api?.reInit) return;

    clearScheduledReinit();

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        api.reInit();
        setReady(true);
        updateNav();
      });

      frameIdsRef.current = frameIdsRef.current.filter((id) => id !== firstFrame);
      frameIdsRef.current.push(secondFrame);
    });

    frameIdsRef.current.push(firstFrame);
  }, [api, clearScheduledReinit, updateNav]);

  useEffect(() => {
    if (!api) return;

    const handleReady = () => {
      setReady(true);
      updateNav();
    };

    if (api.slideNodes?.().length > 0) {
      handleReady();
    }

    api.on("init", handleReady);
    api.on("reInit", handleReady);
    api.on("select", updateNav);

    scheduleReinit();

    return () => {
      api.off("init", handleReady);
      api.off("reInit", handleReady);
      api.off("select", updateNav);
    };
  }, [api, scheduleReinit, updateNav]);

  useEffect(() => {
    if (!api || !rootRef.current) return;

    const handleAstroPageLoad = () => scheduleReinit();
    const handleLocoReady = () => scheduleReinit();
    const handleResize = () => scheduleReinit();
    const handleAssetLoad = (event) => {
      const target = event.target;
      if (target?.tagName === "IMG" || target?.tagName === "VIDEO") {
        scheduleReinit();
      }
    };

    document.addEventListener("astro:page-load", handleAstroPageLoad);
    document.addEventListener("loco:ready", handleLocoReady);
    window.addEventListener("resize", handleResize, { passive: true });
    rootRef.current.addEventListener("load", handleAssetLoad, true);

    let resizeObserver = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        scheduleReinit();
      });
      resizeObserver.observe(rootRef.current);
    }

    return () => {
      document.removeEventListener("astro:page-load", handleAstroPageLoad);
      document.removeEventListener("loco:ready", handleLocoReady);
      window.removeEventListener("resize", handleResize);
      rootRef.current?.removeEventListener("load", handleAssetLoad, true);
      resizeObserver?.disconnect();
      clearScheduledReinit();
    };
  }, [api, clearScheduledReinit, scheduleReinit]);

  const handlePrev = useCallback(() => {
    api?.scrollPrev();
  }, [api]);

  const handleNext = useCallback(() => {
    api?.scrollNext();
  }, [api]);

  const ensureLightbox = useCallback(async () => {
    if (lightboxSources.length === 0) {
      lightboxRef.current = null;
      lightboxInitPromiseRef.current = null;
      lightboxSignatureRef.current = "";
      return null;
    }

    if (
      lightboxRef.current
      && lightboxSignatureRef.current === lightboxSignature
    ) {
      return lightboxRef.current;
    }

    if (lightboxSignatureRef.current !== lightboxSignature) {
      lightboxRef.current?.close?.();
      lightboxRef.current = null;
      lightboxInitPromiseRef.current = null;
    }

    if (!lightboxInitPromiseRef.current) {
      lightboxInitPromiseRef.current = (async () => {
        const FsLightbox = await loadFsLightboxConstructor();

        if (!FsLightbox) {
          return null;
        }

        const nextInstance = new FsLightbox();
        nextInstance.props.sources = [...lightboxSources];
        nextInstance.props.loadOnlyCurrentSource = true;
        nextInstance.setup();

        lightboxRef.current = nextInstance;
        lightboxSignatureRef.current = lightboxSignature;

        return nextInstance;
      })();
    }

    const instance = await lightboxInitPromiseRef.current;

    if (!instance) {
      lightboxInitPromiseRef.current = null;
      lightboxRef.current = null;
      lightboxSignatureRef.current = "";
    }

    return instance;
  }, [lightboxSignature, lightboxSources]);

  useEffect(() => {
    void ensureLightbox();
  }, [ensureLightbox]);

  useEffect(() => () => {
    lightboxRef.current?.close?.();
    lightboxRef.current = null;
    lightboxInitPromiseRef.current = null;
    lightboxSignatureRef.current = "";
  }, []);

  const handleOpenLightbox = useCallback(async (index) => {
    const instance = await ensureLightbox();
    instance?.open(index);
  }, [ensureLightbox]);

  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  return (
    <article
      ref={rootRef}
      className="carousel-wrapper"
      data-ready={ready}
      data-carousel-instance={instanceId || undefined}
    >
      <div className="carousel-container">
        <Carousel setApi={setApi} className="w-full mx-auto" opts={carouselOpts}>
          <CarouselContent className="-ml-5">
            {images.map((image, index) => (
              <CarouselItem
                key={image.id}
                className="carousel-slide-item pl-5 basis-[85%] min-[1400px]:basis-[60%] min-[2200px]:basis-[40%]"
              >
                <Slide
                  image={image}
                  index={index}
                  gallerySize={images.length}
                  onOpenLightbox={handleOpenLightbox}
                />
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="carousel-nav-position">
            <SlideNavigation
              onNext={handleNext}
              onPrev={handlePrev}
              canNext={navState.canNext}
              canPrev={navState.canPrev}
            />
          </div>
        </Carousel>
      </div>

      {hasCaptionContent && (
        <div className={captionWrapperClass}>
          <div className="row">
            <div className={captionInnerClass}>
              {caption && <div dangerouslySetInnerHTML={{ __html: caption }} />}

              {hasSlideOverrides ? (
                (hasLeftSlot || hasRightSlot) && (
                  <div className={contentWrapClass}>
                    <div className="row">
                      {hasLeftOverrides ? (
                        <div className={getColumnClass(0, slotCount, slotLayoutItems)}>
                          <div className="carousel-slide-content-stack">
                            {hasRenderableItem(tallestLeftItem) && (
                              <div
                                className="carousel-slide-content-ghost"
                                aria-hidden="true"
                              >
                                <ColumnContentInner item={tallestLeftItem} />
                              </div>
                            )}

                            <AnimatePresence initial={false} mode="sync">
                              {hasRenderableItem(displayedLeftState.item) && (
                                <motion.div
                                  key={displayedLeftState.key || "carousel-left-content"}
                                  className="carousel-slide-content-active"
                                  initial={{ opacity: 0 }}
                                  animate={{
                                    opacity: 1,
                                    transition: {
                                      duration: TEXT_FADE_DURATION,
                                      delay: TEXT_FADE_IN_DELAY,
                                      ease: TEXT_FADE_IN_EASE,
                                    },
                                  }}
                                  exit={{
                                    opacity: 0,
                                    transition: {
                                      duration: TEXT_FADE_OUT_DURATION,
                                      ease: TEXT_FADE_OUT_EASE,
                                    },
                                  }}
                                >
                                  <ColumnContentInner item={displayedLeftState.item} />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ) : (
                        <ColumnContent
                          item={defaultLeftItem}
                          className={getColumnClass(0, slotCount, slotLayoutItems)}
                        />
                      )}

                      {hasRightSlot && (
                        hasRightOverrides ? (
                          <div className={getColumnClass(1, 2, slotLayoutItems)}>
                            <div className="carousel-slide-content-stack">
                              {hasRenderableItem(tallestRightItem) && (
                                <div
                                  className="carousel-slide-content-ghost"
                                  aria-hidden="true"
                                >
                                  <ColumnContentInner item={tallestRightItem} />
                                </div>
                              )}

                              <AnimatePresence initial={false} mode="sync">
                                {hasRenderableItem(displayedRightState.item) && (
                                  <motion.div
                                    key={displayedRightState.key || "carousel-right-content"}
                                    className="carousel-slide-content-active"
                                    initial={{ opacity: 0 }}
                                    animate={{
                                      opacity: 1,
                                      transition: {
                                        duration: TEXT_FADE_DURATION,
                                        delay: TEXT_FADE_IN_DELAY,
                                        ease: TEXT_FADE_IN_EASE,
                                      },
                                    }}
                                    exit={{
                                      opacity: 0,
                                      transition: {
                                        duration: TEXT_FADE_OUT_DURATION,
                                        ease: TEXT_FADE_OUT_EASE,
                                      },
                                    }}
                                  >
                                    <ColumnContentInner item={displayedRightState.item} />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        ) : (
                          <ColumnContent
                            item={defaultRightItem}
                            className={getColumnClass(1, 2, slotLayoutItems)}
                          />
                        )
                      )}
                    </div>
                  </div>
                )
              ) : (
                hasRenderableContent(defaultContentItems) && (
                  <div className={contentWrapClass}>
                    <ContentColumns items={defaultContentItems} />
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
