import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    // .mjs too: harnesses for the node-side .mjs tooling (server/*.mjs) live
    // outside the browser tsconfig on purpose — see the note in
    // tests/check-event-contract-script.test.mjs.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'],
  },
  define: {
    // gateway.ts: Astro public env for the Turnstile sitekey (fixed value in tests)
    'import.meta.env.PUBLIC_TURNSTILE_SITE_KEY': JSON.stringify('0xTESTSITEKEY'),
    // Market config — HU market default in the tests (proves the non-GBP behavior)
    'import.meta.env.PUBLIC_TRACKING_COUNTRY': JSON.stringify('HU'),
    'import.meta.env.PUBLIC_TRACKING_CURRENCY': JSON.stringify('HUF'),
    'import.meta.env.PUBLIC_TRACKING_LOCALE': JSON.stringify('hu'),
  },
});
