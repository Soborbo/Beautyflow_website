# Beautyflow Website — Full Code Audit

**Date:** 2026-06-10
**Scope:** all application code (`src/`, config, `public/`, `tracking/`), dependency health, build verification, type checking
**Method:** manual review of all API endpoints, forms, tracking library, pages/i18n/SEO layer; `astro build` (passes); `astro check` (27 type errors); `npm audit`

> **Remediation status (2026-06-10):** All findings below have been fixed in
> follow-up commits on this branch, except three deliberate deferrals:
> the Astro 6 / `@astrojs/cloudflare` 13 major upgrade (breaking; resolves the
> remaining `npm audit` advisories, which sit in dev-time tooling — undici via
> miniflare/wrangler — not the deployed Worker), a CSP header (needs a
> report-only rollout so it can't silently break GTM/Turnstile), and the
> KV-backed rate limiter (per-isolate limiter kept, now also on /api/contact).
>
> **Additional bug found during fix verification:** every 301/410 rule in
> `src/middleware.ts` was dead code — with a prerendered 404 page, Astro
> serves unmatched URLs via `prerenderedErrorPageFetch` without running
> middleware, so `/fanni`, `/wp-admin/*`, the gone-URL list etc. all returned
> 404 instead of redirecting/410ing. Fixed with an SSR catch-all route
> (`src/pages/[...slug].astro`) that routes unmatched URLs through the normal
> pipeline; this also makes unknown URLs return a real 404 status. Verified
> end-to-end under `wrangler dev`.

---

## Executive summary

The codebase is in good shape overall: a clean Astro 5 + Cloudflare Workers setup with thoughtful security work already in place (PII hashing for Meta CAPI, consent gating, honeypot + time-gate + Turnstile, origin allowlists, Sheets formula-injection protection, escaped email templates). The build is green and the sitemap/hreflang/i18n architecture is solid.

The audit found **no critical vulnerabilities**, but **2 high-severity issues** (a real functional bug in conversion tracking, and server error details leaking to clients), several medium issues, and 2 high-severity dependency advisories.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 (+2 dependency advisories) |
| Medium | 8 |
| Low / Info | 9 |

---

## High severity

### H1. `trackEvent()` silently ignores `eventCallback` / `eventTimeout` — conversion tags can be cut off
- `src/lib/tracking/tracking.ts:77` — signature is `trackEvent(name, params)` (2 params).
- Called with a **third options argument** in 3 places:
  - `src/components/ContactForm.astro:278`
  - `src/pages/ingyenes-konzultacio.astro:832`
  - `src/pages/en/free-consultation.astro:828`
- `{ eventCallback: goThankYou, eventTimeout: 1200 }` is silently discarded, so the "navigate once GTM has fired the tags" logic never runs. Navigation to the thank-you page always happens via the hard `setTimeout(goThankYou, 1500)` fallback. On slow networks/GTM, the redirect can interrupt GA4 / Google Ads / Meta Pixel conversion beacons → **lost conversions**.
- The `TrackEventOptions` interface (tracking.ts:34–44) is defined but never wired up.
- **Fix:** implement the options parameter (push `eventCallback`/`eventTimeout` into the dataLayer event so GTM invokes it), or remove the dead interface and the misleading call sites/comments.
- This is also a TypeScript error (`ts(2554)`) — it ships only because nothing runs `astro check` (see M4).

### H2. Raw server error messages returned to clients
- `src/pages/api/contact.ts:748`: `return jsonError(500, \`Hiba történt: ${message}\`)` where `message` is `err.message`.
- Internal helpers throw rich errors (`getGoogleAccessToken`, `getSheetGid`, `writeToGoogleSheet` include Google API response bodies), so a failure can leak internal service details to the browser.
- **Fix:** keep `reportServerError()` (already in place) and return a generic message to the client.

### Dependency advisories (high)
`npm audit` (production deps): **7 vulnerabilities (2 high, 5 moderate)**:
- **devalue** ≤5.8.0 — DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p). Fixable with plain `npm audit fix` (non-breaking).
- **undici** (via `@astrojs/cloudflare`'s bundled wrangler/miniflare) — multiple advisories incl. request smuggling. Fix requires `@astrojs/cloudflare` v13 (breaking; pairs with Astro 6).
- **astro** ≤6.1.9 — moderate XSS in `define:vars` (GHSA-j687-52p2-xcff) and server-island replay. The site does not appear to use `define:vars` with user input, so practical exposure is low; resolved by the Astro 6 upgrade.
- **ws**, **@astrojs/cloudflare** SSRF advisory (image-binding-transform; `imageService: 'compile'` is used here, lowering exposure) — also resolved by the v13 bump.

**Recommendation:** run `npm audit fix` now (devalue); plan an Astro 6 / @astrojs/cloudflare 13 upgrade.

---

## Medium severity

### M1. Turnstile fails open when secret is missing
- `src/pages/api/contact.ts:590–610`: if `TURNSTILE_SECRET_KEY` is unset, submissions are **accepted without verification** (an error report is logged). A misconfigured deploy silently disables bot protection on an endpoint that sends email and writes to Sheets.
- **Fix:** fail closed in production (reject with 503), or at minimum gate fail-open behind a dev flag.

### M2. No security headers
- `src/middleware.ts` only handles redirects/410s. No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS anywhere.
- **Fix:** add a header-setting middleware. CSP needs allowances for GTM/GA4/Meta/Turnstile; start with `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.

### M3. No server-side max-length validation on contact form fields
- `src/pages/api/contact.ts:625–639` validates presence/format and min length, but not max length (`firstName`, `lastName`, `phone`, `email`, `message`, `locationLabel`). The client `maxlength` attributes are trivially bypassed; oversized payloads flow into email bodies and the Sheets API.
- **Fix:** cap each field server-side (e.g. name 100, phone 32, email 320, message 2000, locationLabel 50) and cap total JSON body size.

### M4. No type checking in the toolchain — 27 real `astro check` errors
- `@astrojs/check`/`typescript` are not devDependencies, and no script or CI runs a type check (there is no CI at all — no `.github/`). Running it surfaces 27 errors, including the H1 bug, plus:
  - `src/pages/en/hydrabeauty.astro:614` — `style` prop passed to `ContentImage`, which doesn't accept it → the `min-height: 350px` is **silently dropped** (visual regression vs the HU page, which may have the same issue pattern).
  - `src/pages/arak.astro:838–843` & `en/prices.astro` — `Element` vs `HTMLElement` casts; `tudastar`/`knowledge-base` article scripts — unguarded nulls (runtime-safe today, fragile).
  - `src/pages/api/contact.ts:415` — `bytes.buffer` typed as `ArrayBufferLike` in `crypto.subtle.importKey`.
- **Fix:** add `@astrojs/check` + `typescript` as devDependencies, a `"check": "astro check"` script, run it in deploy (`predeploy`) and/or set up CI.

### M5. `form_abandonment` double-counted in GA4
- `src/lib/tracking/form-tracking.ts:69–91`: `reportAbandonment()` sends the event via **both** `navigator.sendBeacon()` → `/api/track/abandonment` → GA4 Measurement Protocol **and** `trackEvent()` → dataLayer → GA4, with no shared `event_id` for dedup. When both paths succeed, GA4 records the abandonment twice.
- **Fix:** generate one `event_id`, include it in both the beacon payload and the dataLayer push, or use the beacon only on `pagehide`.

### M6. Noindex pages included in the sitemap
- `dist/sitemap-0.xml` contains `/koszonjuk`, `/aszf`, `/adatvedelmi-tajekoztato`, `/en/thank-you`, `/en/terms-and-conditions`, `/en/privacy-policy` — all of which render `<meta name="robots" content="noindex, nofollow">`. Search Console will report "Submitted URL marked 'noindex'".
- **Fix:** add a `filter` to the sitemap integration in `astro.config.mjs` excluding these routes.
- Side note: `noindex, nofollow` on the privacy policy and ToS is itself unusual — most sites keep legal pages indexable; consider whether that was intentional.

### M7. EN knowledge-base index page missing
- HU has `/tudastar` (index + article); EN has only the article (`/en/knowledge-base/diode-laser-hair-removal-…`) with **no `/en/knowledge-base` index**, so the EN article has no browsable parent and the HU index has no hreflang pair.
- **Fix:** create `src/pages/en/knowledge-base/index.astro` and add the route mapping in `src/i18n/utils.ts`.

### M8. Missing custom meta descriptions on key pages
- `src/pages/index.astro`, `arak.astro`, `ingyenes-konzultacio.astro` fall back to the site-wide default description — these are the highest-value pages for SERP CTR.

---

## Low severity / informational

1. **In-memory rate limiter is per-isolate** (`src/lib/tracking/server.ts:200–237`) — acknowledged in code comments. Distributed traffic across isolates bypasses the global limit. Consider Cloudflare KV or the native Rate Limiting binding later. Note also `/api/contact` has **no** rate limit (relies on Turnstile alone).
2. **CAPI consent state is client-reported** (`src/pages/api/meta/capi.ts:109`) — the server re-checks consent but trusts the client's claim. Inherent to the architecture; origin allowlist + rate limit mitigate. Acceptable, worth documenting.
3. **`META_CAPI_TEST_EVENT_CODE`** — confirm it is not set in production (wrangler.jsonc comments already warn about this).
4. **Visiting `/404` directly returns HTTP 200.** Genuine misses are handled correctly by Cloudflare's `not_found_handling: "404-page"`; this only affects the literal `/404` URL. Cosmetic.
5. **`Math.random()` fallback for GA4 client_id** (`server.ts:413–421`) — fine for its purpose.
6. **Silent failure paths**: BroadcastChannel creation (`conversion-state.ts:71–84`), localStorage writes (`tracking.ts:193–207`), and `TrackingBoot.astro` boot import have no dev-mode logging/error boundary. Add debug logging.
7. **Global/abandonment listeners are never removed** (`global-listeners.ts`, `form-tracking.ts:100–108`) — safe in the current hard-navigation MPA, will leak/double-fire if View Transitions are ever enabled. The assumption is documented in comments; keep it in mind.
8. **`hashEmail()` reused to hash phone numbers** (`server.ts:354`) — correct behavior, misleading name; rename to `sha256Lower()` or similar.
9. **Empty `alt=""` on ~17 background/overlay images** across treatment pages — acceptable if decorative (they appear to be), but verify none convey content.

---

## What's done well

- **PII handling for Meta CAPI**: SHA-256 hashing of email/phone (E.164-normalized) before sending; PII kept out of `window.dataLayer` via a DOM side-channel with 24h TTL and post-conversion cleanup.
- **Consent**: default-deny consent gating on both client (`hasFullAdsConsent`) and server (`metaCapiConsentAllowed`), GTM Consent Mode v2.
- **Form anti-abuse**: honeypot field + 3-second time gate + Turnstile with `remoteip`; Turnstile reset on failed retry.
- **Injection defenses**: `escapeHtml()` consistently applied in Resend email templates; Sheets writes use `stringValue` (formula-injection safe); no `set:html` with user input anywhere.
- **API hygiene**: strict origin allowlists on `/api/meta/capi` and `/api/track/abandonment`; structured error reporting with fingerprinting (`lib/errors/codes.ts`).
- **SEO/i18n**: complete HU↔EN route mapping (only gap: KB index), correct hreflang + canonical generation, og:locale pairs, robots.txt with AI-bot blocks and sitemap reference, sitemap generates correctly (41 URLs, both locales).
- **Secrets**: nothing sensitive committed; `.dev.vars` gitignored; only public IDs (GTM/pixel/site keys) in `wrangler.jsonc` vars.
- **Build**: `astro build` completes cleanly; image pipeline and font preloading are sensibly configured.

---

## Recommended action order

1. Fix `trackEvent` options handling (H1) — directly affects ad-spend attribution.
2. Stop returning `err.message` to clients in `/api/contact` (H2).
3. `npm audit fix` for devalue; schedule the Astro 6 / cloudflare-adapter 13 upgrade.
4. Make Turnstile fail closed in production (M1).
5. Add `astro check` to devDependencies + deploy script; burn down the 27 type errors (M4) — this would have caught H1.
6. Add security headers middleware (M2) and server-side max-length validation (M3).
7. Dedup `form_abandonment` with a shared `event_id` (M5).
8. Sitemap noindex filter (M6), EN knowledge-base index (M7), meta descriptions (M8).
