import type { RecordData } from "./model";
import type { AuditEvent } from "./security-contract";

export type AuditProvenance =
  | "Formal Audit Record"
  | "Formal Security Record"
  | "Client Telemetry"
  | "Client Demonstration Fixture";

export type AuditPresentation = {
  action: string;
  actor: string;
  after?: string;
  before?: string;
  object: string;
  provenance: AuditProvenance;
  reason?: string;
  result: string;
  risk?: string;
  time: string;
};

export type ClientAuditPresentation = {
  action: string;
  actor: string;
  after?: string;
  before?: string;
  category: "Business Activity" | "Security Activity";
  correlation?: string;
  object: string;
  provenance: "Client Telemetry";
  reason?: string;
  session?: string;
  time: string;
};

const firstRecorded = (
  fields: Record<string, string>,
  labels: string[],
): string | undefined => {
  for (const label of labels) {
    const value = fields[label]?.trim();
    if (value) return value;
  }
  return undefined;
};

export function auditProvenance(
  kind: string,
  recordedProvenance?: string,
): AuditProvenance {
  if (recordedProvenance === "Client Telemetry") return "Client Telemetry";
  if (kind === "audit" && recordedProvenance === "Formal Audit") {
    return "Formal Audit Record";
  }
  if (kind === "security" && recordedProvenance === "Formal Security") {
    return "Formal Security Record";
  }
  return "Client Demonstration Fixture";
}

export function auditPresentation(
  record: RecordData,
  kind: string,
  allowSecurityRisk: boolean,
): AuditPresentation {
  const fields = record.fields;
  const recordedTime = firstRecorded(fields, [
    "Time",
    "Recorded At",
    "Occurred At",
    "Created At",
  ]);
  const historyTime = record.history.find((entry) => entry.time?.trim())?.time;

  return {
    action: firstRecorded(fields, ["Action", "Event", "Activity"]) || record.title,
    actor: firstRecorded(fields, ["Actor", "Performed By", "User"]) || record.owner,
    after: firstRecorded(fields, ["After", "New Value"]),
    before: firstRecorded(fields, ["Before", "Previous Value"]),
    object: firstRecorded(fields, ["Object", "Resource", "Record"]) || record.id,
    provenance: auditProvenance(kind, firstRecorded(fields, ["Provenance", "Source Type"])),
    reason: firstRecorded(fields, ["Reason", "Decision Reason", "Review Notes"]),
    result: firstRecorded(fields, ["Result", "Outcome"]) || record.status,
    risk: allowSecurityRisk
      ? firstRecorded(fields, ["Risk", "Risk Level", "Severity"])
      : undefined,
    time: recordedTime || historyTime || "Time Unavailable",
  };
}

/** Browser-local events are telemetry, never formal audit or security records. */
export function clientAuditPresentation(
  event: AuditEvent,
): ClientAuditPresentation {
  return {
    action: event.action || "Record Activity",
    actor: event.actor || "Restricted",
    after: event.after || undefined,
    before: event.before || undefined,
    category:
      event.type === "security" ? "Security Activity" : "Business Activity",
    correlation: event.correlation || undefined,
    object: event.target || "Restricted Record",
    provenance: "Client Telemetry",
    reason: event.reason || undefined,
    session: event.session || undefined,
    time: event.time,
  };
}
