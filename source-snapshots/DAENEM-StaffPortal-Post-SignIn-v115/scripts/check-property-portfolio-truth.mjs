import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [contract, model, workspace, matrix, styles, portal] = await Promise.all([
  readFile(new URL("../app/experience/property-portfolio-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/model.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/property-workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/review/viewports/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/property-closure-v1.css", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/Portal.tsx", import.meta.url), "utf8"),
]);

const states = ["Occupied", "Available", "Maintenance"];

const checks = [
  [
    "portfolio states are defined once and in order",
    states.every(
      (state, index) =>
        contract.indexOf(`\"${state}\"`) >
        (index ? contract.indexOf(`\"${states[index - 1]}\"`) : -1),
    ),
  ],
  [
    "property module consumes the shared state authority",
    model.includes("propertyPortfolioStates.join('|')"),
  ],
  [
    "fixture states cover each truthful portfolio lane",
    model.includes("m.id === 'properties' ? m.stages[i]"),
  ],
  [
    "review captures reset persisted records to canonical fixtures",
    workspace.includes('data-recorded-property-state={row.status}') &&
      matrix.includes('["occupied", "available", "maintenance"].every') &&
      portal.includes("if (isReviewHarness)") &&
      portal.includes("setRecords(seedRecords())"),
  ],
  [
    "board groups records by recorded property state",
    workspace.includes("propertyLaneForStatus(row.status) === laneIndex"),
  ],
  [
    "occupancy remains aggregate record truth",
    workspace.includes('data-occupancy-source="recorded-aggregate-only"') &&
      contract.includes("aggregate occupancy"),
  ],
  [
    "rent payment is explicitly unconfirmed",
    workspace.includes('data-rent-payment-confirmation="unavailable"') &&
      contract.includes("Payment confirmation not connected"),
  ],
  [
    "receipt issue is never claimed",
    workspace.includes('data-receipt-truth="not-claimed"') &&
      contract.includes("Receipt and reconciliation source not connected"),
  ],
  [
    "reconciliation remains unavailable",
    workspace.includes('data-reconciliation="unavailable"') &&
      contract.includes("does not confirm payment, receipt issue, bank settlement or reconciliation"),
  ],
  [
    "state presentation says listed states are not payment proof",
    workspace.includes("They do not prove rent") &&
      workspace.includes("bank settlement or reconciliation."),
  ],
  [
    "property surface has an exact owner-private matrix target",
    matrix.includes('"property-portfolio"') && matrix.includes('"/properties"'),
  ],
  [
    "property capture waits for the truthful workspace root",
    matrix.includes("propertySurface && propertyAuthorized") &&
      matrix.includes('root?.dataset.propertyWorkflow === "authoritative-records-required"'),
  ],
  [
    "matrix checks occupancy, payment, receipt and reconciliation markers",
    matrix.includes("PROPERTY_TRUTH_ASSERTION_FAILED") &&
      matrix.includes('data-property-workflow="authoritative-records-required"'),
  ],
  [
    "unauthorized matrix checks Zero Disclosure before render",
    matrix.includes("ZERO_DISCLOSURE_PROPERTY_LEAK") &&
      matrix.includes("protectedPropertyTerms"),
  ],
  [
    "Reduced Motion is explicitly respected",
    styles.includes('@media (prefers-reduced-motion: reduce)') &&
      styles.includes('[data-property-surface="portfolio-workspace"]'),
  ],
  [
    "daylight header overrides the legacy dark gradient",
    styles.includes("background: #eef2e8 !important") &&
      styles.includes("box-shadow: 0 12px 30px"),
  ],
];

for (const [name, pass] of checks) {
  assert.equal(pass, true, name);
  console.log(`PASS ${name}`);
}

console.log(`${checks.length}/${checks.length} property portfolio truth checks passed`);
