import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = await readFile(
  new URL("../app/experience/payroll-statement-contract.ts", import.meta.url),
  "utf8",
);
const workspaces = await readFile(
  new URL("../app/experience/workspaces.tsx", import.meta.url),
  "utf8",
);
const checks = [
  ["final states are narrowly allowlisted", contract.includes('new Set(["paid", "settled"])')],
  ["all other states are provisional", contract.includes('kind: "provisional"')],
  ["provisional statement does not claim final payment", contract.includes("Payment is not yet confirmed. This is a payroll statement, not a final payslip.")],
  ["final download is status-gated", workspaces.includes("statement.canDownloadFinalPayslip ?")],
  ["provisional amount is labelled projected", contract.includes('netAmountLabel: "Projected Net Pay"')],
  ["provisional record titles remove payslip language", contract.includes('title.replace(/\\bpayslip\\b/gi, "payroll statement")')],
  ["statement heading is status-composed", workspaces.includes("{statement.heading}")],
  ["archive state is status-composed", workspaces.includes("payrollStatementPresentation(r.status).archiveState")],
  ["pre-settlement records do not expose final-payslip downloads", workspaces.includes("Your final payslip will be available after Payroll confirms a Paid or Settled status.")],
];

for (const [name, pass] of checks) {
  assert.equal(pass, true, name);
  console.log(`PASS ${name}`);
}

console.log(`${checks.length}/${checks.length} payroll statement truth checks passed`);
