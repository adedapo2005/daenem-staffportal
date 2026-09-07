
import { CanonicalDashboard } from '../CanonicalDashboard';
import type { CanonicalDashboardProps } from '../canonical-types';

type Props = Omit<CanonicalDashboardProps, 'initialLayout'>;
export function MasterDetailWorkspaceLayout(props: Props) {
  return <CanonicalDashboard {...props} initialLayout="master-detail-workspace" />;
}
