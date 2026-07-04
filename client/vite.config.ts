import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = 'http://localhost:4321';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': SERVER,
      '/files': SERVER,
      '/vendor': SERVER,
      '/preview.html': SERVER,
    },
  },
  test: {
    environment: 'jsdom',
  },
});
