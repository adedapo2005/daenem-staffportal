import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { stage1WorkspaceCalloutOverlay } from './scripts/lib/stage1-workspace-callout-overlay.mjs';
import { stage1PreproductionCopyOverlay } from './scripts/lib/stage1-preproduction-copy-overlay.mjs';
import { stage1ChartAccessibilityOverlay } from './scripts/lib/stage1-chart-accessibility-overlay.mjs';

export default defineConfig({
  plugins: [stage1PreproductionCopyOverlay(), stage1WorkspaceCalloutOverlay(), stage1ChartAccessibilityOverlay(), react(), cloudflare()],
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: fileURLToPath(new URL('./src/next-navigation-shim.ts', import.meta.url)) },
      { find: 'next/link', replacement: fileURLToPath(new URL('./src/next-link-shim.tsx', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115', import.meta.url)) },
    ],
  },
  server: {
    port: 4173,
  },
});

