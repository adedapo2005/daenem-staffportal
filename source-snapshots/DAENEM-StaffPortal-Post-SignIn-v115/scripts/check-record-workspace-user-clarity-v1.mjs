import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("app/experience/record-workspace.tsx", "utf8");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("record list heading uses plain availability wording", workspace.includes("Available {recordNoun}s"));
check("record search name is plain and specific", workspace.includes("Search {recordNoun}s"));
check("live result count avoids permission architecture terms", workspace.includes("available.") && !workspace.includes("authorized {recordNoun.toLowerCase()}"));
check("empty result copy names filters without revealing other records", workspace.includes("No ${recordNoun}s Found") && workspace.includes("match your current filters."));
check("empty detail copy avoids authorization jargon", workspace.includes("Choose a ${recordNoun.toLowerCase()} to open its workspace."));
check("document guidance uses ordinary evidence wording", workspace.includes("review the attached evidence."));
check("approval guidance uses ordinary record wording", workspace.includes("Available approval actions remain in the full record."));
check("permission checks remain intact behind the plain copy", workspace.includes('canAct(module, session, "approve")') && workspace.includes('canRecordAct(selected, module, session, "approve")'));
check("record projection remains supplied by the parent workspace", workspace.includes("rows: RecordData[]") && workspace.includes("const filtered = useMemo"));
check("ordinary record copy contains no scope or permission architecture jargon", !workspace.includes("authorized scope") && !workspace.includes("permission-composed") && !workspace.includes("full governed record"));

console.log(`Record Workspace user clarity: ${checks.length}/${checks.length} PASS`);
