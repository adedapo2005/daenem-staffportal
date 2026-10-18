import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const css = read("app/experience/navigation-v24.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const searchStart = portal.indexOf('data-ai-search-contract="authorized-projection-v2"');
const searchEnd = portal.indexOf("</CommandRoot>", searchStart);
const search = portal.slice(searchStart, searchEnd);

check("AI Search has one explicit authorized projection contract", searchStart > 0 && (portal.match(/data-ai-search-contract="authorized-projection-v2"/g) || []).length === 1);
check("Search terms begin with authorized modules", portal.includes("...allowed.flatMap((item) => [item.title, item.family])"));
check("Record terms begin with authorized records", portal.includes("...allowedRows.flatMap((row) => [row.title, row.id])"));
check("Studio terms require studio access", portal.includes("...(studioAccess") && portal.includes("studioNavigationFor(session)"));
check("Search input is controlled without writing predictions into it", search.includes("value={commandQuery}") && search.includes("onValueChange={(value) =>"));
check("Ghost completion renders separately from the input", search.includes('className="p-ai-ghost-text"') && search.includes("{commandPredictionSuffix}"));
check("Ghost completion is hidden from assistive technology", search.includes('aria-hidden="true"') && search.includes("p-ai-ghost-text"));
check("Prediction never appears for one-character queries", portal.includes("normalizedCommandQuery.length >= 2"));
check("Prediction must prefix-match an authorized term", portal.includes("normalizedValue.startsWith(normalizedCommandQuery)"));
check("Tab explicitly accepts prediction", search.includes('event.key === "Tab" && commandPrediction') && search.includes("event.preventDefault()"));
check("A visible explicit action also accepts prediction", search.includes('aria-label={`Accept prediction ${commandPrediction}`}') && search.includes("setCommandQuery(commandPrediction)"));
check("Typing begins a bounded state sequence", search.includes('setAiSearchState(value.trim() ? "typing" : "idle")') && portal.includes('setAiSearchState("searching")'));
check("Search exposes reasoning and result-ready states", portal.includes('setAiSearchState("reasoning")') && portal.includes('"result-ready"'));
check("Result-ready requires an authorized match", portal.includes('hasAuthorizedSearchMatch ? "result-ready" : "idle"'));
check("Offline and error states override assistance truthfully", portal.includes('mode === "Offline"') && portal.includes('mode === "Integration Unavailable"') && search.includes("local matching only"));
check("Ctrl or Command K remains the global shortcut", portal.includes('(e.metaKey || e.ctrlKey) && e.key === "k"'));
check("Closing search clears query and transient state", portal.includes('setCommandQuery("");') && portal.includes('setAiSearchState("idle");'));
check("Session changes clear projected search state", portal.includes("function changeSession") && portal.slice(portal.indexOf("function changeSession"), portal.indexOf("function open(")).includes('setCommandQuery("")'));
check("Rendered workspace suggestions use only allowed modules", search.includes("{allowed.map((a) => (") && search.includes('CommandGroup heading="Workspaces"'));
check("Rendered record suggestions use only categorized authorized projections", search.includes("{commandRecordRows.map((r) => (") && search.includes("{commandPeopleRows.map((row) => (") && search.includes("{commandJobRows.map((row) => (") && search.includes("{commandLogRows.map((row) => (") && search.includes('CommandGroup heading="Records"'));
check("Business area suggestions derive only from allowed modules", portal.includes("new Map(allowed.map((item) => [item.family, item]))") && search.includes('CommandGroup heading="Business Areas"'));
check("People jobs and logs derive only from authorized records", portal.includes("const commandPeopleRows = allowedRows.filter") && portal.includes("const commandJobRows = allowedRows.filter") && portal.includes("const commandLogRows = allowedRows.filter"));
check("Release search is permission gated and truthful", portal.includes("...(globalUtilityAccess") && search.includes('CommandGroup heading="Staff Portal Release"') && search.includes("CURRENT_SAVED_SITE_VERSION"));
check("Recent suggestions are re-resolved through allowed records", portal.includes("allowedRows.find((row) => `${row.module}:${row.id}` === ref)"));
check("Search guidance uses plain workplace language", search.includes("Suggestions match the work available to you.") && !search.includes("current role and company scope"));
check("Search input avoids permission-architecture wording", search.includes('placeholder="Search work areas, records or actions…"') && !search.includes("Search authorized modules"));
check("Business area actions stay plain and staff-facing", search.includes("Open a work area available to you") && !search.includes("Open An Authorized Workspace"));
check("Active search styling is blue or indigo, not semantic green", css.includes("background: #e9efff") && css.includes("color: #315ed6"));
check("Small screens preserve the full search surface", css.includes("@media (max-width: 560px)") && css.includes("width: calc(100vw - 1rem)"));
check("Reduced Motion disables search transitions", css.includes(".p-ai-ghost-text,") && css.includes("transition: none !important"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
