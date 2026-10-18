import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../app/experience/domain-intelligence.tsx", import.meta.url),
  "utf8",
);
const financeStart = source.indexOf("export function FinancialDesk(");
const financeEnd = source.indexOf("export function BakeryDesk(", financeStart);
const finance = source.slice(financeStart, financeEnd);
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check(
  "Financial workspace exists",
  financeStart >= 0 && financeEnd > financeStart,
);
check(
  "Currency badge explains the visible record scope plainly",
  finance.includes("NGN · records you can view") &&
    !finance.includes("authorized source records"),
);
check(
  "Chart instruction uses ordinary review language",
  finance.includes('kicker="SELECT A GROUP TO REVIEW"') &&
    !finance.includes('kicker="SELECT A GROUP TO INSPECT"'),
);
check(
  "Non-journal calculation context has a plain heading",
  finance.includes("How these figures were calculated") &&
    !finance.includes("Source accountability"),
);
check(
  "Record count is labelled without engineering terminology",
  finance.includes('"records used"') &&
    !finance.includes('"source records"'),
);
check(
  "Permission-composed figures are explained in workplace English",
  finance.includes("Figures use only records you can view"),
);
check(
  "Missing financial context is not estimated",
  finance.includes(
    "If an opening balance or forecast is not available, it is not shown or estimated.",
  ),
);
check(
  "Records table title is clear",
  finance.includes('title={m.title + " records used"}') &&
    !finance.includes('title={m.title + " source register"}'),
);
check(
  "Company and field scope remains permission-composed before rendering",
  finance.includes("fieldAccess(") &&
    finance.includes('session) !== "hidden"') &&
    finance.includes("rows={visible}"),
);
check(
  "No payment or settlement action was added",
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
