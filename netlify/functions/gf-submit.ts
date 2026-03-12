// netlify/functions/gf-submit.ts
import type { Handler, HandlerEvent } from '@netlify/functions';
import { submitContact } from '../../src/lib/contact/submitContact';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Use POST' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const result = await submitContact(body);

    return {
      statusCode: result.status,
      headers: { 'Content-Type': result.contentType },
      body: result.body,
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
