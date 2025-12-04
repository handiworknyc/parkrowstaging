export function getCFVideoChunk(manifest) {
  if (!manifest?.client?.assets) return [];

  return manifest.client.assets
    .filter((file) => file.includes("CFVideo") && file.endsWith(".js"));
}
