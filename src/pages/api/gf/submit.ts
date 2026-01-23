import type { APIRoute } from 'astro';

export const prerender = false;

/* =========================================================
   ENV HELPERS
========================================================= */

function getEnv(name: string): string {
  const ime =
    (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
  const pe =
    (typeof process !== 'undefined' && (process as any).env) || {};
  return String(pe[name] ?? ime[name] ?? '');
}

function toBasicHeader(value?: string): string | null {
  if (!value) return null;
  if (value.startsWith('Basic ')) return value;

  return `Basic ${Buffer.from(value, 'utf8').toString('base64')}`;
}

/* =========================================================
   WORDPRESS BASE
========================================================= */

function getWpBase(): string {
  const gql = (getEnv('WORDPRESS_API_URL') || '').trim();
  const fromGql = gql ? gql.replace(/\/graphql\/?$/i, '') : '';

  return (
    getEnv('WP_BASE_URL') ||
    getEnv('PUBLIC_WP_BASE_URL') ||
    fromGql ||
    ''
  ).replace(/\/+$/, '');
}


const WP_BASE = getWpBase();

/* =========================================================
   POST
========================================================= */

export const POST: APIRoute = async ({ request }) => {
  if (!WP_BASE) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Missing WP base URL',
      }),
      { status: 500 }
    );
  }

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

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Invalid request body.',
      }),
      { status: 400 }
    );
  }

  const { form_id, fields } = body as {
    form_id?: number | string;
    fields?: unknown;
  };

  if (
    !form_id ||
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields)
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Missing form_id or fields.',
      }),
      { status: 400 }
    );
  }

  /* -------------------------------------------------------
     Build payload exactly like Next.js
  ------------------------------------------------------- */

  const fieldsPayload = {
    ...(fields as Record<string, string | string[]>),
  };

  const payload = {
    form_id,
    fields: fieldsPayload,
    ...fieldsPayload,
  };

  /* -------------------------------------------------------
     Headers
  ------------------------------------------------------- */

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const auth = toBasicHeader(getEnv('WP_AUTH_BASIC'));
  if (auth) {
    headers.Authorization = auth;
  }

  /* -------------------------------------------------------
     WordPress endpoint
  ------------------------------------------------------- */

  const wpEndpoint =
    `${WP_BASE}/wp-json/custom-gf/v1/submit`;

  try {
    const upstream = await fetch(wpEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await upstream.text();
    const contentType =
      upstream.headers.get('content-type') || 'application/json';

    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        'x-gf-proxy': 'astro',
      },
    });
  } catch (err) {
    console.error('[api/gf/submit]', err);

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Proxy request failed',
      }),
      { status: 500 }
    );
  }
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
