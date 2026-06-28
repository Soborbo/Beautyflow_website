import { gatewayProxy } from '@/lib/tracking/gateway-proxy';

// Static route for offline CRM lead-status updates → event-gateway worker.
export const prerender = false;

export const GET = gatewayProxy;
export const POST = gatewayProxy;
export const OPTIONS = gatewayProxy;
