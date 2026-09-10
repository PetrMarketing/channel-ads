import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, copyFileSync } from 'node:fs';

// Serve API docs from our own domain; clients must not depend on a third-party CDN.
const swaggerAssets = {
  name: 'swagger-local-assets',
  closeBundle() {
    const output = new URL('./dist/swagger-ui/', import.meta.url);
    mkdirSync(output, { recursive: true });
    for (const file of ['swagger-ui-bundle.js', 'swagger-ui.css', 'LICENSE']) {
      copyFileSync(new URL(`./node_modules/swagger-ui-dist/${file}`, import.meta.url), new URL(file, output));
    }
  },
};

export default defineConfig({
  plugins: [react(), swaggerAssets],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/webhook': 'http://localhost:8000',
      '/lp': 'http://localhost:8000',
      '/go': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
