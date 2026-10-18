import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const authority = read("app/experience/time-standard.ts");
const model = read("app/experience/model.ts");
const profiles = read("app/experience/security-contract.ts");
const portal = read("app/experience/Portal.tsx");
const attendance = read("app/experience/attendance-v3.tsx");
const forms = read("app/experience/smart-forms.tsx");
const collaboration = read("app/experience/collaboration-desk.tsx");
const studios = read("app/experience/studios.tsx");
const technology = read("app/experience/technology.tsx");
const legacyWorkspaces = read("app/experience/workspaces.tsx");
const communicationTruth = read("app/experience/communications-truth.ts");
const enterpriseOperations = read("app/experience/enterprise-operations.tsx");
const enterpriseV3 = read("app/experience/enterprise-v3.tsx");
const renderedReview = read("app/review/viewports/page.tsx");

check("Session accepts a configured IANA presentation zone", model.includes("displayTimeZone?: string"));
check("Seed record history keeps canonical UTC ISO", model.includes("time: '2026-09-10T08:20:00.000Z'") && model.includes("time: '2026-09-11T07:15:00.000Z'") && !model.includes("time: '10 Sep 2026 · 09:20 AM'"));
check("Legacy saved record times re-enter the shared authority", authority.includes("Compatibility for device-local demo records") && authority.includes("zonedLocalToIso(") && authority.includes("LAGOS_TIME_ZONE"));
check("Authenticated authority resolves configured profile before browser", authority.indexOf("session.displayTimeZone") < authority.indexOf("browserTimeZone &&"));
check("Authenticated authority has a browser IANA fallback", authority.includes("resolvedOptions().timeZone"));
check("Authenticated authority has a Nigeria fallback", authority.includes("return LAGOS_TIME_ZONE"));
check("Legacy Owner sessions fall back to Nigeria before browser context", authority.indexOf('session.role === "Owner"') < authority.indexOf("browserTimeZone &&"));
check("Owner record authority names Nigeria and Eastern IANA zones", authority.includes("session.role === \"Owner\"") && authority.includes("NEW_YORK_TIME_ZONE"));
check("All shared human-visible clocks are 12-hour", authority.includes("hour12: true"));
check("Profiles can carry configured presentation zones", profiles.includes("displayTimeZone:"));
check("Top command clock uses the authenticated authority", portal.includes("resolveAuthenticatedTimeZone({") && portal.includes("displayTimeZone: session.displayTimeZone"));
check("Top command clock exposes its exact IANA zone", portal.includes("data-authenticated-time-primary=\"true\"") && portal.includes("data-time-zone={clockZone}"));
check("New record history keeps canonical ISO", portal.includes("time: new Date().toISOString()"));
check("Record history uses the Owner-aware presentation authority", portal.includes("formatRecordDateTime12(event.time, session)"));
check("Attendance uses the authenticated authority", attendance.includes("formatAuthenticatedTime12(day.clockInAt, session)"));
check("Device draft feedback uses the authenticated authority", forms.includes("formatAuthenticatedTime12(new Date(),session)"));
check("Conversation timestamps use the record authority", collaboration.includes("formatRecordDateTime12(message.time, session)"));
check("Workspace preference history uses the record authority", studios.includes("formatRecordDateTime12(new Date(), session)"));
check("Authenticated location weather uses the shared 12-hour formatter", technology.includes("formatTime12(now,LAGOS_TIME_ZONE)"));
check("Legacy attendance feedback uses the authenticated authority", legacyWorkspaces.includes("formatAuthenticatedTime12(new Date(), session)"));
check("Communications reply truth uses the shared record authority", communicationTruth.includes("formatRecordDateTime12(timestamp, session)") && enterpriseOperations.includes("replyTruth.lastStaffReplyAt,\n            session,"));
check("Client telemetry uses the shared record authority", enterpriseV3.includes("formatRecordDateTime12(item.time,session)") && enterpriseV3.includes("formatRecordDateTime12(detail.time,session)"));
check("Authenticated time consumers no longer stamp a local WAT suffix", !legacyWorkspaces.includes(' + " WAT · Demo"'));
check("Rendered review includes authenticated-time across the closure matrix", renderedReview.includes('| "authenticated-time"') && renderedReview.includes('"authenticated-time": "/expenses/EXP-2048"') && renderedReview.includes('config.target === "authenticated-time"'));
check("Rendered review asserts profile zone, AM/PM and Owner dual-zone truth", renderedReview.includes('data-authenticated-time-primary="true"') && renderedReview.includes('"America/Toronto" : "Africa/Lagos"') && renderedReview.includes('Sep 10, 2026, 9:20 AM · Africa/Lagos | Sep 10, 2026, 4:20 AM · America/New_York'));
check("Rendered review guards unauthorized time-record disclosure", renderedReview.includes("ZERO_DISCLOSURE_AUTHENTICATED_TIME_RECORD_LEAK"));
check("Rendered review accepts field-projected Employee history without inventing timestamps", renderedReview.includes('config.profile === "Employee"') && renderedReview.includes("renderedTimes.length === 0 || renderedTimes.length === 2"));
check("Rendered review waits for the History tab commit before sampling", renderedReview.includes("let historyReady = false") && renderedReview.includes('selectedHistoryTab?.getAttribute("aria-selected") === "true"'));
check("Rendered review validates the compact primary clock without relying on zone-label whitespace", renderedReview.includes('/\\d{1,2}:\\d{2}\\s(?:AM|PM)/.test(primaryClock?.textContent'));

const format = (iso, zone) => new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}).format(new Date(iso));

check("New York winter offset is DST-correct", format("2026-01-01T14:05:00Z", "America/New_York") === "9:05 AM");
check("New York summer offset is DST-correct", format("2026-07-01T14:05:00Z", "America/New_York") === "10:05 AM");
check("Lagos presentation remains UTC+1", format("2026-01-01T08:05:00Z", "Africa/Lagos") === "9:05 AM");

for (const result of checks) {
  console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
}
const failed = checks.filter((result) => !result.pass);
console.log(`${checks.length - failed.length}/${checks.length} authenticated-time checks passed.`);
if (failed.length) process.exit(1);
