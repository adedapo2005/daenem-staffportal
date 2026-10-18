import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("app/experience/homes-v3.tsx", "utf8");
const model = readFileSync("app/experience/model.ts", "utf8");
const ordinaryStart = home.indexOf("const dashboardQueue =");
const ordinaryEnd = home.indexOf("const hasExecutiveContractPermission");
const ordinaryHome = home.slice(ordinaryStart, ordinaryEnd);
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("ordinary Home slice is present", ordinaryStart >= 0 && ordinaryEnd > ordinaryStart);
check("manager queue uses plain work-summary wording", ordinaryHome.includes('kicker="YOUR WORK SUMMARY"'));
check("employee queue uses plain work wording", ordinaryHome.includes('kicker="YOUR WORK"'));
check("loading copy says assigned work", ordinaryHome.includes("Loading your assigned work…"));
check("empty states say work items or actions", ordinaryHome.includes("No work items need your attention right now.") && ordinaryHome.includes("No work actions need your attention right now."));
check("pulse names the user's current work", ordinaryHome.includes("Your Current Work"));
check("aggregate and personal labels are understandable", ordinaryHome.includes("Company Summary") && ordinaryHome.includes("Personal View"));
check("portfolio and team unavailable copy is simple", ordinaryHome.includes("Business records are not available for this view.") && ordinaryHome.includes("Team records are not available for this view."));
check("metric detail uses current information wording", home.includes("Current information unavailable") && home.includes("Loading current information"));
check("dashboard date label uses Your work", home.includes("`Your work · ${currentDashboardState.data.workDate}`"));
check("ordinary Home hides API terminology", !ordinaryHome.includes("Staff Portal API") && !ordinaryHome.includes(" API "));
check("ordinary Home hides permission-architecture terminology", !ordinaryHome.includes("permission-composed") && !ordinaryHome.includes("authorized scope"));
check("ordinary Home hides aggregate jargon", !ordinaryHome.includes("dashboard aggregates") && !ordinaryHome.includes("Authorized aggregate"));
check("ordinary Home keeps fail-closed record composition", ordinaryHome.includes("dashboardPulseItems") && ordinaryHome.includes("dashboardAttention") && ordinaryHome.includes("perm(\"people\")") && ordinaryHome.includes("perm(\"forms\")"));
check("Home overview uses plain availability wording", model.includes("See the priorities and records available to you.") && !model.includes("Understand priorities across your authorized scope."));
check("Home financial unavailable state avoids API terminology", home.includes("Financial information remains hidden until current records for") && !home.includes("Staff Portal API supplies"));
check("Home loading state names the work summary", home.includes("Loading your work summary…") && !home.includes("Loading authorized dashboard metrics…"));

console.log(`Home user clarity: ${checks.length}/${checks.length} PASS`);
