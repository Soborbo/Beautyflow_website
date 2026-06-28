import { gatewayProxy } from '@/lib/tracking/gateway-proxy';

// Static route for the Google Ads OAuth init/callback handshake → event-gateway.
export const prerender = false;

export const GET = gatewayProxy;
export const POST = gatewayProxy;
export const OPTIONS = gatewayProxy;
