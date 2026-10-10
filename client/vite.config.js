import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the Vite server proxies API + WebSocket traffic to the Node server.
const target = 'http://localhost:3000';
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': target,
      '/uploads': target,
      '/socket.io': { target, ws: true }
    }
  }
});
