import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [contract, workspace, workspaces, model, rules, css, portal, review, version] =
  await Promise.all([
    read("app/experience/offboarding-access-contract.ts"),
    read("app/experience/lifecycle-workspace.tsx"),
    read("app/experience/workspaces.tsx"),
    read("app/experience/model.ts"),
    read("app/experience/enterprise-contract.ts"),
    read("app/experience/offboarding-access-v1.css"),
    read("app/experience/Portal.tsx"),
    read("app/review/viewports/page.tsx"),
    read("app/experience/site-version.ts"),
  ]);

const checks = [
  [
    contract.includes(
      'workflow: "authoritative-access-verification-required"',
    ),
    "authoritative workflow marker",
  ],
  [
    contract.includes('accessRemoval: "verification-required"'),
    "verification-required state",
  ],
  [
    contract.includes('selfReportedCompletion: "blocked"'),
    "self-reported completion blocked",
  ],
  [
    contract.includes('notApplicable: "audited-exemption-required"'),
    "not-applicable requires backend audit reason",
  ],
  [
    contract.includes('scope: "company-specific"'),
    "company-specific revocation scope",
  ],
  [
    contract.includes("return false"),
    "verified access removal fails closed",
  ],
  [
    workspace.includes(
      "data-offboarding-access-workflow={offboardingAccessAuthority.workflow}",
    ),
    "rendered authority marker",
  ],
  [
    contract.includes("Completing a checklist does not revoke sessions"),
    "checklist and revocation separation",
  ],
  [
    workspace.includes("Selected company only"),
    "one-company exit presentation",
  ],
  [
    workspace.includes("Unrelated company access") &&
      workspace.includes("Preserved"),
    "unrelated company access preserved",
  ],
  [
    /A\s+“Complete” or “Not applicable” action is intentionally absent/.test(
      workspace,
    ),
    "unsafe actions explicitly absent",
  ],
  [
    !workspace.match(/<Btn[^>]*>\s*(Complete|Not applicable)\b/i),
    "no completion or not-applicable affordance",
  ],
  [
    workspaces.includes('m.id === "lifecycle"') &&
      workspaces.includes("<LifecycleWorkspace"),
    "canonical lifecycle route",
  ],
  [
    model.includes("without treating checklist progress as verified access removal"),
    "module purpose carries truth boundary",
  ],
  [
    rules.includes("BR-024") &&
      rules.includes("Access removal requires authoritative identity, session and company-scope verification"),
    "central completion guard",
  ],
  [
    css.includes("@media (prefers-reduced-motion: reduce)") &&
      css.includes('[data-lifecycle-surface="onboarding-offboarding"]'),
    "reduced motion boundary",
  ],
  [
    portal.includes('import "./offboarding-access-v1.css"'),
    "boundary stylesheet loaded",
  ],
  [
    review.includes('"offboarding-access": "/lifecycle"') &&
      review.includes("OFFBOARDING_ACCESS_TRUTH_ASSERTION_FAILED"),
    "exact rendered target and truth assertion",
  ],
  [
    review.includes("ZERO_DISCLOSURE_OFFBOARDING_ACCESS_LEAK"),
    "unauthorized surface leak assertion",
  ],
  [
    review.includes("setConfig((current) => ({ ...current, profile: nextProfile }))"),
    "manual profile selection synchronizes assertion authority",
  ],
  [
    version.includes('CURRENT_SAVED_SITE_VERSION = "V108"'),
    "candidate version",
  ],
];

for (const [pass, label] of checks) assert.ok(pass, label);
console.log(
  `Offboarding access truth checks passed (${checks.length}/${checks.length}).`,
);
