import type { RecordData, Session } from "./model";
import { formatRecordDateTime12 } from "./time-standard";

export type CommunicationReplyState =
  | "waiting_for_staff"
  | "no_staff_reply_due"
  | "unknown";

export type CommunicationReplyTruth = {
  state: CommunicationReplyState;
  awaitingStaffReply: boolean | null;
  lastStaffReplyAt: string | null;
};

/**
 * Use only the permission-composed server projection. Unread state, provider
 * delivery receipts and mutable record timestamps are deliberately excluded.
 */
export function communicationReplyTruth(
  record: Pick<RecordData, "communicationProjection">,
): CommunicationReplyTruth {
  const projection = record.communicationProjection;
  if (!projection || typeof projection.awaitingStaffReply !== "boolean") {
    return {
      state: "unknown",
      awaitingStaffReply: null,
      lastStaffReplyAt: null,
    };
  }
  const lastStaffReplyAt =
    typeof projection.lastStaffReplyAt === "string" &&
    Number.isFinite(Date.parse(projection.lastStaffReplyAt))
      ? projection.lastStaffReplyAt
      : null;
  return {
    state: projection.awaitingStaffReply
      ? "waiting_for_staff"
      : "no_staff_reply_due",
    awaitingStaffReply: projection.awaitingStaffReply,
    lastStaffReplyAt,
  };
}

export function formatStaffReplyAt(value: string | null, session: Session) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  return formatRecordDateTime12(timestamp, session);
}
