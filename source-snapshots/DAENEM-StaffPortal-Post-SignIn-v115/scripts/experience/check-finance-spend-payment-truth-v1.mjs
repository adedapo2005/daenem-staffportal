import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../app/experience/domain-intelligence.tsx", import.meta.url),
  "utf8",
);
const financeStart = source.indexOf("export function FinancialDesk(");
const financeEnd = source.indexOf("export function BakeryDesk(", financeStart);
const finance = source.slice(financeStart, financeEnd);
const normalizedFinance = finance.replace(/\s+/g, " ");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check(
  "Rendered financial workspace exists",
  financeStart >= 0 && financeEnd > financeStart,
);
check(
  "Spend uses a dedicated payment and reconciliation panel",
  finance.includes("const spend = m.id === \"spend\"") &&
    finance.includes("{spend ? (") &&
    finance.includes('title="Payment & reconciliation"') &&
    finance.includes('kicker="RECORDED SPEND"'),
);
check(
  "Recorded spend never claims confirmed payment",
  finance.includes("Recorded spend is not confirmed payment") &&
    normalizedFinance.includes(
      "does not confirm that money left a bank account",
    ),
);
check(
  "Payment truth is deferred to the payment record",
  normalizedFinance.includes(
    "Payment, refund, reversal and reconciliation details appear only when they are supplied by the payment record",
  ),
);
check(
  "Spend review reports payment confirmation as unavailable",
  finance.includes("Payment confirmation") &&
    finance.includes("Not available in this review"),
);
check(
  "Spend receives no illustrative cash-settlement bridge",
  !finance.includes("Illustrative cash context") &&
    !finance.includes("Opening balance") &&
    !finance.includes("Closing balance"),
);
check(
  "Non-Spend financial views keep their source-accountability panel",
  finance.includes('journal ? "Posting control" : "How these figures were calculated"') &&
    finance.includes("{spend ? (") &&
    finance.includes(") : ("),
);
check(
  "Company tiles remain permission-composed before rendering",
  finance.includes("fieldAccess(") &&
    finance.includes('session) !== "hidden"') &&
    finance.includes("rows={visible}"),
);
check(
  "No client payment or settlement action was invented",
  !finance.includes("Mark as paid") &&
    !finance.includes("Record as paid") &&
    !finance.includes("Confirm payment") &&
    !finance.includes("window.prompt") &&
    !finance.includes("window.confirm"),
);

console.log(
  JSON.stringify(
    {
      total: checks.length,
      passed: checks.filter((item) => item.pass).length,
      checks,
    },
    null,
    2,
  ),
);
