export type PayrollStatementPresentation = {
  kind: "final" | "provisional";
  heading: "FINAL PAYSLIP" | "PROVISIONAL PAYROLL STATEMENT";
  archiveState: string;
  netAmountLabel: "Net Pay" | "Projected Net Pay";
  calloutTitle: string;
  calloutMessage: string;
  downloadTitle: string;
  canDownloadFinalPayslip: boolean;
};

const FINAL_PAYROLL_STATES = new Set(["paid", "settled"]);

export function payrollStatementTitle(title: string, status: string): string {
  return FINAL_PAYROLL_STATES.has(status.trim().toLowerCase())
    ? title
    : title.replace(/\bpayslip\b/gi, "payroll statement");
}

export function payrollStatementPresentation(
  status: string,
): PayrollStatementPresentation {
  const normalizedStatus = status.trim().toLowerCase();
  const final = FINAL_PAYROLL_STATES.has(normalizedStatus);

  if (final) {
    return {
      kind: "final",
      heading: "FINAL PAYSLIP",
      archiveState: `${status} · Final payslip`,
      netAmountLabel: "Net Pay",
      calloutTitle: "Final Payslip Available",
      calloutMessage:
        "This final payslip is available because Payroll marked the record Paid or Settled. It does not confirm when money reached your bank account.",
      downloadTitle: "FINAL-PAYSLIP",
      canDownloadFinalPayslip: true,
    };
  }

  return {
    kind: "provisional",
    heading: "PROVISIONAL PAYROLL STATEMENT",
    archiveState: `${status} · Pre-settlement`,
    netAmountLabel: "Projected Net Pay",
    calloutTitle: "Payment Not Confirmed",
    calloutMessage:
      "Payment is not yet confirmed. This is a payroll statement, not a final payslip.",
    downloadTitle: "PROVISIONAL-PAYROLL-STATEMENT",
    canDownloadFinalPayslip: false,
  };
}
