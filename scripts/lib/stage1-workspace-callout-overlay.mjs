import { fileURLToPath } from 'node:url';

// Build-time import redirection only: never rewrite the approved V115 files.
const protectedWorkspace = fileURLToPath(new URL('../../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/workspaces.tsx', import.meta.url))
  .replaceAll('\\', '/').toLowerCase();
const stageOneCallout = fileURLToPath(new URL('../../src/stage1-safe-workspace-callout.tsx', import.meta.url));

export function stage1WorkspaceCalloutOverlay() {
  return {
    name: 'daenem-stage1-workspace-callout-semantic-overlay',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source !== './ui' || !importer) return null;
      const from = importer.split('?')[0].replaceAll('\\', '/').toLowerCase();
      return from === protectedWorkspace ? stageOneCallout : null;
    },
  };
}
