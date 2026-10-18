import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaces = await readFile(
  new URL("../app/experience/workspaces.tsx", import.meta.url),
  "utf8",
);
const statements = await readFile(
  new URL("../app/experience/payroll-statement-contract.ts", import.meta.url),
  "utf8",
);

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing section start: ${start}`);
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

const people = section(workspaces, "function People(", "function Calendar(");
const payroll = section(workspaces, "function Payroll()", "type HrOverviewState");
const hr = section(workspaces, "function HrOverview()", "function Payslips(");
const payslips = section(workspaces, "function Payslips(", "function Board(");

const checks = [
  ["people copy names employees without scope jargon", people.includes("employees available") && !/in your scope|authoritative scoped detail endpoints/i.test(people)],
  ["employee confidentiality copy is plain and explicit", people.includes("Full employee records and confidential HR details stay protected.")],
  ["payroll empty state avoids service architecture language", payroll.includes("No payroll runs are available for this business.") && !/authoritative payroll service/i.test(payroll)],
  ["payroll unavailable action gives a usable next step", payroll.includes("Use the approved payroll process") && !/mutation flow|concurrency|approval contract/i.test(payroll)],
  ["HR summary avoids backend terminology", hr.includes("Confidential employee records are not shown here.") && !/backend-authorized|preloaded into this surface/i.test(hr)],
  ["payslip copy removes fixture wording", payslips.includes("Approved deductions") && !/fixture deductions/i.test(payslips)],
  ["provisional statement plainly says payment is unconfirmed", statements.includes("Payment is not yet confirmed. This is a payroll statement, not a final payslip.")],
  ["final statement does not claim bank-arrival truth", statements.includes("It does not confirm when money reached your bank account.")],
  ["staff-facing statement copy avoids provider and demo jargon", !/provider-confirmed|live bank|demonstration|demo payslip/i.test(statements)],
];

for (const [name, pass] of checks) {
  assert.equal(pass, true, name);
  console.log(`PASS ${name}`);
}

console.log(`Workforce plain language: ${checks.length}/${checks.length} PASS`);
