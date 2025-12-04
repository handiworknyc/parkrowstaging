export function findCFVideoChunk(manifest) {
  if (!manifest) return null;

  for (const file in manifest) {
    if (file.includes("CFVideo") && file.endsWith(".js")) {
      return "/" + file;  // Netlify serves client bundles from root
    }
  }

  return null;
}
