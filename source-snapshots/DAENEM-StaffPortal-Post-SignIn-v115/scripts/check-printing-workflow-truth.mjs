import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contract, model, fixtures, workspace, matrix] = await Promise.all([
  readFile(new URL("../app/experience/printing-workflow-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/model.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/enterprise-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/printing-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/review/viewports/page.tsx", import.meta.url), "utf8"),
]);

const lifecycle = [
  "Enquiry",
  "Quote",
  "Customer Approval",
  "Invoice",
  "Customer Payment",
  "Payment Confirmed",
  "Production",
  "QC",
  "Ready/Delivered",
  "Reconciliation",
  "Complete",
];

const checks = [
  ["approved lifecycle is defined once and in order", lifecycle.every((stage, index) => contract.indexOf(`\"${stage}\"`) > (index ? contract.indexOf(`\"${lifecycle[index - 1]}\"`) : -1))],
  ["printing module consumes the shared lifecycle authority", model.includes("printingLifecycle.join('|')")],
  ["legacy invoice-after-delivery lifecycle is removed", !model.includes("Delivery|Invoice|Payment|Complete")],
  ["fixtures stop before any invented payment confirmation", fixtures.includes("status:'Customer Approval'") && fixtures.includes("status:'Quote'") && fixtures.includes("status:'Invoice'") && !/printing:\[[\s\S]*?status:'Payment Confirmed'/.test(fixtures)],
  ["board groups lifecycle stages instead of record index", workspace.includes("printingLaneForStatus(row.status) === laneIndex")],
  ["payment authority is explicitly unavailable", workspace.includes('data-payment-confirmation="unavailable"') && contract.includes("Authoritative payment source not connected")],
  ["reconciliation authority is explicitly unavailable", workspace.includes('data-reconciliation="unavailable"') && contract.includes("Authoritative reconciliation source not connected")],
  ["production payment gate is not claimed", workspace.includes('data-production-gate="not-claimed"')],
  ["editable amounts cannot confirm payment", contract.includes("does not confirm customer payment") && contract.includes("from an editable amount")],
  ["lifecycle presentation warns that listed stages are not proof", workspace.includes("It does not prove that") && workspace.includes("payment, production release, delivery or reconciliation has happened.")],
  ["printing surface has an exact owner-private matrix target", matrix.includes('"printing-production"') && matrix.includes('"/printing"')],
  ["printing capture waits for the truthful workspace root", matrix.includes("printingSurface && printingAuthorized") && matrix.includes("root?.dataset.printingWorkflow === \"authoritative-source-required\"")],
  ["printing matrix checks payment and reconciliation truth markers", matrix.includes("PRINTING_TRUTH_ASSERTION_FAILED") && matrix.includes('data-printing-workflow="authoritative-source-required"')],
];

for (const [name, pass] of checks) {
  assert.equal(pass, true, name);
  console.log(`PASS ${name}`);
}

console.log(`${checks.length}/${checks.length} printing workflow truth checks passed`);
