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
  output: "static",

  // Netlify SSR adapter
  adapter: netlify(),

  integrations: [tailwind(), react()],
  
  prefetch: {
    prefetchAll: true
  },

  /* -----------------------------------------------------------
     30-DAY IMMUTABLE IMAGE CACHE FOR /public/img-cache
     Maps to: /img-cache/*
  ----------------------------------------------------------- */
  server: {
    headers: [
      {
        source: "/img-cache/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, immutable"
          }
        ]
      }
    ]
  },

  vite: {
    server: {
      fs: {
        allow: [
          root,
          resolve(root, "videos"),
        ],
      },

      // Dev server headers so behavior matches production
      headers: {
        "/img-cache": {
          "Cache-Control": "public, max-age=2592000, immutable"
        }
      }
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
