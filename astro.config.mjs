// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import partytown from '@astrojs/partytown';

// https://astro.build/config
export default defineConfig({
  integrations: [
    partytown({
      config: {
        forward: ['dataLayer.push'],
      },
    }),
  ],
  output: 'server',
  build: {
    inlineStylesheets: 'auto', // Inline small CSS files for better performance
  },
  i18n: {
    defaultLocale: 'hu',
    locales: ['hu', 'en'],
    routing: {
      prefixDefaultLocale: false
    }
  },
  adapter: cloudflare({
    imageService: 'compile',
    routes: {
      strategy: 'include',
      include: ['/*'],
      exclude: ['/_astro/*', '/images/*', '/favicon.svg']
    }
  }),
  image: {
    // Enable image optimization
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        avif: { quality: 65 },
        webp: { quality: 75 },
        jpeg: { quality: 80 },
        png: { quality: 90 },
      }
    },
    // Domains that are allowed for remote images
    domains: [],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});