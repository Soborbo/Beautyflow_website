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
    format: 'file',
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
