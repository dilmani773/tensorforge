import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at /app/ on the shared domain (Caddy routes /app/* to this build, everything else to the API).
// Must match the Caddyfile's handle_path /app/* block.
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
