import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/* A new build changes sw.js, which is how the browser learns that an update exists.
   The game's own script has a changing name, so the build tells sw.js what to keep offline. */
const stampServiceWorker = () => ({
  name: 'stamp-service-worker',
  closeBundle() {
    const file = resolve(__dirname, 'dist/sw.js');
    const assets = readdirSync(resolve(__dirname, 'dist/assets')).map(name => `assets/${name}`);
    writeFileSync(file, readFileSync(file, 'utf8')
      .replace('__BUILD__', String(Date.now()))
      .replace('__ASSETS__', assets.map(a => `'${a}'`).join(', ')));
  },
});

export default defineConfig({
  base: './',
  plugins: [stampServiceWorker()],
  test: { testTimeout: 120000 },
});
