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
  // Canonical URL form = TRAILING SLASH. Google has long-standing equity on the
  // trailing-slash URLs (the pre-migration WordPress default), so we align every
  // signal — canonical, hreflang, sitemap, internal links — to `/foo/` and 301
  // the bare `/foo` to it via Cloudflare `html_handling: "force-trailing-slash"`.
  trailingSlash: 'always',
  build: {
    // Default 'directory' format: `dist/foo/index.html`. Do NOT switch to
    // 'file' format — it emits `dist/foo.html` alongside a `dist/foo/`
    // directory (e.g. `en.html` + `en/`). Directory format is the natural,
    // conflict-free pairing with `trailingSlash: 'always'` and Cloudflare's
    // `html_handling: "force-trailing-slash"` (serves `dist/foo/index.html`
    // at `/foo/`); 'file' format would collide and cause redirect loops.
    inlineStylesheets: 'always',
  },
  integrations: [
    sitemap({
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
    platformProxy: {
      enabled: true,
    },
  }),
  image: {
    domains: [],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
