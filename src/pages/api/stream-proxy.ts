// /src/pages/api/stream-proxy.ts
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const reqUrl = request.url;
  console.log("🔵 [/api/stream-proxy] Raw request.url:", reqUrl);

  const url = new URL(reqUrl);
  console.log("🔵 Parsed URL object:", url);

  const id = url.searchParams.get("id");

  console.log("🔵 Extracted ID:", id);
  console.log("🔵 Type of ID:", typeof id);

  if (id) {
    console.log("🔵 ID length:", id.length);

    // Log each character for weird Unicode issues
    console.log("🔵 ID chars:", id.split(""));
  }

  // Validate ID
  const isValid = id && /^[a-f0-9]{32}$/i.test(id);

  console.log("🔵 Regex validation:", isValid);

  if (!isValid) {
    console.error("❌ INVALID Cloudflare Stream ID:", id);
    return new Response(
      `Invalid Cloudflare Stream ID received: "${id}"`,
      { status: 400 }
    );
  }

  const streamUrl =
    `https://customer-u7ssw6pfj8oowdhj.cloudflarestream.com/${id}/manifest/video.m3u8?clientBandwidthHint=10000&maxHeight=1080`;

  console.log("🔵 Redirecting to:", streamUrl);

  return Response.redirect(streamUrl, 302);
};
