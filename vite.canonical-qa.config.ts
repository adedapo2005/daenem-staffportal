import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { stage1WorkspaceCalloutOverlay } from './scripts/lib/stage1-workspace-callout-overlay.mjs';
import { stage1PreproductionCopyOverlay } from './scripts/lib/stage1-preproduction-copy-overlay.mjs';
import { stage1ChartAccessibilityOverlay } from './scripts/lib/stage1-chart-accessibility-overlay.mjs';

// Local-only canonical visual QA. The production Worker integration remains
// in vite.config.ts; this harness intentionally has no Cloudflare runtime.
export default defineConfig({
  plugins: [stage1PreproductionCopyOverlay(), stage1WorkspaceCalloutOverlay(), stage1ChartAccessibilityOverlay(), react()],
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: fileURLToPath(new URL('./src/next-navigation-shim.ts', import.meta.url)) },
      { find: 'next/link', replacement: fileURLToPath(new URL('./src/next-link-shim.tsx', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115', import.meta.url)) },
    ],
  },
});
