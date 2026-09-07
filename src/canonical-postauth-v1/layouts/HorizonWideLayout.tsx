
import { CanonicalDashboard } from '../CanonicalDashboard';
import type { CanonicalDashboardProps } from '../canonical-types';

type Props = Omit<CanonicalDashboardProps, 'initialLayout'>;
export function HorizonWideLayout(props: Props) {
  return <CanonicalDashboard {...props} initialLayout="horizon-wide" />;
}
