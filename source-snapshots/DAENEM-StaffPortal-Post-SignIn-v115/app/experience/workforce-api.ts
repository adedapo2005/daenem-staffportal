import type { Company } from "./model";

const COMPANY_IDS: Partial<Record<Company, string>> = {
  printing: "company-printing",
  bakery: "company-bakery",
  autos: "company-autos",
  logistics: "company-logistics",
  properties: "company-properties",
};

export function workforceCompanyId(company: Company) {
  return COMPANY_IDS[company] || null;
}

export type WorkforceEmployee = {
  id: string;
  employeeNo?: string;
  displayName: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  status?: string;
};

export type AttendanceDay = {
  id: string;
  status: string;
  clockInAt?: string | null;
  clockOutAt?: string | null;
  workedMinutes?: number | null;
  lateMinutes?: number | null;
};

export type AttendanceToday = {
  companyId: string;
  workDate: string;
  day: AttendanceDay | null;
  policy: {
    locationId: string | null;
    locationName: string;
    radiusM: number;
    geofenceRequired: boolean;
    geofenceConfigured: boolean;
    clockInPhotoRequired: boolean;
    clockOutPhotoRequired: boolean;
    offlineAllowed: boolean;
  };
  rule: string;
};

export type PayrollRun = {
  id: string;
  runNo: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
  totalGrossKobo: number;
  totalDeductionsKobo: number;
  totalNetKobo: number;
  createdAt: string;
};

export type HrOverview = {
  companyId: string;
  employees: number;
  pendingLeave: number;
  openReviews: number;
  openCases: number;
  activeLifecycle: number;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const optionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";
const optionalNumber = (value: unknown) => value === undefined || value === null || typeof value === "number" && Number.isFinite(value);
const requiredString = (value: unknown) => typeof value === "string" && value.length > 0;
const boundedString = (value: unknown, maximum: number) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const nonNegativeInteger = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function isEmployeeDirectoryResponse(value: unknown): value is { employees: WorkforceEmployee[] } {
  if (!object(value) || !Array.isArray(value.employees) || value.employees.length > 500) return false;
  return value.employees.every((employee) => object(employee)
    && typeof employee.id === "string" && employee.id.length > 0
    && typeof employee.displayName === "string" && employee.displayName.length > 0
    && optionalString(employee.employeeNo)
    && optionalString(employee.email)
    && optionalString(employee.jobTitle)
    && optionalString(employee.department)
    && optionalString(employee.status));
}

function isAttendanceDay(value: unknown): value is AttendanceDay {
  return object(value)
    && typeof value.id === "string" && value.id.length > 0
    && typeof value.status === "string" && value.status.length > 0
    && optionalString(value.clockInAt)
    && optionalString(value.clockOutAt)
    && optionalNumber(value.workedMinutes)
    && optionalNumber(value.lateMinutes);
}

export function isAttendanceToday(value: unknown): value is AttendanceToday {
  if (!object(value) || typeof value.companyId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.workDate))) return false;
  if (value.day !== null && !isAttendanceDay(value.day)) return false;
  const policy = value.policy;
  return object(policy)
    && optionalString(policy.locationId)
    && typeof policy.locationName === "string"
    && typeof policy.radiusM === "number" && Number.isFinite(policy.radiusM)
    && typeof policy.geofenceRequired === "boolean"
    && typeof policy.geofenceConfigured === "boolean"
    && typeof policy.clockInPhotoRequired === "boolean"
    && typeof policy.clockOutPhotoRequired === "boolean"
    && typeof policy.offlineAllowed === "boolean"
    && typeof value.rule === "string";
}

export function isAttendanceClockResponse(value: unknown): value is { ok: true; day: AttendanceDay; message: string } {
  return object(value) && value.ok === true && isAttendanceDay(value.day) && typeof value.message === "string";
}

function isPayrollRun(value: unknown): value is PayrollRun {
  return object(value)
    && boundedString(value.id, 200)
    && boundedString(value.runNo, 120)
    && date(value.periodStart)
    && date(value.periodEnd)
    && date(value.payDate)
    && ["draft", "review", "approved", "processing", "paid", "cancelled"].includes(String(value.status))
    && nonNegativeInteger(value.totalGrossKobo)
    && nonNegativeInteger(value.totalDeductionsKobo)
    && nonNegativeInteger(value.totalNetKobo)
    && boundedString(value.createdAt, 80);
}

export function isPayrollRunsResponse(value: unknown): value is { runs: PayrollRun[] } {
  return object(value) && Array.isArray(value.runs) && value.runs.length <= 100 && value.runs.every(isPayrollRun);
}

export function isHrOverview(value: unknown): value is HrOverview {
  return object(value)
    && requiredString(value.companyId)
    && nonNegativeInteger(value.employees)
    && nonNegativeInteger(value.pendingLeave)
    && nonNegativeInteger(value.openReviews)
    && nonNegativeInteger(value.openCases)
    && nonNegativeInteger(value.activeLifecycle);
}
