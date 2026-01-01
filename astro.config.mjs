// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
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
    // With imageService: 'compile', images are processed at build time
    // No need for sharp service - Cloudflare adapter handles it
    domains: [],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});