# Lead-flow incident — root cause & resolution

**Reported:** lead submissions "essentially stopped" after the 2026-05-13 deploy.
**Investigated:** 2026-06-16. **Property:** GA4 `495936197` (Beautyflow.pro).

## TL;DR

The lead **backend is not broken**. A real consultation submission was observed
returning `POST /api/contact → 200` (642 ms — full Turnstile + email path, not the
honeypot short-circuit). The required Cloudflare secrets (`TURNSTILE_SECRET_KEY`,
`RESEND_API_KEY`) are present.

The apparent "collapse" of `generate_lead` (8 → 3) is **mostly a channel shift**, not
a server failure: the 2026-05-13 deploy introduced a Notino **booking CTA**
(`booking_click`), which went **0 → 163** in the same window. Total high-intent
actions (form + booking + phone) rose **16 → 172 (~10×)**. The form channel shrank
while the booking channel absorbed the demand.

## Evidence (GA4, equal 4-week windows)

| Event | Pre (Apr15–May12) | Post (May16–Jun12) |
|---|---|---|
| session_start | 575 | 689 (+20%) |
| calculator_start | 24 | 51 (+113%) |
| calculator_step | 37 | 95 (+157%) |
| **generate_lead** (form) | **8** | **3** |
| **booking_click** (Notino) | **0** | **163** |
| phone_click | 8 | 6 |
| form_abandonment + form_abandon | 0 | 77 |
| calculator_option | 19 | 0 |

- High-intent total: pre `8+0+8=16` → post `3+163+6=172`.
- Calculator completion rate fell (33% → ~6%) with 77 abandonments: users start the
  calculator, get a price, then click through to Notino **or** drop the 4-step +
  Turnstile form before submitting.

## What the 2026-05-13 deploy changed (`9f02d26`)

Migrated to Cloudflare Workers + new contact forms (Turnstile) + replaced the
tracking layer. Side effects that produced the GA4 anomalies:

1. **Calculator shipped without a Turnstile token until 2026-06-02 (`7497421`).**
   The server fails closed, so every calculator submit returned `400` during
   2026-05-13 → 06-02. Now fixed.
2. **`calculator_option` push removed** by the tracking replacement → GA4 event went
   to 0 after May 11. (Restored — see below.)
3. **Abandonment split into two GA4 names**: the server Measurement-Protocol beacon
   sent `form_abandonment`, while the GTM tag relabelled the dataLayer event to
   `form_abandon`. (Unified — see below.)
4. New `booking_click` CTA diverts high-intent users to Notino's external booker.

## Fixes shipped

- **Restored `calculator_option`** on both calculators (HU `ingyenes-konzultacio`,
  EN `free-consultation`); the GTM tag `CE - calculator_option` was already live.
- **Server-side Meta CAPI `Lead`** wired into all three submit handlers
  (`primary_conversion` → Meta `Lead`), deduped with the browser `Meta Pixel - Lead`
  tag via the shared `event_id`. Previously CAPI only sent `Contact`.
- **Unified abandonment event name** in live GTM (container `GTM-W8V3BVGD`,
  **version 29 published**): the `GA4 Event - form_abandon` tag now emits
  `form_abandonment`, matching the server beacon. Repo GTM artifact synced.

## Confirmed healthy

- Server endpoint `/api/contact`: real submit returns `200`.
- Secrets present: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `GA4_API_SECRET`,
  `META_CAPI_ACCESS_TOKEN`, `GOOGLE_PRIVATE_KEY`.
- Client + GTM wiring correct: `contact_form_submit` → GTM `GA4 Event - contact_form`
  → `generate_lead`. All GA4 tags are consent-gated (`analytics_storage`, CookieYes).

## Open items (product / config — not code)

- **Mark `booking_click` as a GA4 key event** and check Notino's actual booking
  volume. If bookings rose, the "lost" form leads are not lost — they converted on
  Notino.
- **Missing optional secrets** `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`:
  the Sheets lead-mirror fails silently (email still sends). Set them if the Sheet
  log is wanted.
- **Email provider**: code uses **Resend**. If the business moved to Brevo, the
  `/api/contact` email path must be rewritten.
- **Calculator completion** (33% → 6%): consider reducing friction or rebalancing the
  Notino CTA vs. the lead form — a UX/business decision. Note: do NOT pre-render
  Turnstile earlier than step 4; the token expires (~300 s) and would 400 on submit.
- **Measurement gap check**: compare the count of `200` responses on `POST
  /api/contact` (Cloudflare Worker logs / Observability) against `generate_lead`
  count. A gap means successful submits are under-measured (navigation timing or
  denied consent), not lost.
