import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const sourcePath = new URL("../app/experience/payroll-operations-truth.ts", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contractModule = { exports: {} };
new Function("module", "exports", compiled)(contractModule, contractModule.exports);
const { payrollOperationsTruth } = contractModule.exports;

const fields = {
  "Net Total": "14320000",
  "Employee Count": "42",
  "Success Count": "41",
  "Pending Count": "1",
  "Failed Count": "0",
  "Reversed Count": "0",
};

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

for (const status of ["Approved", "Processing", "Submitted", "Awaiting Confirmation"]) {
  check(`${status} remains pre-settlement`, () => {
    const truth = payrollOperationsTruth(status, fields);
    assert.equal(truth.isSettled, false);
    assert.equal(truth.settledPayroll, 0);
    assert.equal(truth.settledEmployees, 0);
    assert.equal(truth.unsettledPayroll, 14320000);
    assert.equal(truth.unsettledEmployees, 42);
  });
}

for (const status of ["Paid", "Settled"]) {
  check(`${status} may present final settlement`, () => {
    const truth = payrollOperationsTruth(status, {
      ...fields,
      "Success Count": "42",
      "Pending Count": "0",
    });
    assert.equal(truth.isSettled, true);
    assert.equal(truth.settledPayroll, 14320000);
    assert.equal(truth.settledEmployees, 42);
    assert.equal(truth.unsettledPayroll, 0);
    assert.equal(truth.unsettledEmployees, 0);
  });
}

check("inconsistent final state fails closed", () => {
  const truth = payrollOperationsTruth("Paid", fields);
  assert.equal(truth.isSettled, false);
  assert.equal(truth.settledPayroll, 0);
  assert.equal(truth.settledEmployees, 0);
  assert.equal(truth.unsettledEmployees, 42);
});

check("invalid and negative values fail closed", () => {
  const truth = payrollOperationsTruth("Processing", {
    "Net Total": "not-a-number",
    "Employee Count": "-4",
    "Success Count": "99",
  });
  assert.equal(truth.totalPayroll, 0);
  assert.equal(truth.employeeCount, 0);
  assert.equal(truth.settledEmployees, 0);
  assert.equal(truth.unsettledEmployees, 0);
});

const workspaceSource = readFileSync(
  new URL("../app/experience/enterprise-operations.tsx", import.meta.url),
  "utf8",
);
check("payroll operations suppress fabricated employee settlement details", () => {
  assert.match(workspaceSource, /Authoritative Employee Outcomes Unavailable/);
  assert.doesNotMatch(workspaceSource, /Total salaries paid/);
  assert.doesNotMatch(workspaceSource, /PAY-FIX-010[345]/);
  assert.doesNotMatch(workspaceSource, /Neutral Bank ·/);
});

console.log(`Payroll operations truth: ${checks.length}/${checks.length} PASS`);
