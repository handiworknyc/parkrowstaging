# WordPress -> GitHub Actions -> Netlify

This repo now supports a webhook-driven content-sync flow:

1. WordPress posts to `/wp-sync`.
2. `/wp-sync` verifies `WP_WEBHOOK_SECRET` and creates a GitHub `repository_dispatch`.
3. [`.github/workflows/wordpress-content-sync.yml`](/Users/jesserosenfield/Documents/park row astro/parkrow/.github/workflows/wordpress-content-sync.yml) receives that event.
4. GitHub Actions runs `npm run sync:flex`.
5. GitHub Actions commits the updated JSON snapshot back to the repo.
6. Netlify deploys from that Git push.

The workflow currently commits [src/content/wp](/Users/jesserosenfield/Documents/park row astro/parkrow/src/content/wp), [public/prefetch-map.json](/Users/jesserosenfield/Documents/park row astro/parkrow/public/prefetch-map.json), [public/img-cache](/Users/jesserosenfield/Documents/park row astro/parkrow/public/img-cache), and [public/images](/Users/jesserosenfield/Documents/park row astro/parkrow/public/images).

## Required Secrets

Set these in Netlify site environment variables:

- `GITHUB`: GitHub token with permission to dispatch workflows on this repo.
- `GITHUB_REPOSITORY`: `owner/repo`
- `WP_WEBHOOK_SECRET`: shared secret used by WordPress when calling `/wp-sync`

Set these in GitHub Actions repository secrets:

- `WP_BASE_URL`
- `WORDPRESS_API_URL`
- `WP_AUTH_BASIC`
- `WP_IMAGE_ALLOW_HOSTS`
- `AVESDO`
- `GF_CONSUMER_KEY`
- `GF_CONSUMER_SECRET`

`WP_DRAFT_ACCESS_SECRET` is optional and intended for local-only draft syncing. The sync script ignores it when running on Netlify.

Netlify must already be connected to this GitHub repo with automatic deploys enabled on the branch this workflow pushes to.

The workflow also runs on a 6-hour schedule so Avesdo inventory changes are synced even when WordPress content has not changed.

## WordPress Configuration

Install the PHP snippet from [docs/wordpress/parkrow-headless-webhook.php](/Users/jesserosenfield/Documents/park row astro/parkrow/docs/wordpress/parkrow-headless-webhook.php) as a small plugin or `mu-plugin`.

Set these constants in that file:

- `PARKROW_HEADLESS_WEBHOOK_URL`: `https://your-site.netlify.app/wp-sync`
- `PARKROW_HEADLESS_WEBHOOK_SECRET`: the same value as `WP_WEBHOOK_SECRET`

The snippet adds:

- automatic triggers for post create/update/delete/trash/untrash
- automatic triggers for nav menu updates
- automatic triggers for taxonomy changes
- automatic triggers for ACF options saves
- a manual WordPress REST endpoint at `/wp-json/parkrow/v1/rebuild`

## Manual Test

Test the Netlify webhook endpoint directly:

```bash
curl -X POST https://your-site.netlify.app/wp-sync \
  -H "Content-Type: application/json" \
  -H "X-WP-Webhook-Secret: your-shared-secret" \
  -d '{"reason":"manual_test"}'
```

Test the WordPress manual endpoint after installing the PHP snippet:

```bash
curl -X POST https://your-wordpress-site.com/wp-json/parkrow/v1/rebuild \
  -H "Content-Type: application/json" \
  -H "X-WP-Webhook-Secret: your-shared-secret" \
  -d '{"reason":"manual_test"}'
```

## Security

Your tracked `.env` files currently contain real secrets. Rotate those credentials and move them into Netlify and GitHub secrets before relying on this workflow.
