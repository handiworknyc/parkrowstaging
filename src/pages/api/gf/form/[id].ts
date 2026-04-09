export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env.ts';

const WP = getEnv('WP_BASE_URL');
const KEY = getEnv('GF_CONSUMER_KEY');
const SECRET = getEnv('GF_CONSUMER_SECRET');
const BASIC = getEnv('WP_AUTH_BASIC');

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

  if (!WP || !KEY || !SECRET) {
    return new Response(JSON.stringify({ error: 'Missing Gravity Forms env configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const qs = new URLSearchParams({
    consumer_key: KEY,
    consumer_secret: SECRET,
  });

  const endpoint = `${WP}/wp-json/gf/v2/forms/${id}?${qs}`;

  const res = await fetch(endpoint, {
    headers: {
      ...(BASIC ? { Authorization: `Basic ${b64(BASIC)}` } : {}),
      Accept: 'application/json',
    },
  });

  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
