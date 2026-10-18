import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const operations = readFileSync(
  new URL("../app/experience/enterprise-operations.tsx", import.meta.url),
  "utf8",
);
const model = readFileSync(
  new URL("../app/experience/model.ts", import.meta.url),
  "utf8",
);

const checks = [
  ["generate capability is explicit", model.includes("'generateCommunication'")],
  ["governance capability is explicit", model.includes("'manageCommunications'")],
  ["allowed tabs derive from current session", operations.includes("const allowedTabs = communicationTabs.filter")],
  ["stale tabs fall back to an allowed tab", operations.includes("allowedTabs[0]?.[0]")],
  ["no-workspace state is neutral", operations.includes("No assigned communication workspace")],
  ["conversation counts require conversation access", operations.includes("canReadConversations &&")],
  ["provider state requires provider access", operations.includes("canReadProviderState &&")],
  ["provider state is truthful", operations.includes('value="UNAVAILABLE"')],
  ["AI generation checks capability", operations.includes('canAct(module, session, "generateCommunication")')],
  ["AI handler fails closed", operations.includes("if (!canGenerate) return;")],
  ["AI controls are absent without capability", operations.includes("{canGenerate && (")],
  ["conversation state resets across scope or permission changes", operations.includes("const workspaceStateKey =") && operations.includes("actionFingerprint") && operations.includes("rows.map((row) => row.id)")],
  ["filter changes clear stale draft context", operations.includes("const changeQueue = (value: string)") && operations.includes("resetComposer();")],
  ["reply editor is read-only without send capability", operations.includes("readOnly={!canSend}")],
  ["approval remains separately authorized", operations.includes('canAct(module, session, "approveCommunication")')],
  ["send remains separately authorized", operations.includes('canAct(module, session, "sendCommunication")')],
  ["hidden workflow action is not replaced by disabled control", operations.includes("(stage === 2 && canApprove)")],
  ["internal notes require edit access", /\{canNote && \(\s*<Panel title="Internal note">/.test(operations)],
  ["automation management is separately authorized", operations.includes('canAct(module, session, "manageCommunications")')],
  ["automation switch is absent without management", /\{canManage && \(\s*<button/.test(operations)],
  ["automation handler fails closed", operations.includes("const toggle = (id: string)") && operations.includes("if (!canManage) return;")],
  ["template lifecycle requires template management", operations.match(/canAct\(module, session, "manageTemplates"\)/g)?.length === 2],
  ["provider attachment no-op was removed", !operations.includes("<Paperclip size={16} /> Attachment")],
];

for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`Communications frontend contract: ${checks.length}/${checks.length} PASS`);
