import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const home = read("app/experience/homes-v3.tsx");
const api = read("app/experience/staffportal-api.ts");
const dashboardPulseBlock = home.slice(home.indexOf("const dashboardPulse ="), home.indexOf("const pulse = employee"));
const portfolioBlock = home.slice(home.indexOf("const portfolio ="), home.indexOf("const map ="));
const executiveBlock = home.slice(home.indexOf("const hasExecutiveContractPermission"), home.indexOf("const employeeMetricDetail"));
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Manager Home reads the authenticated dashboard summary", home.includes('staffPortalApi<unknown>("/api/dashboard/summary"'));
check("Dashboard summary uses the credentialed no-store client", home.includes('from "./staffportal-api"') && api.includes('credentials: "include"') && api.includes('cache: "no-store"'));
check("Dashboard response validates identity and scope fields", home.includes("function isDashboardSummaryResponse") && home.includes('response.scope === "aggregate"') && home.includes('response.scope === "personal"'));
check("Every documented dashboard count is boundary validated", ["employees", "present", "incompleteAttendance", "pendingApprovals", "securityAlerts", "overdueRequirements", "maintenanceAlerts"].every((field) => home.includes(`"${field}"`)) && home.includes("DASHBOARD_COUNT_FIELDS.every"));
check("Omitted unauthorized fields are accepted without placeholders", home.includes("response[field] === undefined || isNonNegativeCount(response[field])"));
check("Malformed responses fail closed", home.includes("if (!isDashboardSummaryResponse(response))") && home.includes("The Staff Portal service returned an invalid response."));
check("Dashboard requests cancel on stale session changes", home.includes("setDashboardState({ status: \"loading\", scopeKey: dashboardScopeKey })") && home.includes("controller.abort()") && home.includes("if (!current) return"));
check("Role and company changes suppress stale dashboard data", home.includes("const dashboardScopeKey") && home.includes("dashboardState.scopeKey === dashboardScopeKey") && home.includes('{ status: "loading", scopeKey: dashboardScopeKey }'));
check("Manager queue is separated from employee My Day", home.includes("const dashboardQueue") && home.includes("const employeeQueue") && home.includes("const queue = employee ? employeeQueue : dashboardQueue"));
check("Manager queue uses only backend summary fields", home.includes("const dashboardAttention") && ["dashboardData?.securityAlerts", "dashboardData?.pendingApprovals", "dashboardData?.incompleteAttendance", "dashboardData?.overdueRequirements", "dashboardData?.maintenanceAlerts"].every((field) => home.includes(field)));
check("Manager queue destinations remain locally permission filtered", ["perm(\"security\")", "perm(\"forms\")", "perm(\"attendance\")", "perm(\"facilities\")"].every((permission) => home.includes(permission)));
check("Manager queue has truthful loading, error, empty and retry states", ["Loading your work summary…", "Dashboard Summary Is Temporarily Unavailable", "No work items need your attention right now.", "setDashboardRefresh"].every((value) => home.includes(value)));
check("Manager focus uses the first authorized backend signal", home.includes("const firstDashboardItem = dashboardAttention[0]") && home.includes("firstDashboardItem?.title") && home.includes("firstDashboardItem?.detail"));
check("Manager focus refuses fixture fallback while unavailable", home.includes("No counts are shown until Staff Portal responds."));
check("Manager metrics render only returned and locally authorized fields", ["dashboardData?.employees !== undefined && perm(\"people\")", "dashboardData?.present !== undefined && perm(\"attendance\")", "dashboardData?.pendingApprovals !== undefined && perm(\"forms\")", "dashboardData?.securityAlerts !== undefined && perm(\"security\")"].every((value) => home.includes(value)));
check("Manager metrics use authoritative values rather than fixture lengths", home.includes("String(dashboardData.employees)") && home.includes("String(dashboardData.pendingApprovals)") && !/label="Needs attention"[\s\S]{0,150}String\(attention\.length\)/.test(home));
check("Manager dashboard state changes are announced accessibly", home.includes('aria-busy={currentDashboardState.status === "loading"}') && home.includes('role="status"'));
check("Backend errors remain neutral", !home.includes("error.message") && !home.includes("payload.error") && api.includes("This Staff Portal action is not available."));
check("Manager operational pulse is separated from the fixture record pulse", home.includes("const recordPulse") && home.includes("const dashboardPulse") && home.includes("const pulse = employee ? recordPulse : dashboardPulse"));
check("Manager operational pulse uses only returned summary fields", home.includes("const dashboardPulseItems") && ["dashboardData?.employees", "dashboardData?.present", "dashboardData?.incompleteAttendance", "dashboardData?.pendingApprovals", "dashboardData?.securityAlerts", "dashboardData?.overdueRequirements", "dashboardData?.maintenanceAlerts"].every((field) => home.includes(field)));
check("Manager operational pulse remains locally permission filtered", ["perm(\"people\")", "perm(\"attendance\")", "perm(\"forms\")", "perm(\"security\")", "perm(\"facilities\")"].every((permission) => home.includes(permission)));
check("Manager operational pulse has truthful loading, error, empty and retry states", ["Loading your work summary…", "Operational Pulse Is Temporarily Unavailable", "No Summary Available", "setDashboardRefresh"].every((value) => home.includes(value)));
check("Manager pulse drill-downs are bounded to authorized destinations", home.includes("dashboardPulseItems.find") && home.includes("if (item) go(item.destination)"));
check("Manager pulse never falls back to fixture record counts", home.includes("const pulse = employee ? recordPulse : dashboardPulse") && dashboardPulseBlock.length > 0 && !dashboardPulseBlock.includes("selectedRows"));
check("Owner portfolio refuses fixture-derived company records", portfolioBlock.includes("Portfolio details are unavailable") && portfolioBlock.includes("Business records are not available for this view.") && !portfolioBlock.includes("recordsFor(") && !portfolioBlock.includes("source records"));
check("Manager team refuses fixture-derived people records", portfolioBlock.includes("Team details are unavailable") && portfolioBlock.includes("Team records are not available for this view.") && !portfolioBlock.includes("team.map"));
check("Executive command center is permission bounded", executiveBlock.includes('session.role === "Owner" && hasExecutiveContractPermission') && ["banking-operations", "treasury", "payroll-execution", "transfers", "reconciliation"].every((permission) => executiveBlock.includes(`perm("${permission}")`)));
check("Executive command center exposes no fixture totals", executiveBlock.includes("Financial command data is unavailable") && executiveBlock.includes("No financial totals, records or provider states are shown from design fixtures.") && !executiveBlock.includes("Metric") && !executiveBlock.includes("recordsFor("));
check("No hard-coded financial fallbacks remain", !home.includes("2840000000") && !home.includes("31500000") && !home.includes("12480000"));
check("Record-level Home gates remain neutral and non-actionable", !portfolioBlock.includes("onClick") && !executiveBlock.includes("onClick"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
