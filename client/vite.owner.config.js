import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/** Owner-only build for Android APK (Capacitor). */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-owner',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'owner.html'),
    },
  },
});
