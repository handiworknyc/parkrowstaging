import type { APIRoute } from 'astro';
import { warmContactSubmitCaches } from '../../../lib/contact/submitContact';

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await warmContactSubmitCaches();

  return new Response(result.body, {
    status: result.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': result.contentType,
      'x-gf-warmup': 'astro',
    },
  });
};
