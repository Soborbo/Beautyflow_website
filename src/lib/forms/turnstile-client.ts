/**
 * Client-side Cloudflare Turnstile helper for the multi-step consultation
 * calculator (/ingyenes-konzultacio, /en/free-consultation).
 *
 * Unlike the single-page location ContactForm (which uses implicit rendering
 * inside a real <form> and reads the auto-injected `cf-turnstile-response`
 * input), the calculator:
 *   - isn't a <form> element, so there's no FormData to read the token from, and
 *   - keeps the submit button inside a step that's `display:none` until the
 *     user reaches it.
 *
 * So we render the widget explicitly once the user reaches the final step
 * (guaranteeing it's visible, and minimising token-expiry while they click
 * through earlier steps) and read the token via the Turnstile JS API.
 *
 * Load the API with `?render=explicit` so it doesn't auto-scan the DOM:
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
 */

interface TurnstileAPI {
  render: (el: HTMLElement | string, opts: Record<string, unknown>) => string;
  getResponse: (widgetId?: string) => string | undefined;
  reset: (widgetId?: string) => void;
}

function getApi(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}

export interface TurnstileHandle {
  /** Render the widget once the API is ready (idempotent). Call when the
   *  final step becomes visible. */
  ensureRendered: () => void;
  /** Current token, or '' if the challenge hasn't been solved yet. */
  getToken: () => string;
  /** Reset the widget so the user can retry after a rejected submit. */
  reset: () => void;
}

/**
 * Wire up a Turnstile widget that renders into `container`. The async API
 * script may not have loaded yet when `ensureRendered()` is first called, so
 * we poll briefly (up to 10s) until `window.turnstile` appears.
 */
export function createTurnstile(container: HTMLElement, sitekey: string): TurnstileHandle {
  let widgetId: string | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function tryRender(): void {
    if (widgetId !== undefined) return;
    const api = getApi();
    if (!api || typeof api.render !== 'function') return;
    widgetId = api.render(container, { sitekey, theme: 'light', size: 'flexible' });
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  function ensureRendered(): void {
    tryRender();
    if (widgetId === undefined && pollTimer === undefined) {
      const start = Date.now();
      pollTimer = setInterval(() => {
        tryRender();
        if (widgetId !== undefined || Date.now() - start > 10000) {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = undefined;
          }
        }
      }, 200);
    }
  }

  return {
    ensureRendered,
    getToken: () => {
      const api = getApi();
      if (!api || widgetId === undefined) return '';
      return api.getResponse(widgetId) || '';
    },
    reset: () => {
      const api = getApi();
      if (api && widgetId !== undefined) api.reset(widgetId);
    },
  };
}
