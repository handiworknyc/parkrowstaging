export default function SmartImage({
  images,
  sizes = "(max-width: 1200px) 40vw, 100vw",
  alt = "",
  imgClass = "",
  critical = false,
  crossorigin,
  fetchpriority,
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

  const parts = [];
  if (xl) parts.push({ url: xl, w: 1700 });
  if (lg) parts.push({ url: lg, w: 1400 });
  if (md) parts.push({ url: md, w: 1000 });
  if (sm) parts.push({ url: sm, w: 600 });

  const srcSet = parts.map((p) => `${p.url} ${p.w}w`).join(", ");

  const primary = parts.length ? parts[0].url : xl || lg || md || sm || "";

  const loading = critical ? "eager" : "lazy";
  const decoding = critical ? "sync" : "async";

  return (
    <img
      className={["hw-lazy-img", imgClass].filter(Boolean).join(" ")}
      src={primary}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fp}
      crossOrigin={crossorigin}
    />
  );
}
