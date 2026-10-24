/**
 * Authoritative Facilities work-order lifecycle guard.
 *
 * UI controls are not an authorization boundary. A caller can submit any
 * status directly to the Worker, so every transition must be validated here.
 * Verified/cancelled orders remain terminal to protect historical D1 evidence.
 */
export const WORK_ORDER_STATUSES = [
  'reported','triaged','awaiting_approval','approved','in_progress',
  'blocked','completed','verified','cancelled',
] as const;

export type WorkOrderStatus = typeof WORK_ORDER_STATUSES[number];
export type WorkOrderEventType =
  | 'status' | 'approval' | 'completed' | 'verified' | 'cancelled';

export type WorkOrderTransitionResult =
  | { ok: true; status: WorkOrderStatus; eventType: WorkOrderEventType }
  | { ok: false; statusCode: 400 | 403 | 409; error: string };

export function validateWorkOrderTransition(
  current: string,
  requested: string,
  canApprove: boolean,
): WorkOrderTransitionResult {
  if (!WORK_ORDER_STATUSES.some(status => status === requested)) {
    return { ok: false, statusCode: 400, error: 'Invalid maintenance status.' };
  }

  if (current === 'verified' || current === 'cancelled') {
    return { ok: false, statusCode: 409, error: 'This work order is closed and cannot be changed.' };
  }

  // Approving a request must be a deliberate, audited step. Neither an editor
  // nor an approver may skip straight from pending review into execution.
  if (current === 'awaiting_approval' && requested !== current &&
      requested !== 'approved' && requested !== 'cancelled') {
    return { ok: false, statusCode: 409, error: 'Approve or cancel this work order before changing its status.' };
  }

  if (requested === 'approved' && requested !== current && current !== 'awaiting_approval') {
    return { ok: false, statusCode: 409, error: 'Only a pending approval can be approved.' };
  }

  if (requested === 'verified' && current !== 'completed') {
    return { ok: false, statusCode: 409, error: 'Complete the work order before verification.' };
  }

  // A completed order may be verified or re-opened for correction only by
  // an approver; it must never be silently reset to reported/triaged/blocked.
  if (current === 'completed' && requested !== current &&
      requested !== 'verified' && !(requested === 'in_progress' && canApprove)) {
    return { ok: false, statusCode: 409, error: 'Completed work orders require an approved correction or verification.' };
  }

  if ((requested === 'approved' || requested === 'verified' || requested === 'cancelled') &&
      requested !== current && !canApprove) {
    return { ok: false, statusCode: 403, error: 'Approve Facilities permission is required for this status.' };
  }

  if (current === 'completed' && requested === 'in_progress' && !canApprove) {
    return { ok: false, statusCode: 403, error: 'Approve Facilities permission is required to reopen completed work.' };
  }

  const eventType: WorkOrderEventType =
    requested === current ? 'status' :
    requested === 'approved' ? 'approval' :
    requested === 'completed' ? 'completed' :
    requested === 'verified' ? 'verified' :
    requested === 'cancelled' ? 'cancelled' : 'status';

  return { ok: true, status: requested as WorkOrderStatus, eventType };
}
