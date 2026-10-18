import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const studios = readFileSync("app/experience/studios.tsx", "utf8");
const policy = studios.slice(studios.indexOf("function Policy("), studios.indexOf("function Integrations("));
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Policy reason is controlled", policy.includes("[reason, setReason] = useState('')") && policy.includes("value={reason}") && policy.includes("setReason(event.target.value)"));
check("Policy reason is required", policy.includes("<textarea required"));
check("Blank reasons disable policy application", policy.includes("disabled={!reason.trim()}"));
check("Apply handler independently rejects blank rationale", policy.includes("const rationale = reason.trim()") && policy.includes("if (!rationale)"));
check("Audit history records the supplied rationale", policy.includes("`Policy set to ${value} · ${rationale}`"));
check("Reason clears only after successful application", policy.indexOf("setReason('')") > policy.indexOf("setHistory(current"));
check("Scope and value retain populated defaults", policy.includes("useState('Required')") && policy.includes("useState('Organization')"));
check("Policy controls use Title Case", ["Policies & Controls", "Effective Scope", "Policy Value", "Assigned Company", "Review the Consequence", "Change Reason", "Apply Demo Policy", "Inspect Policy Record"].every((label) => policy.includes(label)));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
