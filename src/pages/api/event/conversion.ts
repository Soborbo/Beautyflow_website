import { gatewayProxy } from '@/lib/tracking/gateway-proxy';

// Static route → reaches the Worker on the production custom domain (unlike the
// [...slug] catch-all). The browser tracking lib POSTs every conversion beacon
// here (navigator.sendBeacon / fetch keepalive); we proxy it to the event-gateway.
export const prerender = false;

export const GET = gatewayProxy;
export const POST = gatewayProxy;
export const OPTIONS = gatewayProxy;
