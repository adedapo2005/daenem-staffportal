import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const home = read("app/experience/homes-v3.tsx");
const api = read("app/experience/staffportal-api.ts");
const model = read("app/experience/model.ts");
const css = read("app/experience/portal.css");
const scenery = read("app/experience/scenery-v3.css");
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("My Day reads the authenticated employee-self-service route", home.includes('staffPortalApi<unknown>("/api/ess/my-day"'));
check("My Day uses the shared credentialed no-store API client", home.includes('from "./staffportal-api"') && api.includes('credentials: "include"') && api.includes('cache: "no-store"'));
check("My Day validates the complete response boundary", home.includes("function isMyDayResponse") && home.includes("Object.prototype.hasOwnProperty.call(MY_DAY_DESTINATIONS, item.action)") && ["assignedForms", "requiredSubmissions", "unreadNotices", "activeDocumentRequests", "reviewsToAcknowledge", "upcomingLeave", "obligations"].every((field) => home.includes(field)));
check("Malformed My Day responses fail closed", home.includes("The Staff Portal service returned an invalid response.") && home.includes("if (!isMyDayResponse(response))"));
check("My Day cancels stale requests", home.includes("const controller = new AbortController()") && home.includes("controller.abort()") && home.includes("if (!current) return"));
check("My Day has truthful loading state", home.includes("Loading your assigned work…") && home.includes('aria-busy={myDayState.status === "loading"}'));
check("My Day status changes are announced without motion", home.includes('aria-live="polite"') && home.includes('role="status"') && !home.includes("p-myday-spinner"));
check("My Day has neutral unavailable and retry states", home.includes("My day is temporarily unavailable") && home.includes("apiErrorMessage(error)") && home.includes("Try again"));
check("My Day has an explicit truthful empty state", home.includes("No work actions need your attention right now."));
check("My Day renders backend obligations rather than fixture tasks", home.includes("myDayState.data.obligations.map") && !/const myday[\s\S]*?tasks\.map/.test(home));
check("My Day action destinations are bounded", home.includes("MY_DAY_DESTINATIONS") && ["attendance", "forms", "performance", "notifications"].every((destination) => home.includes(`\"${destination}\"`)));
check("My Day navigation remains permission filtered", home.includes("const canOpenMyDayItem") && home.includes("return destination ? perm(destination) : false"));
check("My Day does not render backend error payloads", !home.includes("error.message") && !home.includes("payload.error"));
check("Employee default remains the focused Home layout", home.includes("employee ? 7 : null"));
check("Employee Home permission model remains deny-first", model.includes("s.role==='Employee'") && model.includes("return false"));
check("Existing phone reflow keeps My Day content unclipped", css.includes(".p-day-task{flex-wrap:wrap}") && css.includes(".p-day-task>.p-btn{margin-left:3.25rem}"));
check("Shared API keeps 403 and 404 responses neutral", api.includes("status === 403 || status === 404") && api.includes("This Staff Portal action is not available."));
check("Employee queue is separated from the manager dashboard queue", home.includes("const employeeQueue") && home.includes("const dashboardQueue") && home.includes("const queue = employee ? employeeQueue : dashboardQueue"));
check("Employee queue consumes only backend My Day obligations", home.includes("myDayData?.obligations.slice(0, 5).map") && home.includes('kicker="YOUR WORK"'));
check("Employee queue keeps unavailable data neutral", home.includes("Your action queue is temporarily unavailable.") && home.includes("Loading your assigned actions…"));
check("Employee focus is derived from the first My Day obligation", home.includes("const firstMyDayItem = myDayData?.obligations[0]") && home.includes("firstMyDayItem?.title") && home.includes("firstMyDayItem?.detail"));
check("Employee focus refuses fixture fallback", home.includes("No tasks are shown until Staff Portal responds."));
check("Employee overview values come from the backend projection", home.includes("myDayData.obligations.length") && home.includes("myDayData.counts.assignedForms") && home.includes("myDayData.counts.unreadNotices") && home.includes("myDayData.counts.reviewsToAcknowledge"));
check("Employee module metrics remain permission filtered", home.includes('...(perm("forms")') && home.includes('...(perm("notifications")') && home.includes('...(perm("performance")'));
check("Unavailable employee metrics do not invent zero values", home.includes('value: myDayData ? String(myDayData.obligations.length) : "—"') && home.includes("Current information unavailable"));
check("Employee queue state is announced accessibly", home.includes('className="p-attention-list"') && home.includes('aria-busy={myDayState.status === "loading" || myDayState.status === "idle"}'));
check("Employee metric and static queue rows reflow without clipping", scenery.includes(".v3-overview-metrics.employee-metrics{grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}") && scenery.includes(".p-attention-static{display:flex") && scenery.includes("min-width:0"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
