import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const settings = read("app/experience/communications-settings.tsx");
const api = read("app/experience/staffportal-api.ts");
const model = read("app/experience/model.ts");
const navigation = read("app/experience/navigation-adapter.ts");
const css = read("app/experience/communications-settings.css");
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("V44 route remains canonical and owner-scoped", model.includes("communication-settings") && /communication-settings'[^\n]+owner/.test(model));
check("Admin navigation retains Communications Control", navigation.includes('canonical("communication-settings", "Communications Control")'));
check("Canonical backend setting keys are used", ["security.password_recovery_methods", "communications.whatsapp_enabled", "communications.ai_enabled", "communications.ai_daily_limit", "communications.provider_daily_limit"].every((key) => api.includes(key)));
check("Scoped settings reads use the authoritative GET", settings.includes("/api/admin/scoped-settings?settingKey=") && !settings.includes("surface=staff-portal"));
check("Scoped settings writes use backend POST semantics", settings.includes('method: "POST"') && settings.includes("companyIds: selected") && settings.includes("inherit: true") && !settings.includes('method: "PATCH"'));
check("Authorized companies come only from the backend projection", settings.includes("next.companies") && !settings.includes("companies.filter") && !settings.includes("SAFE_PREVIEW_DEFAULTS"));
check("Delegated permissions gate company writes", settings.includes("canManageCompanyIds") && settings.includes("canApplySelected"));
check("Unavailable API state has no local authority fallback", settings.includes("No preview value is being used") && !settings.includes("localStorage") && !settings.includes("sessionStorage"));
check("API requests allow only the documented staging origin", api.includes("TRUSTED_API_ORIGINS") && api.includes("daenem-staffportal-api-staging.adedapo2005.workers.dev") && api.includes("configured.protocol !== \"https:\"") && api.includes("!TRUSTED_API_ORIGINS.has(configured.origin)"));
check("QA mirror defaults to the documented staging API", api.includes('const DEFAULT_API_ORIGIN = "https://daenem-staffportal-api-staging.adedapo2005.workers.dev"') && api.includes("window.__DAENEM_STAFFPORTAL_API_ORIGIN__ || DEFAULT_API_ORIGIN"));
check("API errors remain neutral and never render backend error payloads", api.includes("neutralResponseError") && !api.includes("payload.error") && api.includes("status === 403 || status === 404"));
check("API requests are credentialed, no-store and bounded", api.includes('credentials: "include"') && api.includes('cache: "no-store"') && api.includes("REQUEST_TIMEOUT_MS"));
check("Non-JSON success responses fail closed", api.includes('includes("application/json")') && api.includes('"invalid_response"'));
check("Live release safety remains separate", settings.includes("Backend-controlled") && settings.includes("Separate release control") && settings.includes("cannot open the emergency kill switch"));
check("Owner authority and provider release boundaries are machine readable", ['data-authority="owner-only"', 'data-safety-boundary="emergency-communications"', 'data-control-state="backend-controlled"', 'data-safety-boundary="whatsapp-provider-release"', 'data-control-state="release-closed"'].every((term) => settings.includes(term)));
check("Mutations fail closed until authoritative state arrives", settings.includes('data-mutation-state={loadState === "ready" ? "permission-composed" : "closed-until-authoritative"}') && settings.includes('aria-busy={loadState === "loading"}'));
check("Scoped controls retain visible focus treatment", [".v43-select-all:focus-within", ".v43-company-row:focus-within", ".v43-native-select:focus-visible", ".v43-toggle:focus-within"].every((term) => css.includes(term)));
check("V44 marker is present", settings.includes("data-backend-contract=\"scoped-settings-v44\"") && settings.includes(">V44</span>"));
check("Reduced motion remains represented", css.includes("prefers-reduced-motion"));
check("12-hour time authority remains in shared runtime", read("app/experience/time-standard.ts").includes("hour12: true"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
