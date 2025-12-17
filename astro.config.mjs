// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile'
  }),
  image: {
    // Enable image optimization
    service: {
      entrypoint: 'astro/assets/services/sharp'
    },
    // Default quality for optimized images
    quality: 80,
    // Domains that are allowed for remote images
    domains: [],
  },
  vite: {
    plugins: [tailwindcss()]
  }
});