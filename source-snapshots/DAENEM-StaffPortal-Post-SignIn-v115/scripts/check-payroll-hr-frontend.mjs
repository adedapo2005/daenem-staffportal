import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, workspaces, css] = await Promise.all([
  readFile(new URL("../app/experience/workforce-api.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/workspaces.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/enterprise-v3.css", import.meta.url), "utf8"),
]);
const payroll = workspaces.slice(workspaces.indexOf("function Payroll()"), workspaces.indexOf("type HrOverviewState"));
const hr = workspaces.slice(workspaces.indexOf("function HrOverview()"), workspaces.indexOf("function Payslips"));
const guard = workspaces.indexOf("!canAct(m, lab.session)");

const checks = [
  ["payroll runs use the authoritative company-scoped endpoint", /\/api\/payroll\/runs\?companyId=/.test(payroll)],
  ["HR overview uses the authoritative company-scoped endpoint", /\/api\/hr\/workflows\/overview\?companyId=/.test(hr)],
  ["payroll response is bounded and validated", /value\.runs\.length <= 100/.test(api) && /value\.runs\.every\(isPayrollRun\)/.test(api)],
  ["payroll money fields are non-negative integers", /nonNegativeInteger\(value\.totalGrossKobo\)/.test(api) && /nonNegativeInteger\(value\.totalNetKobo\)/.test(api)],
  ["HR overview counts are validated", /isHrOverview/.test(api) && /nonNegativeInteger\(value\.activeLifecycle\)/.test(api)],
  ["payroll request follows the full session scope", /sessionScopeKey\(session\)/.test(payroll)],
  ["HR request follows the full session scope", /sessionScopeKey\(session\)/.test(hr)],
  ["payroll requests are abortable", /new AbortController\(\)/.test(payroll) && /controller\.abort\(\)/.test(payroll)],
  ["HR requests are abortable", /new AbortController\(\)/.test(hr) && /controller\.abort\(\)/.test(hr)],
  ["group payroll view does not query a company", /Choose a specific assigned business to view payroll/.test(payroll)],
  ["group HR view does not query a company", /Choose a specific assigned business to view HR operations/.test(hr)],
  ["payroll UI has no fixture mutation path", !/\bmutate\b|canRecordAct|DownloadCSV|PAYROLL-DRAFT-NOT-FOR-PAYMENT/.test(payroll)],
  ["payroll approval controls remain unavailable until contract-backed", /Controlled payroll actions/.test(payroll)],
  ["HR destinations are permission filtered", /filter\(\(item\) => canView\(byId\(item\.moduleId\), session\)\)/.test(hr)],
  ["HR overview does not preload record-level details", /Confidential employee records are not preloaded/.test(hr)],
  ["payroll and HR bypass the fixture fallback", workspaces.indexOf('if (kind === "payroll") return <Payroll />;') < guard && workspaces.indexOf('if (m.id === "hr-records") return <HrOverview />;') < guard],
  ["payroll empty state is truthful", /authoritative payroll service returned no runs/.test(payroll)],
  ["neutral errors do not expose backend details", /apiErrorMessage\(error\)/.test(payroll) && /apiErrorMessage\(error\)/.test(hr)],
  ["HR cards reflow before compression", /p-hr-overview-grid\{[^}]*grid-template-columns:repeat\(5/.test(css) && /max-width:430px/.test(css)],
  ["generic selection does not use success green", !/tone="green"|className="[^"]*green/.test(payroll + hr)],
];

for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`Payroll and HR frontend checks: ${checks.length}/${checks.length} PASS`);
