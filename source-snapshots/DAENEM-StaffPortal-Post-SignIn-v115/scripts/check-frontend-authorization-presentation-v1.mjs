import { readFileSync } from "node:fs";

const model = readFileSync("app/experience/model.ts", "utf8");
const portal = readFileSync("app/experience/Portal.tsx", "utf8");
const operations = readFileSync(
  "app/experience/enterprise-operations.tsx",
  "utf8",
);
const imports = readFileSync("app/experience/import-desk.tsx", "utf8");
const workspaces = readFileSync("app/experience/workspaces.tsx", "utf8");

const financeCenter = operations.slice(
  operations.indexOf("export function FinancialOperationsCenter"),
  operations.indexOf("function FinanceCommandOverview"),
);
const governedControls = portal.slice(
  portal.indexOf("const commandGovernedControls"),
  portal.indexOf("const activeSessionScopeKey"),
);

const checks = [
  [
    "module company scope composes the canonical assignment authority",
    model.includes("export function authorizedCompaniesForModule") &&
      model.includes("const sessionCompanies=authorizedCompaniesForSession(s,now)") &&
      model.includes("m.company===company") &&
      model.includes("scoped.length>1") &&
      model.includes("effectiveLevel(m,{...s,company},now)!=='No Access'"),
  ],
  [
    "portal company choices use the active permission context",
    portal.includes("const companyPermissionContext =") &&
      portal.includes("authorizedCompaniesForModule(\n    session,\n    companyPermissionContext"),
  ],
  [
    "delegated Studio scope resolves through its governed module",
    portal.includes('? byId("signin-design")\n      : m;'),
  ],
  [
    "import company choices are target-module scoped",
    imports.includes("authorizedCompaniesForModule(session, m)") &&
      imports.includes("authorizedCompanyIds.includes(candidate.id)"),
  ],
  [
    "financial deep links revalidate requested tabs before render",
    financeCenter.includes("const allowedTabs = financeTabs.filter") &&
      financeCenter.includes("const activeTab = allowedTabs.some") &&
      financeCenter.includes("const rows = get(activeTab)") &&
      !financeCenter.includes("const rows = get(tab)"),
  ],
  [
    "financial workspace fails closed when no tab is authorized",
    financeCenter.includes("if (!activeTab)") &&
      financeCenter.includes("No assigned financial operations workspace"),
  ],
  [
    "financial panel selection renders only the revalidated tab",
    financeCenter.includes('activeTab === "banking-operations"') &&
      financeCenter.includes('activeTab === "reconciliation"') &&
      !financeCenter.includes('tab === "banking-operations"'),
  ],
  [
    "fixed governed search suggestions derive from allowed modules",
    governedControls.includes(
      ".filter((item) => allowed.some((module) => module.id === item.moduleId))",
    ) && portal.includes("commandGovernedControls.map((item)"),
  ],
  [
    "spend company labels use module-scoped visibility",
    workspaces.includes("authorizedCompaniesForModule(session, m)") &&
      workspaces.includes("visibleCompanies.map((c, i)"),
  ],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}
if (failed.length) process.exit(1);
console.log(
  `Frontend authorization presentation contract: ${checks.length}/${checks.length} PASS`,
);
