import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

/**
 * Shared same-origin proxy to the Soborbo event-gateway worker (GATEWAY service
 * binding, declared in wrangler.jsonc). Used by the STATIC routes under
 * src/pages/api/event/* (conversion.ts, lead-status.ts, oauth-init.ts, …).
 *
 * Why static routes and not a single [...slug] catch-all + run_worker_first:
 *   - On the production custom domain the asset layer's `not_found_handling:
 *     "404-page"` answers a DYNAMIC catch-all path WITHOUT invoking the Worker,
 *     so /api/event/[...slug] 404'd. The documented escape hatch — `run_worker_first`
 *     — flips the adapter to serve the STATIC API routes (/api/contact,
 *     /api/boranalizis) assets-first, regressing their POST to 405 and losing every
 *     lead (verified + rolled back 2026-06-28). So we can't use it.
 *   - STATIC named routes (like /api/contact) ARE registered Worker-bound by the
 *     @astrojs/cloudflare routing manifest and reach the Worker with no extra config.
 *     Declaring each gateway endpoint as its own file restores the gateway dispatch
 *     without touching the lead routes.
 *
 * The GATEWAY binding is read from the `cloudflare:workers` env module: Astro 6 /
 * @astrojs/cloudflare v13+ removed `Astro.locals.runtime.env` (it now throws).
 */
export const gatewayProxy: APIRoute = async ({ request }) => {
  const gateway = (cfEnv as { GATEWAY?: { fetch?: (req: Request) => Promise<Response> } }).GATEWAY;
  if (gateway && typeof gateway.fetch === 'function') {
    return gateway.fetch(request);
  }
  // Fail loud — never let a tracking beacon fall through to the site's 404 page.
  return new Response('event-gateway binding unavailable', { status: 503 });
};
