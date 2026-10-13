import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// A site (src/) tiszta moduljainak tesztjei. A tracking-kit saját configgal fut
// (`npm run test:tracking`); ez a fájl csak a gyökérből indított `vitest run`-t
// (`npm run test:src`) konfigurálja. Új csomag nélkül: a vitest és a jsdom már
// gyökér-devDependency.
export default defineConfig({
  resolve: {
    alias: {
      '@tracking': fileURLToPath(new URL('./tracking-kit', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
