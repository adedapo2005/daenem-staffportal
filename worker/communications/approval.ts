import { eventById } from './catalog.js';
import { authorize } from './policy.js';
import { requireCondition, sameScope } from './types.js';
import type { ApprovalRecord, Authorization, DeliveryIntent, EnvironmentBoundary, Mode, PolicySnapshot, RecipientState, SenderState, TemplateState } from './types.js';

export async function intentDigest(intent: DeliveryIntent): Promise<string> {
  const canonical = JSON.stringify([
    intent.scope.application, intent.scope.organizationId, intent.scope.companyId,
    intent.id, intent.revision, intent.authorId, intent.eventId, intent.channel,
    intent.language, intent.recipientRef, intent.recipientContactRevision,
    intent.senderRef, intent.templateRef, intent.templateRevision,
    intent.templateCategory, intent.policyRevision, intent.sourceRecordId,
    intent.sourceRevision, intent.body, intent.contentOrigin, intent.expiresAtMs,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

export async function approveIntent(
  intent: DeliveryIntent,
  approverId: string,
  policy: PolicySnapshot,
  boundary: EnvironmentBoundary,
  authz: Authorization,
  nowMs: number,
): Promise<ApprovalRecord> {
  requireCondition(eventById(intent.eventId).category !== 'authentication', 'USE_IDENTITY_PATH');
  requireCondition(approverId !== intent.authorId, 'SELF_APPROVAL_DENIED');
  requireCondition(intent.policyRevision === policy.revision, 'POLICY_CHANGED');
  authorize({ ...intent, actorId:approverId }, 'approve', policy, boundary, authz, nowMs);
  requireCondition(Number.isFinite(intent.expiresAtMs) && nowMs < intent.expiresAtMs, 'INTENT_EXPIRED');
  return {
    intentId:intent.id,
    digest:await intentDigest(intent),
    scope:{ ...intent.scope },
    approverId,
    approvedAtMs:nowMs,
    expiresAtMs:Math.min(intent.expiresAtMs, policy.validUntilMs, nowMs + 86_400_000),
  };
}

export interface DispatchGateInput {
  intent: DeliveryIntent;
  policy: PolicySnapshot;
  boundary: EnvironmentBoundary;
  authz: Authorization;
  recipient: RecipientState;
  sender: SenderState;
  template: TemplateState;
  approval?: ApprovalRecord;
  mode: Mode;
  capacityReserved: boolean;
  inQuietHours: boolean;
  nowMs: number;
}

export async function assertDispatchAllowed(input: DispatchGateInput): Promise<void> {
  const { intent, policy, boundary, authz, recipient, sender, template, approval, nowMs, mode } = input;
  const event = eventById(intent.eventId);
  requireCondition(event.category !== 'authentication', 'USE_IDENTITY_PATH');
  const effective = authorize(intent, 'send', policy, boundary, authz, nowMs);
  requireCondition(intent.policyRevision === policy.revision, 'POLICY_CHANGED');
  requireCondition(Number.isSafeInteger(intent.revision) && intent.revision > 0, 'INVALID_INTENT_REVISION');
  requireCondition(Number.isFinite(intent.expiresAtMs) && nowMs < intent.expiresAtMs, 'INTENT_EXPIRED');
  requireCondition(['deterministic','human','ai'].includes(intent.contentOrigin), 'UNKNOWN_CONTENT_ORIGIN');
  requireCondition(intent.body.trim().length > 0 && intent.body.length <= effective.maxCharacters, 'INVALID_CONTENT_LENGTH');
  requireCondition(
    sameScope(intent.scope, recipient.scope) &&
    sameScope(intent.scope, sender.scope) &&
    sameScope(intent.scope, template.scope),
    'DELIVERY_SCOPE_MISMATCH',
  );
  requireCondition(
    recipient.ref === intent.recipientRef &&
    recipient.contactRevision === intent.recipientContactRevision &&
    recipient.verified && recipient.active,
    'RECIPIENT_CHANGED_OR_UNVERIFIED',
  );
  requireCondition(!recipient.optedOut && recipient.optedInEventIds.includes(intent.eventId), 'CONSENT_REQUIRED');
  requireCondition(
    sender.ref === intent.senderRef &&
    sender.active &&
    sender.allowedEventIds.includes(intent.eventId),
    'SENDER_NOT_AUTHORIZED',
  );
  requireCondition(
    template.ref === intent.templateRef &&
    template.revision === intent.templateRevision &&
    template.category === event.category &&
    template.category === intent.templateCategory &&
    template.language === intent.language &&
    template.enabled &&
    template.internallyApproved,
    'TEMPLATE_NOT_APPROVED',
  );
  if (intent.channel === 'whatsapp') {
    if (event.category === 'service') {
      requireCondition(
        Number.isFinite(recipient.lastInboundAtMs) &&
        recipient.lastInboundAtMs! <= nowMs &&
        nowMs - recipient.lastInboundAtMs! < 86_400_000,
        'SERVICE_WINDOW_CLOSED',
      );
    } else {
      requireCondition(template.providerApproved, 'PROVIDER_TEMPLATE_NOT_APPROVED');
    }
  }
  requireCondition(input.capacityReserved, 'BUDGET_OR_RATE_LIMIT');
  requireCondition(!input.inQuietHours, 'QUIET_HOURS');
  if (mode === 'automatic') {
    requireCondition(event.autoSendEligible && effective.autoSend, 'AUTO_SEND_DISABLED');
    requireCondition(intent.contentOrigin === 'deterministic', 'AI_OR_FREEFORM_AUTO_SEND_DENIED');
  }
  const needsApproval =
    event.requiresHumanApproval ||
    effective.requireHumanApproval ||
    intent.contentOrigin === 'ai';
  if (needsApproval) {
    requireCondition(
      approval &&
      sameScope(approval.scope, intent.scope) &&
      approval.intentId === intent.id &&
      approval.approvedAtMs <= nowMs &&
      Number.isFinite(approval.expiresAtMs) &&
      nowMs < approval.expiresAtMs &&
      approval.approverId !== intent.authorId,
      'HUMAN_APPROVAL_REQUIRED',
    );
    requireCondition(approval.digest === await intentDigest(intent), 'APPROVAL_INVALIDATED');
    authorize({ ...intent, actorId:approval.approverId }, 'approve', policy, boundary, authz, nowMs);
  }
}
