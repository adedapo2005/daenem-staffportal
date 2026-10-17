import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: fileURLToPath(new URL('./src/next-navigation-shim.ts', import.meta.url)) },
      { find: 'next/link', replacement: fileURLToPath(new URL('./src/next-link-shim.tsx', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src/qa-review-v115', import.meta.url)) },
    ],
  },
  server: {
    port: 4173,
  },
});

