import type { APIRoute } from 'astro';
import { exec } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '../lib/env';

export const prerender = false;

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeRepository(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

function getProvidedSecret(request: Request) {
  const headerSecret =
    request.headers.get('x-wp-webhook-secret') ||
    request.headers.get('x-webhook-secret');

  if (headerSecret?.trim()) {
    return headerSecret.trim();
  }

  const authorization = request.headers.get('authorization') || '';
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, '').trim();
  }

  return '';
}

function safeEqual(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (!expectedBuffer.length || expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function parseBody(request: Request): Promise<JsonRecord> {
  const raw = await request.text();

  if (!raw.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : { value: parsed };
  } catch {
    return { raw };
  }
}

function runLocalSync() {
  return new Promise<Response>((resolve) => {
    exec('npm run sync:flex', (error) => {
      if (error) {
        console.error('[wp-sync] local sync failed:', error);
        resolve(
          json(
            {
              ok: false,
              mode: 'local',
              message: 'Local sync failed.',
            },
            500
          )
        );
        return;
      }

      resolve(
        json(
          {
            ok: true,
            mode: 'local',
            message: 'Local sync completed.',
          },
          202
        )
      );
    });
  });
}

async function dispatchGitHub(
  repository: string,
  token: string,
  eventType: string,
  clientPayload: JsonRecord
) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'parkrow-wordpress-sync',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: clientPayload,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `GitHub dispatch failed (${response.status}): ${text.slice(0, 400)}`
    );
  }
}

export const POST: APIRoute = async ({ request }) => {
  const isNetlify = Boolean(getEnv('NETLIFY'));
  const githubToken = (getEnv('GITHUB') || getEnv('GITHUB_TOKEN')).trim();
  const githubRepository = normalizeRepository(getEnv('GITHUB_REPOSITORY'));
  const webhookSecret = getEnv('WP_WEBHOOK_SECRET').trim();

  if (!isNetlify && (!githubToken || !githubRepository)) {
    return runLocalSync();
  }

  if (!webhookSecret) {
    return json(
      {
        ok: false,
        message: 'Missing WP_WEBHOOK_SECRET.',
      },
      500
    );
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || !safeEqual(webhookSecret, providedSecret)) {
    return json(
      {
        ok: false,
        message: 'Unauthorized.',
      },
      401
    );
  }

  if (!githubToken) {
    return json(
      {
        ok: false,
        message: 'Missing GITHUB or GITHUB_TOKEN.',
      },
      500
    );
  }

  if (!githubRepository || !githubRepository.includes('/')) {
    return json(
      {
        ok: false,
        message: 'Missing GITHUB_REPOSITORY in owner/repo format.',
      },
      500
    );
  }

  const payload = await parseBody(request);
  const eventType = (getEnv('GITHUB_DISPATCH_EVENT') || 'wordpress_content_changed').trim();
  const clientPayload: JsonRecord = {
    source: 'wordpress',
    receivedAt: new Date().toISOString(),
    ...payload,
  };

  try {
    await dispatchGitHub(
      githubRepository,
      githubToken,
      eventType,
      clientPayload
    );

    console.log('[wp-sync] repository dispatch sent', {
      repository: githubRepository,
      eventType,
      reason: payload.reason || null,
    });

    return json(
      {
        ok: true,
        repository: githubRepository,
        eventType,
      },
      202
    );
  } catch (error) {
    console.error('[wp-sync] dispatch failed:', error);
    return json(
      {
        ok: false,
        message: 'GitHub dispatch failed.',
      },
      502
    );
  }
};

export const GET: APIRoute = async () =>
  json(
    {
      ok: false,
      message: 'Use POST.',
    },
    405
  );
