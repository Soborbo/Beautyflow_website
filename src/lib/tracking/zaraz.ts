/**
 * Zaraz (Meta CAPI) Events
 * Access Token: NEVER in code, only Cloudflare Dashboard
 */

declare global {
  interface Window {
    zaraz?: {
      track: (eventName: string, params: Record<string, unknown>) => void;
      set: (key: string, value: unknown) => void;
    };
  }
}

export interface MetaEventParams {
  email: string;
  phone?: string;
  value?: number;
  currency?: string;
  contentName?: string;
}

function isZarazAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.zaraz !== 'undefined';
}

export function trackMetaLead(params: MetaEventParams): boolean {
  if (!isZarazAvailable()) {
    console.warn('[Tracking] Zaraz not available');
    return false;
  }

  const eventParams: Record<string, unknown> = {
    em: params.email.trim().toLowerCase(),
  };

  if (params.phone && params.phone.length >= 8) {
    eventParams.ph = params.phone.replace(/[^\d+]/g, '');
  }

  if (params.value && params.value > 0) {
    eventParams.value = params.value;
    eventParams.currency = params.currency || 'HUF';
  }

  if (params.contentName) eventParams.content_name = params.contentName;

  window.zaraz!.track('Lead', eventParams);
  return true;
}

export function trackMetaPageView(): boolean {
  if (!isZarazAvailable()) return false;
  window.zaraz!.track('PageView', {});
  return true;
}

export function trackMetaViewContent(contentName: string): boolean {
  if (!isZarazAvailable()) return false;
  window.zaraz!.track('ViewContent', { content_name: contentName });
  return true;
}
