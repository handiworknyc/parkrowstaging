import type { APIRoute } from "astro";
import fs from "fs/promises";
import path from "path";

// Folder to store MP4 files locally
const VIDEO_DIR = path.resolve("./videos");

async function ensureVideoDir() {
  try {
    await fs.mkdir(VIDEO_DIR, { recursive: true });
  } catch (e) {}
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  await ensureVideoDir();

  const localPath = path.join(VIDEO_DIR, `${id}.mp4`);

  // If MP4 already exists → return it
  try {
    const stat = await fs.stat(localPath);
    if (stat.size > 0) {
      const file = await fs.readFile(localPath);
      return new Response(file, {
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch (e) {
    // file does not exist → continue to download
  }

  // Download MP4 from Cloudflare Stream
  const cloudflareURL =
    `https://customer-u7ssw6pfj8oowdhj.cloudflarestream.com/${id}/downloads/default.mp4`;

  console.log("[API] Downloading MP4 from Cloudflare:", cloudflareURL);

  const res = await fetch(cloudflareURL);

  if (!res.ok) {
    console.error("[API] Cloudflare fetch error:", res.status);
    return new Response("Cloudflare unavailable", { status: 502 });
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Save locally
  await fs.writeFile(localPath, buffer);

  console.log("[API] MP4 saved locally:", localPath);

  return new Response(buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
