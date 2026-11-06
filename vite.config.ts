import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

const APP_VERSION = process.env.npm_package_version ?? 'dev';
// Identificador único de cada build: el cliente lo compara con /version.json para detectar despliegues nuevos.
const APP_BUILD = `${APP_VERSION}+${Date.now().toString(36)}`;

function emitVersion(): Plugin {
  return {
    name: 'crypticus-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION, build: APP_BUILD }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersion()],
  // Versión visible en Ajustes: permite comprobar qué build está desplegado.
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __APP_BUILD__: JSON.stringify(APP_BUILD) },
  server: {
    // En desarrollo, /api (HTTP y WebSocket) va a `wrangler dev`.
    proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Firebase en su propio chunk: se cachea entre despliegues.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
  },
});
