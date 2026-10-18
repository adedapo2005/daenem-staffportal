import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api, attendance, workspaces, css] = await Promise.all([
  readFile(new URL("../app/experience/workforce-api.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/attendance-v3.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/workspaces.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/experience/enterprise-v3.css", import.meta.url), "utf8"),
]);

const checks = [
  ["company IDs match backend contracts", /printing: "company-printing"/.test(api) && /properties: "company-properties"/.test(api)],
  ["group is not mapped to a company API ID", !/group: "company-/.test(api)],
  ["employee directory response is validated", /isEmployeeDirectoryResponse/.test(api) && /employees\.every\(\(employee\) => object\(employee\)/.test(api)],
  ["attendance response is validated", /isAttendanceToday/.test(api) && /isAttendanceClockResponse/.test(api)],
  ["people directory uses the authoritative endpoint", /\/api\/hr\/workflows\/employees\?companyId=/.test(workspaces)],
  ["people requests are abortable", /function People\([^)]*[\s\S]*?\)[\s\S]*new AbortController\(\)/.test(workspaces)],
  ["people scope follows company, role, identity, and permissions", /function People\([^)]*[\s\S]*?\)[\s\S]*sessionScopeKey\(session\)/.test(workspaces)],
  ["people validates responses before rendering", /function People\([^)]*[\s\S]*?\)[\s\S]*isEmployeeDirectoryResponse\(response\)/.test(workspaces)],
  ["group people view asks for a business without disclosing data", /Choose a specific assigned business to view its people directory/.test(workspaces)],
  ["fixture profile percentages were removed", !/\[88,\s*75,\s*96\]/.test(workspaces)],
  ["attendance reads authoritative today state", /\/api\/attendance\/today\?companyId=/.test(attendance)],
  ["attendance writes only to the authoritative clock endpoint", /staffPortalApi<unknown>\("\/api\/attendance\/clock"/.test(attendance)],
  ["attendance writes are abortable on scope changes", /writeController[\s\S]*signal: controller\.signal/.test(attendance)],
  ["attendance uses the full session scope key", /sessionScopeKey\(session\)/.test(attendance) && /key=\{sessionScopeKey\(lab\.session\)\}/.test(workspaces)],
  ["group attendance view asks for a business without disclosing data", /Choose a specific assigned business to use attendance/.test(attendance)],
  ["geolocation is requested only by an explicit action", /function requestLocation\(\)[\s\S]*navigator\.geolocation\.getCurrentPosition/.test(attendance)],
  ["camera evidence uses a live browser capture", /getUserMedia/.test(attendance) && /canvas\.toDataURL\("image\/jpeg"/.test(attendance)],
  ["no local attendance mutation or storage remains", !/\bmutate\b|localStorage|Simulate successful sync|fictional photo/i.test(attendance)],
  ["attendance displays human time in 12-hour format", /formatTime12/.test(attendance)],
  ["responsive attendance heading rule is retained", /@media\(max-width:1000px\)[^{]*\{[\s\S]*?\.v3-attendance-head h2\{font-size:1\.7rem\}/.test(css)],
];

for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`Workforce ERP checks: ${checks.length}/${checks.length} PASS`);
