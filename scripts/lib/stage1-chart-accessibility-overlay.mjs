import { fileURLToPath } from 'node:url';

const protectedAnalytics = fileURLToPath(new URL('../../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/analytics.tsx', import.meta.url))
  .replaceAll('\\', '/').toLowerCase();

const pieDataLine = '                data={visible}';
const pieKeyLine = '                dataKey="value"';

export function stage1ChartAccessibilityOverlay() {
  return {
    name: 'daenem-stage1-chart-accessibility-overlay',
    enforce: 'pre',
    transform(source, id) {
      const from = id.split('?')[0].replaceAll('\\', '/').toLowerCase();
      if (from !== protectedAnalytics) return null;

      const newline = source.includes('\r\n') ? '\r\n' : '\n';
      const anchor = `${pieDataLine}${newline}${pieKeyLine}`;
      const first = source.indexOf(anchor);
      const second = first < 0 ? -1 : source.indexOf(anchor, first + anchor.length);
      if (first < 0 || second >= 0) {
        throw new Error('Stage One chart accessibility overlay expected one protected Pie data anchor.');
      }

      return source.replace(
        anchor,
        `${pieDataLine}${newline}                rootTabIndex={-1}${newline}${pieKeyLine}`,
      );
    },
  };
}
