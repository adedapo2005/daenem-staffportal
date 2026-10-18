import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [contract, workspace, enterprise, rules, css, review, portal, version] =
  await Promise.all([
    read("app/experience/bakery-settlement-contract.ts"),
    read("app/experience/bakery-settlement-workspace.tsx"),
    read("app/experience/enterprise-v3.tsx"),
    read("app/experience/enterprise-contract.ts"),
    read("app/experience/bakery-settlement-v1.css"),
    read("app/review/viewports/page.tsx"),
    read("app/experience/Portal.tsx"),
    read("app/experience/site-version.ts"),
  ]);

const checks = [
  [contract.includes('workflow: "received-only-authority-required"'), "workflow authority marker"],
  [contract.includes('receivedMoney: "unavailable"'), "received money unavailable marker"],
  [contract.includes('receiptTruth: "not-claimed"'), "receipt truth marker"],
  [contract.includes('financialClose: "blocked"'), "financial close marker"],
  [contract.includes("The current bakery projection can include money still owed"), "outstanding obligation truth"],
  [contract.includes("return false"), "financial close fail-closed"],
  [workspace.includes('data-bakery-settlement-workflow={bakerySettlementMarkers.workflow}'), "rendered contract marker"],
  [workspace.includes('detail="May include money still owed"'), "accounted money label"],
  [workspace.includes("Approve and close is unavailable"), "closure unavailable copy"],
  [workspace.includes('stage === "Reconciled"') && workspace.includes('"Settlement verification"'), "future settlement stage is truthful"],
  [!workspace.includes('"Resolution Amount": String(balance.cashVariance)'), "no synthetic settlement mutation"],
  [!workspace.match(/>\s*(Approve[^<]*close|Close[^<]*ledger|Reconcile)\s*</i), "no close affordance"],
  [workspace.includes("bakeryReportLabels(canViewBakeryFlourUsage(session))"), "flour reports remain permission composed"],
  [enterprise.includes("<BakerySettlementWorkspace"), "canonical workspace route"],
  [rules.includes("Accounted money may include an outstanding obligation"), "enterprise invariant"],
  [css.includes("prefers-reduced-motion: reduce"), "reduced motion boundary"],
  [css.includes(".v3-domain-hero.bakery.bakery-settlement-hero .p-kicker"), "daylight contrast specificity"],
  [portal.includes('import "./bakery-settlement-v1.css"'), "boundary stylesheet loaded"],
  [review.includes('"bakery-settlement": "/bakery-accountability"'), "review route"],
  [review.includes("ZERO_DISCLOSURE_BAKERY_SETTLEMENT_LEAK"), "zero disclosure assertion"],
  [review.includes("BAKERY_SETTLEMENT_TRUTH_ASSERTION_FAILED"), "truth assertion"],
  [version.includes('CURRENT_SAVED_SITE_VERSION = "V108"'), "candidate version"],
];

for (const [pass, label] of checks) assert.ok(pass, label);
console.log(`Bakery settlement truth checks passed (${checks.length}/${checks.length}).`);
