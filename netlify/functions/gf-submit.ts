// netlify/functions/gf-submit.ts
import type { Handler, HandlerEvent } from '@netlify/functions';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Use POST' }),
    };
  }

  const WP_BASE_URL = process.env.WP_BASE_URL || '';
  const WP_AUTH_BASIC = process.env.WP_AUTH_BASIC || '';

  if (!WP_BASE_URL) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Missing WP_BASE_URL' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { form_id, fields } = body;

    const payload = {
      form_id,
      fields,
      ...fields,
    };

    const wpEndpoint = `${WP_BASE_URL.replace(/\/$/, '')}/wp-json/custom-gf/v1/submit`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (WP_AUTH_BASIC) {
      headers.Authorization = WP_AUTH_BASIC.startsWith('Basic ')
        ? WP_AUTH_BASIC
        : `Basic ${Buffer.from(WP_AUTH_BASIC).toString('base64')}`;
    }

    const response = await fetch(wpEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (error: any) {
    console.error('GF Submit error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: error.message }),
    };
  }
};

export { handler };