import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) return new Response("Missing id", { status: 400 });

  const mp4Url =
    `https://customer-u7ssw6pfj8oowdhj.cloudflarestream.com/${id}/downloads/default.mp4`;

  return Response.redirect(mp4Url, 302);
};
