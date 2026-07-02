/// <reference path="../.astro/types.d.ts" />

/**
 * Cloudflare Worker environment — bindings, plaintext vars, and secrets.
 *
 * Astro 6 / @astrojs/cloudflare v13 removed `Astro.locals.runtime.env`; the
 * Worker env is now read from the `cloudflare:workers` virtual module. The
 * shape mirrors the `vars` + `assets` blocks in wrangler.jsonc plus the
 * dashboard secrets documented there. Consumers cast `env` to the precise
 * shape they need, so a permissive record keeps this declaration in one place.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
