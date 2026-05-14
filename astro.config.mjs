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
