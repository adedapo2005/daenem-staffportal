import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/experience/audit-presentation.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const contractModule = { exports: {} };
new Function("module", "exports", compiled)(
  contractModule,
  contractModule.exports,
);
const { auditPresentation, clientAuditPresentation } = contractModule.exports;

const record = {
  id: "AUD-102",
  module: "audit",
  company: "printing",
  title: "Expense evidence added",
  subtitle: "",
  status: "Recorded",
  owner: "Aminat Bello",
  due: "",
  amount: 0,
  fields: {
    Actor: "Daniel Obi",
    Action: "Evidence Added",
    Object: "Expense EXP-204",
    Result: "Recorded",
    Reason: "Receipt supplied",
    Before: "Evidence Missing",
    After: "Evidence Attached",
    Time: "09:42 AM",
    Severity: "High",
  },
  evidence: [],
  history: [],
};

const checks = [];
function check(name, run) {
  run();
  checks.push(name);
}

check("unlabelled fixture never claims formal provenance", () => {
  assert.equal(
    auditPresentation(record, "audit", true).provenance,
    "Client Demonstration Fixture",
  );
});

check("formal audit provenance requires an explicit source field", () => {
  assert.equal(
    auditPresentation(
      { ...record, fields: { ...record.fields, Provenance: "Formal Audit" } },
      "audit",
      true,
    ).provenance,
    "Formal Audit Record",
  );
});

check("formal security provenance requires matching record kind", () => {
  const formalSecurity = {
    ...record,
    fields: { ...record.fields, Provenance: "Formal Security" },
  };
  assert.equal(
    auditPresentation(formalSecurity, "security", true).provenance,
    "Formal Security Record",
  );
  assert.equal(
    auditPresentation(formalSecurity, "audit", true).provenance,
    "Client Demonstration Fixture",
  );
});

check("reason and before-after context use recorded fields", () => {
  const presentation = auditPresentation(record, "audit", true);
  assert.equal(presentation.reason, "Receipt supplied");
  assert.equal(presentation.before, "Evidence Missing");
  assert.equal(presentation.after, "Evidence Attached");
});

check("recorded 12-hour time is preserved", () => {
  assert.equal(auditPresentation(record, "audit", true).time, "09:42 AM");
});

check("missing time fails closed", () => {
  const noTime = {
    ...record,
    fields: { Action: "Viewed" },
    history: [],
  };
  assert.equal(
    auditPresentation(noTime, "audit", true).time,
    "Time Unavailable",
  );
});

check("risk is absent without explicit investigation authority", () => {
  assert.equal(auditPresentation(record, "security", false).risk, undefined);
});

check("authorized risk uses only the projected record field", () => {
  assert.equal(auditPresentation(record, "security", true).risk, "High");
});

const localEvent = {
  id: "local-1",
  type: "security",
  action: "Demo Device Revoked",
  actor: "Owner",
  company: "group",
  target: "security:device-1",
  time: "2026-10-03T09:42:00.000Z",
  session: "demo-owner",
  correlation: "local-1",
  before: "Trusted",
  after: "Revoked",
  reason: "User requested",
  device: "Browser-local simulation",
  ip: "Not collected",
};

check("local activity is always labelled client telemetry", () => {
  const presentation = clientAuditPresentation(localEvent);
  assert.equal(presentation.provenance, "Client Telemetry");
  assert.equal(presentation.category, "Security Activity");
});

check("local activity preserves explicit decision context", () => {
  const presentation = clientAuditPresentation(localEvent);
  assert.equal(presentation.reason, "User requested");
  assert.equal(presentation.before, "Trusted");
  assert.equal(presentation.after, "Revoked");
});

const workspaceSource = readFileSync(
  new URL("../app/experience/workspaces.tsx", import.meta.url),
  "utf8",
);

check("audit stream does not fabricate timestamp cells", () => {
  assert.doesNotMatch(workspaceSource, /\["09:42", "09:28", "08:51"\]/);
});

check("security risk counts are derived from authorized presentations", () => {
  assert.doesNotMatch(workspaceSource, /\[0, 1, 0, 1, 0, 0, 0, 0, 1\]/);
  assert.match(workspaceSource, /canAct\(m, session, "investigate"\)/);
});

const enterpriseSource = readFileSync(
  new URL("../app/experience/enterprise-v3.tsx", import.meta.url),
  "utf8",
);

check("main audit workspace labels local events as client telemetry", () => {
  assert.match(enterpriseSource, /Client Telemetry, Clearly Labelled/);
  assert.match(enterpriseSource, /clientAuditPresentation\(e\)/);
  assert.doesNotMatch(enterpriseSource, /Append-only local event stream/);
});

check("main audit workspace renders deliberate before-after context", () => {
  assert.match(enterpriseSource, /<dt>Before<\/dt>/);
  assert.match(enterpriseSource, /<dt>After<\/dt>/);
  assert.match(enterpriseSource, /<dt>Reason<\/dt>/);
});

check("formal audit stream uses a selected master-detail workspace", () => {
  assert.match(workspaceSource, /className="p-audit-workspace"/);
  assert.match(workspaceSource, /aria-pressed=\{selectedAuditId === row\.id\}/);
  assert.match(workspaceSource, /title=\{selectedAudit \? "Event Detail" : "Select An Event"\}/);
});

check("event detail exposes only projected presentation fields", () => {
  for (const field of ["action", "provenance", "actor", "object", "result", "time", "reason", "before", "after", "risk"]) {
    assert.match(workspaceSource, new RegExp(`selectedAudit\\.detail\\.${field}`));
  }
});

check("risk detail remains absent without investigation authority", () => {
  assert.match(workspaceSource, /m\.kind === "security" && canAct\(m, session, "investigate"\)/);
  assert.match(workspaceSource, /selectedAudit\.detail\.risk &&/);
});

check("record timeline uses only the selected authorized record history", () => {
  assert.match(workspaceSource, /selectedAudit\.row\.history\.map/);
  assert.doesNotMatch(workspaceSource, /auditLog\.map/);
});

check("mobile audit flow provides an explicit back action", () => {
  assert.match(workspaceSource, /Back To Audit List/);
  assert.match(workspaceSource, /setSelectedAuditId\(""\)/);
});

const portalCss = readFileSync(
  new URL("../app/experience/portal.css", import.meta.url),
  "utf8",
);

check("audit workspace reflows to intentional mobile list-detail states", () => {
  assert.match(portalCss, /\.p-audit-workspace\{display:grid/);
  assert.match(portalCss, /data-record-open="true"/);
  assert.match(portalCss, /data-record-open="false"/);
});

check("audit selection and keyboard focus stay visible", () => {
  assert.match(portalCss, /\.p-audit-stream>button\.selected/);
  assert.match(portalCss, /\.p-audit-stream>button:focus-visible/);
});

console.log(
  "Audit presentation truth: " +
    checks.length +
    "/" +
    checks.length +
    " PASS",
);
