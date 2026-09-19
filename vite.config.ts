import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    watch: { ignored: ['**/release/**', '**/test-results/**', '**/docs/screenshots/**'] },
  },
  build: { chunkSizeWarningLimit: 1100 },
});
