import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify/functions";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  output: "server",

  adapter: netlify(),

  integrations: [tailwind(), react()],

  prefetch: {
    prefetchAll: true,
  },

  server: {
    headers: [
      {
        source: "/img-cache/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, immutable",
          },
        ],
      },
    ],
  },

  vite: {
    server: {
      fs: {
        allow: [root, resolve(root, "videos")],
      },

      headers: {
        "/img-cache": {
          "Cache-Control": "public, max-age=2592000, immutable",
        },
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
