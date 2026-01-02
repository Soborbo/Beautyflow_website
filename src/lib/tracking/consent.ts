/**
 * Consent Management (CookieYes integration)
 */

declare global {
  interface Window {
    getCkyConsent?: () => {
      categories: {
        analytics: boolean;
        marketing: boolean;
        functional: boolean;
        necessary: boolean;
      };
    };
  }
}

export type ConsentCategory = 'analytics' | 'marketing' | 'functional' | 'necessary';

function getCookieYesConsent(): Record<ConsentCategory, boolean> | null {
  if (typeof window.getCkyConsent !== 'function') return null;

  try {
    return window.getCkyConsent().categories;
  } catch {
    return null;
  }
}

export function hasMarketingConsent(): boolean {
  const consent = getCookieYesConsent();
  if (!consent) {
    // In dev mode, allow tracking for testing
    if (import.meta.env.DEV) return true;
    // If no CMP detected, default to false (GDPR safe)
    return false;
  }
  return consent.marketing === true;
}

export function hasAnalyticsConsent(): boolean {
  const consent = getCookieYesConsent();
  if (!consent) {
    if (import.meta.env.DEV) return true;
    return false;
  }
  return consent.analytics === true;
}

export function canTrack(): boolean {
  return hasMarketingConsent() || hasAnalyticsConsent();
}

export function onConsentChange(callback: (consent: Record<ConsentCategory, boolean>) => void): void {
  document.addEventListener('cookieyes_consent_update', () => {
    const consent = getCookieYesConsent();
    if (consent) callback(consent);
  });
}

export function waitForConsent(category: ConsentCategory, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const consent = getCookieYesConsent();
    if (consent && consent[category]) {
      resolve(true);
      return;
    }

    const handler = () => {
      const newConsent = getCookieYesConsent();
      if (newConsent && newConsent[category]) {
        document.removeEventListener('cookieyes_consent_update', handler);
        resolve(true);
      }
    };

    document.addEventListener('cookieyes_consent_update', handler);
    setTimeout(() => {
      document.removeEventListener('cookieyes_consent_update', handler);
      resolve(false);
    }, timeoutMs);
  });
}
