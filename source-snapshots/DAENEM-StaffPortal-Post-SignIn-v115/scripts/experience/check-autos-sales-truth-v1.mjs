import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const model = read("app/experience/model.ts");
const workspaces = read("app/experience/workspaces.tsx");
const truth = read("app/experience/autos-sales-truth.ts");
const themes = read("app/experience/staffportal-import/theme-system.ts");
const review = read("app/review/viewports/page.tsx");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const autoLeadLine =
  model.split("\n").find((line) => line.includes("['auto-leads'")) || "";
const autoHistoryLine =
  model.split("\n").find((line) => line.includes("['auto-history'")) || "";
const autosSalesStart = workspaces.indexOf("function AutosSalesPipeline");
const autosSalesEnd = workspaces.indexOf("function Hub", autosSalesStart);
const autosSalesWorkspace = workspaces.slice(autosSalesStart, autosSalesEnd);

check(
  "Auto Leads uses review stages instead of asserting settlement or delivery",
  autoLeadLine.includes("Deposit Review|Sale Review|Delivery Review") &&
    !autoLeadLine.includes("|Deposit|Sale|Delivery"),
);
check(
  "Auto Leads fields distinguish recorded figures from confirmed payment",
  autoLeadLine.includes(
    "Recorded Deposit Request|Recorded Balance|Payment Confirmation",
  ) && !autoLeadLine.includes("|Deposit|Outstanding Balance"),
);
check(
  "Auto Leads is routed before generic record and mutable board surfaces",
  workspaces.indexOf('if (m.id === "auto-leads")') <
    workspaces.indexOf('if (kind === "records")') &&
    workspaces.indexOf('if (m.id === "auto-leads")') <
    workspaces.indexOf('if (["board", "recruitment"].includes(kind))'),
);
check(
  "Auto Leads uses the shared Record Workspace",
  autosSalesWorkspace.includes("<AdaptiveRecordWorkspace") &&
    !autosSalesWorkspace.includes("<WorkBoard"),
);
check(
  "Staff see plain payment confirmation truth",
  autosSalesWorkspace.includes("Recorded amounts are not confirmed payments") &&
    autosSalesWorkspace.includes("payment provider must confirm settlement") &&
    autosSalesWorkspace.includes('data-payment-confirmation="not-confirmed"') &&
    autosSalesWorkspace.includes('data-settlement-source="authoritative-provider-required"'),
);
check(
  "Legacy payment-looking fields are removed before presentation",
  truth.includes("Deposit: legacyDeposit") &&
    truth.includes('"Outstanding Balance": legacyBalance') &&
    truth.includes('"Payment Confirmation": "Not Confirmed"'),
);
check(
  "Legacy stages are presented as review states",
  truth.includes('Deposit: "Deposit Review"') &&
    truth.includes('Sale: "Sale Review"') &&
    truth.includes('Delivery: "Delivery Review"'),
);
check(
  "Default amount cannot be mistaken for received payment",
  truth.includes("amount: 0") &&
    truth.includes('{ label: "Payment Status", value: "Not Confirmed" }'),
);
check(
  "Historical Workshop records remain a read-only archive",
  autoHistoryLine.includes("Historical Workshop Records") &&
    autoHistoryLine.includes("Read-only Service Archive") &&
    workspaces.includes("Historical workshop archive · Read-only") &&
    autosSalesWorkspace.includes('data-workshop-state="historical-read-only"'),
);
check(
  "Workshop is absent from forward Autos theme language",
  !themes.includes("Auto dealership + workshop") &&
    !themes.includes("Inventory and workshop cards"),
);
check(
  "No editable Total paid or amountPaidNaira client field is present",
  !model.includes("Total paid") &&
    !workspaces.includes("Total paid") &&
    !model.includes("amountPaidNaira") &&
    !workspaces.includes("amountPaidNaira"),
);
check(
  "Logistics maintenance capability remains intact",
  model.includes("Fleet & Drivers") &&
    model.includes("Maintenance Due") &&
    workspaces.includes("function Logistics"),
);
check(
  "Rendered acceptance covers Autos sales truth across the closure matrix",
  review.includes('| "autos-sales"') &&
    review.includes('"autos-sales": "/auto-leads"') &&
    review.includes('config.target === "autos-sales"') &&
    review.includes('width < 768 ||') &&
    review.includes('const MATRIX_CAPTURE_TIMEOUT_MS = 45000') &&
    review.includes("AUTOS_SALES_TRUTH_ASSERTION_FAILED"),
);
check(
  "Rendered acceptance guards unauthorized Autos sales disclosure",
  review.includes("Auto Leads & Sales Record Workspace") &&
    review.includes("ZERO_DISCLOSURE_RECORD_LEAK"),
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
