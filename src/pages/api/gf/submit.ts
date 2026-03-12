import type { APIRoute } from 'astro';
import { submitContact } from '../../../lib/contact/submitContact';

export const prerender = false;

/* =========================================================
   POST
========================================================= */

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Invalid JSON body.',
      }),
      { status: 400 }
    );
  }
  const result = await submitContact(body);

  return new Response(result.body, {
    status: result.status,
    headers: {
      'Content-Type': result.contentType,
      'x-gf-proxy': 'astro',
    },
  });
};

/* =========================================================
   BLOCK GET
========================================================= */

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      message: 'Use POST',
    }),
    { status: 405 }
  );
};
