import {byId,canAct,type Session} from './model';

export const BAKERY_FLOUR_CAPABILITY = 'bakery.flour_control' as const;

export interface BakeryFlourUsageEntry {
  batchId: string;
  quantity: number;
  unit: string;
}

/** The server permission-composes this field. Its absence is authoritative. */
export interface BakeryCombinedReport {
  generatedAt?: string;
  breadAccountability?: unknown[];
  returns?: unknown[];
  cashCollection?: unknown[];
  flourUsage?: BakeryFlourUsageEntry[];
}

const standardReportLabels = [
  'Bread Accountability',
  'Returns',
  'Cash Collection',
  'POS Charges',
  'Outstanding Debt',
  'Theft / Accountability Investigation',
  'Agent / Reseller Performance',
] as const;

export function canViewBakeryFlourUsage(session: Session) {
  const accountabilityModule = byId('bakery-accountability');
  return Boolean(
    accountabilityModule &&
      canAct(accountabilityModule, session, BAKERY_FLOUR_CAPABILITY),
  );
}

export function canExportBakeryFlourUsage(session: Session) {
  const accountabilityModule = byId('bakery-accountability');
  return Boolean(
    accountabilityModule &&
      canViewBakeryFlourUsage(session) &&
      canAct(accountabilityModule, session, 'export'),
  );
}

export function projectBakeryCombinedReport(
  report: BakeryCombinedReport | undefined,
  mayViewFlourUsage: boolean,
): BakeryCombinedReport | undefined {
  if (!report) return undefined;
  const {flourUsage, ...permissionSafeReport} = report;
  if (!mayViewFlourUsage || !Array.isArray(flourUsage)) {
    return permissionSafeReport;
  }
  return {...permissionSafeReport, flourUsage: [...flourUsage]};
}

export function bakeryFlourUsageRows(
  report: BakeryCombinedReport | undefined,
  mayViewFlourUsage: boolean,
) {
  if (!mayViewFlourUsage) return [];
  return Array.isArray(report?.flourUsage) ? report.flourUsage : [];
}

export function bakeryReportLabels(mayViewFlourUsage: boolean): string[] {
  return mayViewFlourUsage
    ? [...standardReportLabels, 'Flour Usage']
    : [...standardReportLabels];
}
