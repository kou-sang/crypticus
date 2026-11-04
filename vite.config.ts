import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    include: ['shared/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
