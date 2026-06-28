import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

/**
 * Same-origin tracking gateway. Forwards every /api/event/* request to the Soborbo
 * event-gateway worker via the GATEWAY service binding (declared in wrangler.jsonc).
 *
 * Reaching the worker takes TWO things, both required:
 *   1. `assets.run_worker_first: ["/api/event/*"]` in wrangler.jsonc — otherwise the
 *      asset layer answers /api/event/* with the 404 page (not_found_handling:
 *      "404-page") WITHOUT ever invoking the worker.
 *   2. This route reads the GATEWAY binding from the `cloudflare:workers` env module.
 *      Astro 6 / @astrojs/cloudflare v13+ REMOVED `Astro.locals.runtime.env` (it now
 *      throws), so the old `locals.runtime.env` access crashed this route with a 500.
 *
 * The gateway resolves the site from the request hostname → its SITE_CONFIG KV entry.
 */
const handler: APIRoute = async ({ request }) => {
  const gateway = (cfEnv as { GATEWAY?: { fetch?: (req: Request) => Promise<Response> } }).GATEWAY;
  if (gateway && typeof gateway.fetch === 'function') {
    return gateway.fetch(request);
  }
  // Fail loud — never let a tracking beacon fall through to the site's 404 page.
  return new Response('event-gateway binding unavailable', { status: 503 });
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
