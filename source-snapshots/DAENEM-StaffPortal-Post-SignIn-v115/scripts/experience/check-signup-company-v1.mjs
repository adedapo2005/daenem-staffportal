import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync("app/experience/auth-v3.tsx", "utf8");
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Create Account state includes requested company", auth.includes('company: ""'));
check("Requested company uses a governed selector", auth.includes("Requested Company") && auth.includes("RECOVERY_COMPANIES.map"));
check("Company selector starts blank without guessing identity", auth.includes('<option value="">Select A Company</option>'));
check("Requested company is required", auth.includes('if (!signup.company) issues.company'));
check("Company validation is accessible", auth.includes('aria-invalid={!!signupErrors.company}') && auth.includes('id="v3-signup-company-error" role="alert"'));
check("Company errors focus the governed selector", auth.includes("signupFieldRefs.current.company = element") && auth.includes("Record<string, { focus: () => void } | null>"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
