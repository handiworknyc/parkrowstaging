export default function SmartImage({
  images,
  sizes = "(max-width: 1200px) 40vw, 100vw",
  alt = "",
  imgClass = "",
  critical = false,
  crossorigin,
  fetchpriority,

  /* NEW */
  useSrcSet = true,
  forceSize, // 'xl' | 'large' | 'med' | 'small'
}) {
  const fp = fetchpriority ?? (critical ? "high" : "low");

  const toWebP = (url) => {
    if (!url) return null;
    return url.endsWith(".webp") ? url : `${url}.webp`;
  };

  const xl = toWebP(images?.xl);
  const lg = toWebP(images?.large);
  const md =
    images?.med === false ? null : toWebP(typeof images?.med === "string" ? images.med : null);
  const sm =
    images?.small === false
      ? null
      : toWebP(typeof images?.small === "string" ? images.small : null);

  /* ---------------------------------------------------
     FORCE SIZE LOGIC — SINGLE SRC ONLY
  ----------------------------------------------------*/
  const forcedSrc =
    forceSize === "xl" ? xl :
    forceSize === "large" ? lg :
    forceSize === "med" ? md :
    forceSize === "small" ? sm :
    null;

  /* ---------------------------------------------------
     SRCSET LOGIC (ONLY WHEN NOT FORCED)
  ----------------------------------------------------*/
  const parts = [];
  if (xl) parts.push({ url: xl, w: 1700 });
  if (lg) parts.push({ url: lg, w: 1400 });
  if (md) parts.push({ url: md, w: 1000 });
  if (sm) parts.push({ url: sm, w: 600 });

  const srcSet = parts.map((p) => `${p.url} ${p.w}w`).join(", ");
  const defaultPrimary = parts.length ? parts[0].url : xl || lg || md || sm || "";

  const primary = forcedSrc || defaultPrimary;

  const loading = critical ? "eager" : "lazy";
  const decoding = critical ? "sync" : "async";

  const base = {
    className: ["hw-lazy-img", imgClass].filter(Boolean).join(" "),
    src: primary,
    alt,
    loading,
    decoding,
    fetchPriority: fp,
    crossOrigin: crossorigin,
  };

  /* ---------------------------------------------------
     CASE 1 — FORCE SIZE → NO SRCSET OR SIZES
  ----------------------------------------------------*/
  if (forcedSrc) {
    return <img {...base} />;
  }

  /* ---------------------------------------------------
     CASE 2 — SRCSET DISABLED
  ----------------------------------------------------*/
  if (!useSrcSet) {
    return <img {...base} />;
  }

  /* ---------------------------------------------------
     CASE 3 — NORMAL RESPONSIVE IMAGE
  ----------------------------------------------------*/
  return (
    <img
      {...base}
      srcSet={srcSet}
      sizes={sizes}
    />
  );
}
