import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Same-origin tracking gateway. Forwards every /api/event/* request to the Soborbo
 * event-gateway worker via the GATEWAY service binding (declared in wrangler.jsonc).
 *
 * Why a real Astro route (not just middleware): beautyflow.pro is a Cloudflare
 * Custom Domain for THIS worker, and `assets.not_found_handling: "404-page"` makes
 * the asset layer answer unknown paths with the 404 page WITHOUT invoking the
 * worker — so middleware never sees /api/event/*. Declaring this catch-all route
 * puts /api/event/* into the worker's route manifest, so the request reaches here
 * and we proxy it to the gateway. This is durable across site redeploys (unlike a
 * zone Worker Route, which the Custom Domain wipes on every deploy). The gateway
 * resolves the site from the request hostname → its SITE_CONFIG KV entry.
 */
const handler: APIRoute = async ({ request, locals }) => {
  const env = (locals as { runtime?: { env?: Record<string, unknown> } })?.runtime?.env;
  const gateway = env?.GATEWAY as { fetch?: (req: Request) => Promise<Response> } | undefined;
  if (gateway && typeof gateway.fetch === 'function') {
    return gateway.fetch(request);
  }
  // Fail loud — never let a tracking beacon fall through to the site's 404 page.
  return new Response('event-gateway binding unavailable', { status: 503 });
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
