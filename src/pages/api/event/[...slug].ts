import { gatewayProxy } from '@/lib/tracking/gateway-proxy';

export const prerender = false;

/**
 * Catch-all fallback for any /api/event/* path not covered by an explicit static
 * route (conversion.ts, lead-status.ts, oauth-init.ts). NOTE: as a DYNAMIC route it
 * is NOT reached on the production custom domain (the asset layer's 404-page handling
 * answers unmatched paths before the Worker runs, and run_worker_first can't be used
 * — it regresses the lead routes to 405). The explicit static routes are what actually
 * serve the gateway in production; this stays for local/workers.dev parity and so a
 * new gateway endpoint degrades to a loud 503 rather than the silent site 404 page.
 */
export const GET = gatewayProxy;
export const POST = gatewayProxy;
export const OPTIONS = gatewayProxy;
