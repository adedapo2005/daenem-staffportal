import { eventById } from './catalog.js';
import { APPLICATION, CommunicationError, requireCondition, sameScope, isNonEmpty } from './types.js';
import type {
  Action, Authorization, Decision, EffectivePolicy, EnvironmentBoundary,
  PolicyRule, PolicySnapshot, RequestContext, Scope,
} from './types.js';

export const DISABLED_RULE: Readonly<PolicyRule> = Object.freeze({
  enabled:false, aiEnabled:false, autoGenerate:false, autoSend:false,
  requireHumanApproval:true, channels:Object.freeze([]), languages:Object.freeze([]), maxCharacters:1000,
});

export function checkBoundary(scope: Scope, boundary: EnvironmentBoundary): void {
  requireCondition(scope.application === APPLICATION && boundary.application === APPLICATION, 'WRONG_APPLICATION');
  requireCondition(!boundary.killSwitch, 'COMMUNICATIONS_STOPPED');
  requireCondition(isNonEmpty(scope.organizationId) && isNonEmpty(scope.companyId), 'INVALID_SCOPE');
  requireCondition(
    boundary.targets.some(target => target.organizationId === scope.organizationId && target.companyId === scope.companyId),
    'TARGET_NOT_ALLOWLISTED',
  );
}

export function effectivePolicy(policy: PolicySnapshot, nowMs: number): EffectivePolicy {
  requireCondition(
    isNonEmpty(policy.revision) && Number.isFinite(nowMs) &&
    Number.isFinite(policy.validUntilMs) && nowMs < policy.validUntilMs,
    'STALE_POLICY',
  );
  const rules = [policy.global, policy.organization, policy.module, policy.useCase, ...policy.restrictions];
  for (const rule of rules) {
    requireCondition(
      rule && ['enabled','aiEnabled','autoGenerate','autoSend','requireHumanApproval'].every(
        key => typeof (rule as unknown as Record<string, unknown>)[key] === 'boolean',
      ) && Array.isArray(rule.channels) && Array.isArray(rule.languages) &&
      Number.isSafeInteger(rule.maxCharacters) && rule.maxCharacters >= 1 && rule.maxCharacters <= 4000,
      'INVALID_POLICY',
    );
  }
  const intersect = <T>(lists: readonly (readonly T[])[]): T[] =>
    [...new Set(lists[0] ?? [])].filter(value => lists.every(list => list.includes(value)));
  return {
    enabled: rules.every(rule => rule.enabled),
    aiEnabled: rules.every(rule => rule.aiEnabled),
    autoGenerate: rules.every(rule => rule.autoGenerate),
    autoSend: rules.every(rule => rule.autoSend),
    requireHumanApproval: rules.some(rule => rule.requireHumanApproval),
    channels: intersect(rules.map(rule => rule.channels)),
    languages: intersect(rules.map(rule => rule.languages)),
    maxCharacters: Math.min(...rules.map(rule => rule.maxCharacters)),
  };
}
export function authorize(
  ctx: RequestContext,
  action: Action,
  policy: PolicySnapshot,
  boundary: EnvironmentBoundary,
  authz: Authorization,
  nowMs: number,
): EffectivePolicy {
  checkBoundary(ctx.scope, boundary);
  requireCondition(sameScope(ctx.scope, policy.scope) && ctx.eventId === policy.eventId, 'POLICY_SCOPE_MISMATCH');
  const event = eventById(ctx.eventId);
  const result = effectivePolicy(policy, nowMs);
  requireCondition(result.enabled, 'USE_CASE_DISABLED');
  requireCondition(result.channels.includes(ctx.channel), 'CHANNEL_DISABLED');
  requireCondition(result.languages.includes(ctx.language), 'LANGUAGE_DISABLED');
  requireCondition(isNonEmpty(ctx.actorId) && isNonEmpty(ctx.sourceRecordId) && isNonEmpty(ctx.sourceRevision), 'MISSING_SERVER_CONTEXT');
  requireCondition(
    authz.hasPermission(ctx.actorId, ctx.scope, event.domainPermission, 'view') &&
    authz.canReadSource(ctx.actorId, ctx.scope, ctx.sourceRecordId, ctx.sourceRevision),
    'SOURCE_NOT_AUTHORIZED',
  );
  const requiredLevel = action === 'approve' ? 'approve' : action === 'manage' ? 'manage' : 'create';
  requireCondition(
    authz.hasPermission(ctx.actorId, ctx.scope, `communications.${event.module}.${action}`, requiredLevel),
    'ACTION_NOT_AUTHORIZED',
  );
  if (action === 'generate') {
    requireCondition(result.aiEnabled && event.aiAllowed && event.category !== 'authentication', 'AI_NOT_ALLOWED');
  }
  return result;
}

export function decision(work: () => void): Decision {
  try { work(); return { allowed:true, reason:'ALLOWED' }; }
  catch (error) {
    if (error instanceof CommunicationError) return { allowed:false, reason:error.code };
    return { allowed:false, reason:'DEPENDENCY_FAILURE' };
  }
}
