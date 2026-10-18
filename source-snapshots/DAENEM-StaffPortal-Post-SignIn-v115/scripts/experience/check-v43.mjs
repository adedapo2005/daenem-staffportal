import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const settings = read("app/experience/communications-settings.tsx");
const settingsCss = read("app/experience/communications-settings.css");
const auth = read("app/experience/auth-v3.tsx");
const model = read("app/experience/model.ts");
const navigation = read("app/experience/navigation-adapter.ts");
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("V43 route is canonical and owner-scoped", model.includes("communication-settings") && /communication-settings'[^\n]+owner/.test(model));
check("Admin navigation exposes communication governance", navigation.includes('canonical("communication-settings", "Communications")'));
check("Staff Portal company allowlist is explicit", settings.includes('companies.filter((company) => company.id !== "group")') && ["'printing'", "'bakery'", "'autos'", "'properties'", "'logistics'"].every((id) => model.includes(id)));
check("New scope surface does not introduce Farms", !/farm/i.test(settings) && !/farm/i.test(settingsCss));
check("Scope states are visible", ["Select All", "Inherited", "Individually Configured", "Use Inherited Value", "Save as Global Default"].every((text) => settings.includes(text)));
check("Company selection and multi-selection are represented", settings.includes("companyIds: selected") && settings.includes("selected.length"));
check("Recovery policy has all three values", ["email-only", "whatsapp-only", "email-whatsapp"].every((value) => settings.includes(value)));
check("Communication controls are represented", ["whatsappEligibility", "aiEligibility", "dailyAiLimit", "providerDailyBudget"].every((value) => settings.includes(value)));
check("Global safety controls are separate", settings.includes("Emergency communications kill switch") && settings.includes("Live WhatsApp provider release gate"));
check("Client calls the scoped settings API", settings.includes('"/api/admin/scoped-settings"') && settings.includes('method: "PATCH"'));
check("Client does not use localStorage for policy authority", !settings.includes("localStorage") && !settings.includes("sessionStorage"));
check("Recovery company selection is explicit", auth.includes("RECOVERY_COMPANIES") && auth.includes("recoveryCompany") && auth.includes("Select your company"));
check("Recovery methods use same-origin backend contracts", ["/api/auth/password/recovery-options", "/api/auth/password/forgot", "/api/auth/password/forgot-whatsapp", "/api/auth/password/verify-reset", "/api/auth/password/verify-reset-whatsapp"].every((endpoint) => auth.includes(endpoint)));
check("Recovery copy protects account privacy", auth.includes("No account status is disclosed") && auth.includes("If the account is eligible"));
check("WhatsApp copy requires enrolled verification", auth.includes("enrolled, previously verified WhatsApp contact"));
check("Recovery does not expose reset bearer values", !auth.includes("resetAuthorization"));
check("Reduced motion is represented", settingsCss.includes("prefers-reduced-motion") && read("app/experience/auth-recovery-v43.css").includes("prefers-reduced-motion"));
check("12-hour time authority remains in shared runtime", read("app/experience/time-standard.ts").includes("hour12: true"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
