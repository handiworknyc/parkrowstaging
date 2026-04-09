import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const root = fileURLToPath(new URL(".", import.meta.url));
const debugDir = resolve(root, ".debug");

function writeDebugFile(name, contents) {
  mkdirSync(debugDir, { recursive: true });
  writeFileSync(resolve(debugDir, name), contents);
}

function logChunkWindow(prefix, code, targetLine, targetColumn) {
  const lines = code.split("\n");
  console.log(`${prefix} lines=${lines.length}`);

  if (lines.length < targetLine) {
    console.log(`${prefix} target line ${targetLine} not present`);
    return;
  }

  const start = Math.max(1, targetLine - 3);
  const end = Math.min(lines.length, targetLine + 3);

  for (let line = start; line <= end; line += 1) {
    console.log(`${prefix} ${line}: ${lines[line - 1]}`);
    if (line === targetLine) {
      const pointer = `${" ".repeat(Math.max(0, targetColumn - 1))}^`;
      console.log(`${prefix} ${" ".repeat(String(line).length + 2)}${pointer}`);
    }
  }
}

function debugMainLayoutScript0() {
  const targetChunkName = "MainLayout.astro_astro_type_script_index_0_lang";
  const targetLine = 69392;
  const targetColumn = 62;

  return {
    name: "debug-mainlayout-script0",
    apply: "build",
    transform(code, id) {
      if (
        id.includes("MainLayout.astro") &&
        id.includes("type=script") &&
        id.includes("index=0")
      ) {
        console.log(`[debug-mainlayout-script0:transform] id=${id}`);
        console.log(
          `[debug-mainlayout-script0:transform] lines=${code.split("\n").length}`
        );
        writeDebugFile("mainlayout-script0-transform.js", code);
      }

      return null;
    },
    renderChunk(code, chunk) {
      if (!chunk.name.includes(targetChunkName)) return null;

      console.log(
        `[debug-mainlayout-script0:renderChunk] chunk=${chunk.name} file=${chunk.fileName}`
      );
      console.log(
        `[debug-mainlayout-script0:renderChunk] modules=${chunk.moduleIds.join(" | ")}`
      );

      writeDebugFile("mainlayout-script0-renderChunk.js", code);
      logChunkWindow(
        "[debug-mainlayout-script0:renderChunk]",
        code,
        targetLine,
        targetColumn
      );

      return null;
    },
  };
}

export default defineConfig({
  site: "https://parkrowbellevue.com",

  output: "server",

  adapter: netlify(),

  integrations: [tailwind(), react()],

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
    plugins: [debugMainLayoutScript0()],

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
