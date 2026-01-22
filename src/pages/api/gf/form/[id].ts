export const prerender = false;
import type { APIRoute } from 'astro';

const WP = import.meta.env.WP_BASE_URL;
const KEY = import.meta.env.GF_CONSUMER_KEY;
const SECRET = import.meta.env.GF_CONSUMER_SECRET;
const BASIC = import.meta.env.WP_AUTH_BASIC;

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64');
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const qs = new URLSearchParams({
    consumer_key: KEY,
    consumer_secret: SECRET,
  });

  const endpoint = `${WP}/wp-json/gf/v2/forms/${id}?${qs}`;

  console.log('[GF API] →', endpoint);

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Basic ${b64(BASIC)}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();

  console.log('[GF API] status:', res.status);
  console.log('[GF API] preview:', text.slice(0, 200));

  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
