import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = fs.readFileSync("app/experience/communications-selection.ts", "utf8");
const settings = fs.readFileSync("app/experience/communications-settings.tsx", "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "daenem-communications-selection-"));
fs.writeFileSync(
  path.join(temp, "communications-selection.mjs"),
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText,
);
const { governedCompanySelection } = await import(
  pathToFileURL(path.join(temp, "communications-selection.mjs")).href
);

const companies = [
  { id: "printing", code: "DPT", name: "Daenem Printing & Technology", value: true, source: "company" },
  { id: "bakery", code: "DB", name: "Daenem Bakery", value: false, source: "inherited" },
];
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check(
  "Current authorized company is preselected",
  governedCompanySelection([], companies, ["printing"], "printing").join() === "printing",
);
check(
  "Group scope remains unselected",
  governedCompanySelection([], companies, ["printing", "bakery"], "group").length === 0,
);
check(
  "Unmanageable current company remains unselected",
  governedCompanySelection([], companies, ["bakery"], "printing").length === 0,
);
check(
  "Unreturned current company remains unselected",
  governedCompanySelection([], companies, ["printing"], "autos").length === 0,
);
check(
  "Valid explicit selection is retained",
  governedCompanySelection(["bakery"], companies, ["printing", "bakery"], "printing").join() === "bakery",
);
check(
  "Stale and unauthorized selections are removed",
  governedCompanySelection(["unknown", "bakery"], companies, ["printing"], "group").length === 0,
);
check(
  "Settings use the governed selection helper",
  settings.includes("governedCompanySelection(") && settings.includes("next.canManageCompanyIds") && settings.includes("session.company"),
);
check(
  "Global value is rendered once",
  (settings.match(/<span>Current global value<\/span>/g) || []).length === 1,
);
check(
  "Selection remains backend projected",
  !source.includes("companies.filter") && source.includes("manageableCompanyIds"),
);

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
