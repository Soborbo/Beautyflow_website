/**
 * Form tracking: form_start, form_step_complete, form_abandonment.
 *
 * Abandonment is best-effort. We listen on `pagehide` and
 * `visibilitychange` (the latter for mobile background-tab cases) and
 * fire a `navigator.sendBeacon` to a dedicated endpoint that forwards
 * to GA4 Measurement Protocol server-side. A dataLayer push is used
 * ONLY as a fallback when sendBeacon is unavailable or refuses to
 * queue — firing both paths would double-count the abandonment in GA4.
 * Both paths carry the same `event_id` for downstream dedup.
 *
 * Cleanup: this module assumes a hard-navigation MPA (see notes in
 * global-listeners.ts).
 */

import { ABANDONMENT_BEACON_URL, ABANDONMENT_MIN_DWELL_MS } from './config';
import { trackEvent } from './tracking';
import { generateUUID } from './uuid';

interface FormState {
  formName: string;
  startedAt: number;
  lastStep?: string;
  lastField?: string;
  submitted: boolean;
}

const activeForms = new Map<string, FormState>();
let listenersInstalled = false;

export function trackFormStart(formId: string, formName: string): void {
  if (activeForms.has(formId)) return;
  activeForms.set(formId, { formName, startedAt: Date.now(), submitted: false });
  installAbandonmentListeners();
  trackEvent('form_start', {
    form_name: formName,
    page_path: location.pathname,
    page_title: document.title,
  });
}

export function trackFormFieldFocus(formId: string, fieldName: string): void {
  const state = activeForms.get(formId);
  if (!state) return;
  state.lastField = fieldName;
}

export function trackFormStep(
  formId: string,
  stepName: string,
  stepNumber: number,
  totalSteps: number,
): void {
  const state = activeForms.get(formId);
  if (state) state.lastStep = stepName;
  trackEvent('form_step_complete', {
    form_name: state?.formName,
    step_name: stepName,
    step_number: stepNumber,
    total_steps: totalSteps,
    page_path: location.pathname,
  });
}

export function trackFormSubmitted(formId: string): void {
  const state = activeForms.get(formId);
  if (state) state.submitted = true;
}

/**
 * Reads the real GA4 client_id (`_ga` cookie) and session_id (`_ga_<id>`
 * cookie) so the server-side Measurement Protocol abandonment hit can be
 * attributed to the SAME user/session the browser gtag reports under.
 * Without this the server derives a synthetic client_id from IP+UA,
 * which spawns a sourceless phantom session → GA4 "Unassigned" traffic.
 */
function readGa4Ids(): { client_id?: string; session_id?: string } {
  const out: { client_id?: string; session_id?: string } = {};
  if (typeof document === 'undefined') return out;
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const ga = cookies.find((c) => c.startsWith('_ga='));
    if (ga) {
      // _ga=GA1.1.<client_id> where client_id is "1234567890.1234567890"
      const m = ga.slice(4).match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
      if (m) out.client_id = m[1];
    }
    // _ga_<streamId>=GS1.1.<session_id>.<...> (also GS2.1 in newer tags)
    const gaSession = cookies.find((c) => /^_ga_[A-Z0-9]+=/.test(c));
    if (gaSession) {
      const parts = gaSession.slice(gaSession.indexOf('=') + 1).split('.');
      if (/^GS\d+$/.test(parts[0]) && parts[2]) out.session_id = parts[2];
    }
  } catch {
    // cookies unavailable — server falls back to a derived client_id
  }
  return out;
}

function reportAbandonment(state: FormState): void {
  if (Date.now() - state.startedAt < ABANDONMENT_MIN_DWELL_MS) return;

  const payload = {
    // Shared dedup key: whichever path delivers (beacon → GA4 MP, or the
    // dataLayer fallback → gtag), the event carries the same id so the
    // two can never be double-counted as distinct abandonments.
    event_id: generateUUID(),
    // Real GA4 ids so the MP hit joins the user's existing session
    // instead of creating a sourceless "Unassigned" one.
    ...readGa4Ids(),
    form_name: state.formName,
    last_step: state.lastStep || 'unknown',
    last_field: state.lastField || 'unknown',
    time_spent_seconds: Math.round((Date.now() - state.startedAt) / 1000),
    exit_page_path: location.pathname,
    exit_page_title: document.title,
    exit_page_url: location.href,
  };

  // The beacon is the PRIMARY path: it survives pagehide, which a
  // dataLayer push does not reliably do. The dataLayer push is a
  // fallback for browsers without sendBeacon (or when queueing fails) —
  // firing both would double-count the abandonment in GA4.
  let beaconQueued = false;
  if (typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      beaconQueued = navigator.sendBeacon(ABANDONMENT_BEACON_URL, blob);
    } catch {
      // fall through to the dataLayer fallback
    }
  }
  if (!beaconQueued) trackEvent('form_abandonment', payload);
}

function flushAbandonments(): void {
  activeForms.forEach((state) => {
    if (!state.submitted) reportAbandonment(state);
  });
  activeForms.clear();
}

function installAbandonmentListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  window.addEventListener('pagehide', flushAbandonments);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAbandonments();
  });
}
