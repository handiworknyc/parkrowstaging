import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

export function loadManifest() {
  try {
    // Astro bundles manifest here in server output
    const manifestPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../.netlify/functions-internal/manifest.json"
    );

    const json = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return json;
  } catch (e) {
    console.warn("Manifest not available:", e.message);
    return null;
  }
}
