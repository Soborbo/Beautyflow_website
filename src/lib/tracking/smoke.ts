/**
 * Napi synthetic-lead füstteszt — a TELJES szerver-láncot bizonyítja emberi kéz
 * nélkül: site worker → service binding → gateway hitelesített ingress
 * (/api/event/conversion-server) → hash → Meta CAPI (TEST stream) → D1 ledger.
 *
 * Biztonsági garanciák:
 *  - CSAK akkor fut, ha a TRACKING_TEST_LEAD_EMAIL + TRACKING_TEST_EVENT_CODE
 *    konfigurált ÉS a kód feloldható — enélkül a szintetikus event a PRODUCTION
 *    Meta-streambe menne (a 2 korábbi éles Meta-leak osztálya). Ha nincs kód,
 *    a teszt HANGOSAN kimarad, nem küld semmit.
 *  - Determinisztikus napi event_id (`smoke-beautyflow-YYYYMMDD`): a cron dupla
 *    tüzelését a gateway idempotenciája nyeli el, nem lesz dupla event.
 *  - A lead_id ugyanez a smoke-kulcs → a ledger lead-trail útja is gyakorlódik,
 *    és a smoke-sorok `smoke-` prefixszel kiszűrhetők minden auditból.
 *
 * A másnapi ellenőrzés a gateway napi digestjében fut (SMOKE_SITES): ha egy élő
 * site-nak nincs smoke-sora az elmúlt 24 órából, riasztás megy.
 */
import {
  sendGatewayConversion,
  resolveTestEventCode,
  type GatewayEnv,
} from './gateway-dispatch';

const SITE = 'beautyflow';

export async function runDailySmokeLead(env: GatewayEnv): Promise<void> {
  const email = env.TRACKING_TEST_LEAD_EMAIL;
  const testEventCode = resolveTestEventCode(env, email);
  if (!email || !testEventCode) {
    console.error(
      '[smoke] skipped — TRACKING_TEST_LEAD_EMAIL / TRACKING_TEST_EVENT_CODE not configured; ' +
        'refusing to send a synthetic event that would land in the PRODUCTION Meta stream',
    );
    return;
  }

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const eventId = `smoke-${SITE}-${day}`;

  const res = await sendGatewayConversion(env, {
    eventName: 'contact_form_submitted',
    eventId,
    leadId: eventId,
    source: 'daily_smoke',
    // Szintetikus tesztszemély (a kulcsolt teszt-email) — nem valós PII.
    userData: { email },
    // Explicit GRANTED: a gateway require_consent kapuja különben ad-tiltással
    // skippelné a Meta-lábat, és a füstteszt nem bizonyítana semmit.
    consent: {
      ad_user_data: 'GRANTED',
      ad_personalization: 'GRANTED',
      ad_storage: 'GRANTED',
      analytics_storage: 'GRANTED',
    },
    eventSourceUrl: `${env.SITE_URL || 'https://beautyflow.pro'}/__smoke`,
    testEventCode,
  });

  if (res.ok) {
    console.log(JSON.stringify({ level: 'info', message: '[smoke] daily synthetic lead dispatched', event_id: eventId, status: res.status }));
  } else {
    console.error(JSON.stringify({ level: 'error', message: '[smoke] daily synthetic lead FAILED', event_id: eventId, status: res.status, error: res.error, attempts: res.attempts }));
  }
}
