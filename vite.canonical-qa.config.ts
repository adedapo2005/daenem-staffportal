import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only canonical visual QA. The production Worker integration remains
// in vite.config.ts; this harness intentionally has no Cloudflare runtime.
export default defineConfig({
  plugins: [react()],
});
