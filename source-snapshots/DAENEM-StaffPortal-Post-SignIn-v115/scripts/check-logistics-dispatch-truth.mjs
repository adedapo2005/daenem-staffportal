import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contract, model, rules, workspace, matrix] = await Promise.all([
  readFile(new URL("../app/experience/logistics-workflow-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/model.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/enterprise-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/logistics-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/review/viewports/page.tsx", import.meta.url), "utf8"),
]);

const lifecycle = [
  "Booked",
  "Assigned",
  "In Transit",
  "POD Required",
  "Delivered",
  "Closed",
];

const checks = [
  ["approved lifecycle is defined once and in order", lifecycle.every((stage, index) => contract.indexOf(`\"${stage}\"`) > (index ? contract.indexOf(`\"${lifecycle[index - 1]}\"`) : -1))],
  ["logistics module consumes the shared lifecycle authority", model.includes("logisticsLifecycle.join('|')")],
  ["proof of delivery remains the close-out business rule", rules.includes("A trip cannot be delivered or closed without POD evidence.") && model.includes("Proof of delivery is required before closing the trip.")],
  ["fixture statuses stop before invented delivery or close-out", workspace.includes('["pod required", "assigned", "in transit"]') === false && model.includes("Math.floor(m.stages.length / 2)")],
  ["board groups records by recorded status", workspace.includes("logisticsLaneForStatus(row.status) === laneIndex")],
  ["live tracking is explicitly unavailable", workspace.includes('data-live-tracking="unavailable"') && contract.includes("Live GPS not connected")],
  ["location state is never claimed", workspace.includes('data-location-state="not-claimed"') && contract.includes("does not invent live GPS")],
  ["delivery confirmation remains evidence-gated", workspace.includes('data-delivery-confirmation="unavailable"') && contract.includes("Proof of delivery required")],
  ["collections and reconciliation remain unavailable", workspace.includes('data-reconciliation="unavailable"') && contract.includes("Collections and reconciliation source not connected")],
  ["lifecycle presentation says listed stages are not proof", workspace.includes("It does not prove live") && workspace.includes("delivery, collected funds or reconciliation.")],
  ["logistics surface has an exact owner-private matrix target", matrix.includes('"logistics-dispatch"') && matrix.includes('"/logistics"')],
  ["logistics capture waits for the truthful workspace root", matrix.includes("logisticsSurface && logisticsAuthorized") && matrix.includes('root?.dataset.logisticsWorkflow ===')],
  ["matrix checks tracking, delivery and reconciliation truth markers", matrix.includes("LOGISTICS_TRUTH_ASSERTION_FAILED") && matrix.includes('data-logistics-workflow="authoritative-evidence-required"')],
  ["unauthorized matrix checks Zero Disclosure before render", matrix.includes("ZERO_DISCLOSURE_LOGISTICS_LEAK") && matrix.includes("protectedLogisticsTerms")],
];

for (const [name, pass] of checks) {
  assert.equal(pass, true, name);
  console.log(`PASS ${name}`);
}

console.log(`${checks.length}/${checks.length} logistics dispatch truth checks passed`);
