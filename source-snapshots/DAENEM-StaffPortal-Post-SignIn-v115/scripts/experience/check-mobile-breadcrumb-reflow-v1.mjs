import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const portal = readFileSync(
  new URL("../../app/experience/Portal.tsx", import.meta.url),
  "utf8",
);
const navigation = readFileSync(
  new URL("../../app/experience/navigation-v24.css", import.meta.url),
  "utf8",
);
const interactions = readFileSync(
  new URL("../../app/experience/record-interactions-v1.css", import.meta.url),
  "utf8",
);
const reviewHarness = readFileSync(
  new URL("../../app/review/viewports/page.tsx", import.meta.url),
  "utf8",
);
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const reflowStart = navigation.indexOf(
  "  .p-shell-breadcrumb {\n    flex-wrap: wrap;",
);
const mobile = navigation.slice(Math.max(0, reflowStart - 180), reflowStart + 520);

check(
  "Breadcrumb is a labelled navigation region",
  portal.includes('<nav className="p-shell-breadcrumb" aria-label="Breadcrumb">'),
);
check(
  "Unauthorized destinations receive a neutral breadcrumb before render",
  portal.includes('!workspaceAuthorized') &&
    portal.includes('? [{ label: "Workspace" }]'),
);
check(
  "Authorized ancestor levels remain clickable",
  portal.includes("onClick={() => goRoute(item.route!, item.capabilityModuleId)}"),
);
check(
  "The current page remains non-clickable",
  portal.includes('<strong aria-current="page">{item.label}</strong>'),
);
check(
  "Mobile breadcrumbs reflow onto additional lines",
  reflowStart >= 0 &&
    mobile.includes("@media (max-width: 767px)") &&
    mobile.includes(".p-shell-breadcrumb {") &&
    mobile.includes("flex-wrap: wrap") &&
    mobile.includes("row-gap: .28rem"),
);
check(
  "Mobile breadcrumbs do not rely on hidden horizontal scrolling",
  mobile.includes("overflow: visible") &&
    !mobile.includes("overflow-x: auto") &&
    !mobile.includes("scrollbar-width: none"),
);
check(
  "Breadcrumb segments remain intact while the path reflows",
  mobile.includes("white-space: nowrap") &&
    interactions.includes(".p-shell-breadcrumb-item{display:inline-flex"),
);
check(
  "Breadcrumb controls retain visible keyboard focus",
  interactions.includes(".p-shell-breadcrumb-item>button:focus-visible") &&
    interactions.includes("outline:2px solid #187f89"),
);
check(
  "Reduced Motion remains enforced for breadcrumb controls",
  interactions.includes(".p-shell-breadcrumb-item *{animation:none!important"),
);
check(
  "Authorized records without a permitted primary action remain valid",
  !reviewHarness.includes('recordRoot.querySelector(".dr-primary-action") &&'),
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
