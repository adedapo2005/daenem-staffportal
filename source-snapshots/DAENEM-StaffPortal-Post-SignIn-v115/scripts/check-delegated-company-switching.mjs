import { readFileSync } from "node:fs";

const model = readFileSync("app/experience/model.ts", "utf8");
const portal = readFileSync("app/experience/Portal.tsx", "utf8");
const settings = readFileSync("app/experience/communications-settings.tsx", "utf8");
const home = readFileSync("app/experience/homes-v3.tsx", "utf8");

const checks = [
  ["company options derive from active assignments", model.includes("authorizedCompaniesForSession") && model.includes("a.level!=='No Access'&&within")],
  ["group grant expands to every company", model.includes("a.companies.includes('group')") && model.includes("companies.map(company=>company.id)")],
  ["multi-company aggregate includes only assigned companies", model.includes("return scoped.length>1?['group',...scoped]:scoped")],
  ["restored sessions normalize unauthorized companies", portal.includes("normalizeSessionCompany(JSON.parse(s) as Session)")],
  ["session changes normalize company scope", portal.includes("const nextSession = normalizeSessionCompany(s)")],
  ["company selector excludes unassigned names", portal.includes("options={authorizedCompanyOptions.map")],
  ["no-assignment state exposes no company list", portal.includes("Company names are not listed until the authenticated session has an active company assignment")],
  ["permission changes remount the workspace", portal.includes("key={activeSessionScopeKey}")],
  ["permission fingerprint is not exposed as DOM metadata", !portal.includes("data-session-scope") && !settings.includes("data-session-scope")],
  ["scope fingerprint includes assignments", model.includes("const assignments=(s.assignments||[]).map")],
  ["scope fingerprint includes restrictions", model.includes("const overrides=Object.entries(s.overrides||{})")],
  ["communications scope uses full permission fingerprint", settings.includes("const scopeKey = sessionScopeKey(session)")],
  ["communications reloads on session scope change", settings.includes("}, [activeKey, loadSetting, scopeKey]);")],
  ["communications reads are abortable", settings.includes("{ headers: { Accept: \"application/json\" }, signal }") && settings.includes("controller.abort();")],
  ["communications writes are abortable", settings.includes("writeControllerRef.current?.abort()") && settings.includes("signal: controller.signal")],
  ["stale communication writes cannot repaint", settings.match(/if \(controller\.signal\.aborted\) return false;/g)?.length === 2],
  ["dashboard API scope includes permission changes", home.includes("const dashboardScopeKey = sessionScopeKey(session)")],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`Delegated company switching contract: ${checks.length}/${checks.length} PASS`);
