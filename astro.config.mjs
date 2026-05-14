import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isStagingSiteEnv } from "./src/lib/deploy-env.js";
import { addStagingNetlifyHeaders } from "./src/lib/netlify-headers.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const isBuildCommand = process.argv.includes("build");
const shouldProtectStaging = isStagingSiteEnv(process.env);

function stagingNetlifyHeaders() {
  return {
    name: "parkrow-staging-netlify-headers",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        if (!shouldProtectStaging) return;

        const headersPath = fileURLToPath(new URL("_headers", dir));
        let headers = "";

        try {
          headers = await readFile(headersPath, "utf8");
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }

        await writeFile(headersPath, addStagingNetlifyHeaders(headers), "utf8");
      },
    },
  };
}

export default defineConfig({
  site: "https://parkrowbellevue.com",

  output: "server",

  adapter: netlify(),

  integrations: [tailwind(), react(), stagingNetlifyHeaders()],

  prefetch: {
    prefetchAll: true,
  },

  server: {
	host: true,
	port: 4321,
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
    cacheDir: isBuildCommand ? "node_modules/.vite-build" : "node_modules/.vite-dev",

    optimizeDeps: {
      include: [
        "embla-carousel-react",
        "gsap",
        "gsap/Draggable",
        "gsap/InertiaPlugin",
        "gsap/ScrollTrigger",
        "gsap/SplitText",
        "lucide-react",
        "motion/react",
        "react-zoom-pan-pinch",
      ],
    },

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
