const refresh = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.has("astro-refresh")) return;
  url.searchParams.set("astro-refresh", Date.now().toString(36));
  window.location.replace(url.toString());
};

refresh();

export default function StaleAstroChunkShim() {
  return null;
}
