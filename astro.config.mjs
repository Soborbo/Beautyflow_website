// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import critters from 'astro-critters';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://beautyflow.pro',
  output: 'server',
  trailingSlash: 'never',
  build: {
    // Default 'directory' format: `dist/foo/index.html`. Do NOT switch to
    // 'file' format — it emits `dist/foo.html` alongside a `dist/foo/`
    // directory (e.g. `en.html` + `en/`), which collides with Cloudflare's
    // `html_handling: "drop-trailing-slash"` and causes an infinite redirect
    // loop. Directory format is the standard, conflict-free pairing.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
      // Pages rendered with `noindex` must not be submitted in the
      // sitemap — Search Console flags the contradiction. Keep in sync
      // with the pages that pass `noindex={true}` to Layout.
      filter: (page) => {
        const noindexPaths = new Set([
          '/koszonjuk',
          '/aszf',
          '/adatvedelmi-tajekoztato',
          '/en/thank-you',
          '/en/terms-and-conditions',
          '/en/privacy-policy',
        ]);
        const path = new URL(page).pathname.replace(/\/+$/, '');
        return !noindexPaths.has(path);
      },
      i18n: {
        defaultLocale: 'hu',
        locales: {
          hu: 'hu',
          en: 'en',
        },
      },
    }),
    critters({
      Critters: {
        preload: 'media',
        inlineFonts: false,
        preloadFonts: false,
        pruneSource: true,
        mergeStylesheets: false,
      }
    })
  ],
  i18n: {
    defaultLocale: 'hu',
    locales: ['hu', 'en'],
    routing: {
      prefixDefaultLocale: false
    }
  },
  adapter: cloudflare({
    imageService: 'compile',
  }),
  image: {
    domains: [],
  },
  vite: {
    // @tailwindcss/vite ships against a different vite version than the
    // one bundled with Astro, so the Plugin types don't unify — runtime
    // is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())]
  }
});
