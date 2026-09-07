
import { CanonicalDashboard } from '../CanonicalDashboard';
import type { CanonicalDashboardProps } from '../canonical-types';

type Props = Omit<CanonicalDashboardProps, 'initialLayout'>;
export function BoardPulseLayout(props: Props) {
  return <CanonicalDashboard {...props} initialLayout="board-pulse" />;
}
