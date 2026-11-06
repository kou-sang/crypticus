import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Versión visible en Ajustes: permite comprobar qué build está desplegado.
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
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
