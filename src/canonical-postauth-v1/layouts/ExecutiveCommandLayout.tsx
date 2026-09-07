
import { CanonicalDashboard } from '../CanonicalDashboard';
import type { CanonicalDashboardProps } from '../canonical-types';

type Props = Omit<CanonicalDashboardProps, 'initialLayout'>;
export function ExecutiveCommandLayout(props: Props) {
  return <CanonicalDashboard {...props} initialLayout="executive-command" />;
}
