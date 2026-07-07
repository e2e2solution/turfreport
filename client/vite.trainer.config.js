import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-trainer',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'trainer.html'),
    },
  },
});
