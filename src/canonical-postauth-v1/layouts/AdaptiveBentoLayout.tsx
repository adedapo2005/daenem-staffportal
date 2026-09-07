
import { CanonicalDashboard } from '../CanonicalDashboard';
import type { CanonicalDashboardProps } from '../canonical-types';

type Props = Omit<CanonicalDashboardProps, 'initialLayout'>;
export function AdaptiveBentoLayout(props: Props) {
  return <CanonicalDashboard {...props} initialLayout="adaptive-bento" />;
}
