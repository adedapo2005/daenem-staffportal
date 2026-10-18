import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const truth = read("app/experience/communications-truth.ts");
const operations = read("app/experience/enterprise-operations.tsx");
const fixtures = read("app/experience/enterprise-contract.ts");
const styles = read("app/experience/enterprise-operations.css");

const checks = [
  ["reply projection is optional", truth.includes("record.communicationProjection")],
  ["waiting state requires a server boolean", truth.includes('typeof projection.awaitingStaffReply !== "boolean"')],
  ["missing projection remains unknown", truth.includes('state: "unknown"')],
  ["waiting state uses awaitingStaffReply", truth.includes('? "waiting_for_staff"')],
  ["truth adapter never derives from unread", !truth.includes("fields.Unread") && !truth.includes("fields.unread")],
  ["truth adapter never derives from delivery receipts", !truth.includes("fields['Delivery State']") && !truth.includes("deliveryState")],
  ["truth adapter never reads mutable updatedAt", !truth.includes("updatedAt") && !truth.includes("updated_at")],
  ["invalid staff reply timestamps fail closed", truth.includes("Number.isFinite(Date.parse")],
  ["human time is explicitly 12-hour", truth.includes("hour12: true")],
  ["authorized metric counts reply projection only", operations.includes('label="Waiting For Staff"') && operations.includes('detail="Separate from unread"')],
  ["reply filter is distinct from queue and channel", operations.includes('label="Reply status"') && operations.includes('const [replyState, setReplyState]')],
  ["filter reset preserves scoped list behavior", operations.includes("const changeReplyState = (value: string)") && operations.includes('setSelected("")')],
  ["opening a conversation does not mutate reply truth", !operations.includes("setAwaitingStaffReply") && !operations.includes("markAnswered")],
  ["waiting copy is visible without promising alerts", operations.includes('tone="amber">Waiting For Staff</Badge>') && !operations.includes("assignment alert sent")],
  ["staff timestamp is presented only when source-valid", operations.includes("const lastStaffReplyAt = formatStaffReplyAt") && operations.includes("staffMessage = lastStaffReplyAt ?")],
  ["waiting fixture covers no prior staff reply", fixtures.includes("communicationProjection:{awaitingStaffReply:true,lastStaffReplyAt:null}")],
  ["read and reply state coexist independently", fixtures.includes("Unread:'2'") && fixtures.includes("awaitingStaffReply:false")],
  ["provider read receipt does not clear waiting fixture", fixtures.includes("'Delivery State':'Read'") && fixtures.includes("awaitingStaffReply:true")],
  ["hero metric labels and values keep explicit dark-surface contrast", styles.includes(".eo-hero .eo-hero-metrics .p-metric>span{color:#b9cce8}") && styles.includes(".eo-hero .eo-hero-metrics .p-metric>strong{color:#eef6ff}")],
];

for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`Communications Waiting For Staff truth: ${checks.length}/${checks.length} PASS`);
