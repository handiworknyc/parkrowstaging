// astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Needed so API routes run server-side and can store MP4 files
  output: "server",

  // Netlify SSR adapter
  adapter: netlify(),

  integrations: [tailwind(), react()],

  vite: {
    server: {
      fs: {
        allow: [
          root,
          resolve(root, "videos"),
        ],
      },
    },

    resolve: {
      alias: {
        "@": resolve(root, "src"),
        "@ui": resolve(root, "src/components/ui"),
        "@images": resolve(root, "src/lib/images"),
      },
    },
  },
});
