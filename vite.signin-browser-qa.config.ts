import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated render of the actual approved Sign-In and Create Account source.
// No production Worker, live database, post-login mutation or credential use.
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  optimizeDeps: {
    entries: ['qa/signin/index.html'],
    include: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'lucide-react'],
  },
});
