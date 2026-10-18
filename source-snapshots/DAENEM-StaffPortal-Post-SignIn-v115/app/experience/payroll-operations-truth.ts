export type PayrollOperationsTruth = {
  isSettled: boolean;
  presentationStatus: "Settlement Confirmed" | "Pre-Settlement";
  totalPayroll: number;
  settledPayroll: number;
  unsettledPayroll: number;
  employeeCount: number;
  settledEmployees: number;
  unsettledEmployees: number;
  failedEmployees: number;
  reversedEmployees: number;
};

const FINAL_SETTLEMENT_STATES = new Set(["paid", "settled"]);

function count(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function payrollOperationsTruth(
  status: string,
  fields: Record<string, string>,
): PayrollOperationsTruth {
  const totalPayroll = count(fields["Net Total"]);
  const employeeCount = count(fields["Employee Count"]);
  const reportedPending = count(fields["Pending Count"]);
  const failedEmployees = count(fields["Failed Count"]);
  const reversedEmployees = count(fields["Reversed Count"]);
  const reportedSuccessful = count(fields["Success Count"]);
  const isSettled =
    FINAL_SETTLEMENT_STATES.has(status.trim().toLowerCase()) &&
    employeeCount > 0 &&
    reportedSuccessful === employeeCount &&
    reportedPending === 0 &&
    failedEmployees === 0 &&
    reversedEmployees === 0;
  const settledEmployees = isSettled
    ? Math.min(employeeCount, reportedSuccessful)
    : 0;

  return {
    isSettled,
    presentationStatus: isSettled
      ? "Settlement Confirmed"
      : "Pre-Settlement",
    totalPayroll,
    settledPayroll: isSettled ? totalPayroll : 0,
    unsettledPayroll: isSettled ? 0 : totalPayroll,
    employeeCount,
    settledEmployees,
    unsettledEmployees: Math.max(0, employeeCount - settledEmployees),
    failedEmployees,
    reversedEmployees,
  };
}
