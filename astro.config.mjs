// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import critters from 'astro-critters';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [
    critters({
      Critters: {
        // Inline critical CSS, move rest to body (non-blocking)
        preload: 'body', // Move CSS to end of body (non-blocking)
        inlineFonts: false, // Don't inline fonts (we use preload instead)
        preloadFonts: false, // Don't preload fonts (we handle it manually)
        pruneSource: true, // Remove inlined CSS from external stylesheets
      }
    })
  ],
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