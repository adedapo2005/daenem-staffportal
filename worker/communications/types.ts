/** Backend-only integration contracts. */
export const APPLICATION = 'daenem-staffportal' as const;
export type Channel = 'whatsapp' | 'email' | 'in_app' | 'push';
export type Module = 'identity' | 'hr' | 'support' | 'operations' | 'finance';
export type Action = 'create' | 'generate' | 'approve' | 'send' | 'manage';
export type Mode = 'manual' | 'automatic';
export type MessageCategory = 'authentication' | 'utility' | 'marketing' | 'service';
export interface Scope {
  application: typeof APPLICATION;
  organizationId: string;
  companyId: string;
}
export interface EventDefinition {
  id: string;
  module: Module;
  domainPermission: string;
  category: MessageCategory;
  sensitivity: 'routine' | 'confidential_notice' | 'authentication';
  aiAllowed: boolean;
  autoSendEligible: boolean;
  requiresHumanApproval: boolean;
  placeholders: readonly string[];
  description: string;
}
export interface PolicyRule {
  enabled: boolean;
  aiEnabled: boolean;
  autoGenerate: boolean;
  autoSend: boolean;
  requireHumanApproval: boolean;
  channels: readonly Channel[];
  languages: readonly string[];
  maxCharacters: number;
}
export interface PolicySnapshot {
  scope: Scope;
  eventId: string;
  revision: string;
  validUntilMs: number;
  global: PolicyRule;
  organization: PolicyRule;
  module: PolicyRule;
  useCase: PolicyRule;
  restrictions: readonly PolicyRule[];
}
export interface EffectivePolicy {
  enabled: boolean;
  aiEnabled: boolean;
  autoGenerate: boolean;
  autoSend: boolean;
  requireHumanApproval: boolean;
  maxCharacters: number;
  channels: readonly Channel[];
  languages: readonly string[];
}
export interface Authorization {
  hasPermission(actorId: string, scope: Scope, permission: string, minimum: 'view' | 'create' | 'approve' | 'manage'): boolean;
  canReadSource(actorId: string, scope: Scope, recordId: string, revision: string): boolean;
}
export interface EnvironmentBoundary {
  application: typeof APPLICATION;
  targets: readonly { organizationId: string; companyId: string }[];
  killSwitch: boolean;
}
export interface RequestContext {
  scope: Scope;
  actorId: string;
  eventId: string;
  channel: Channel;
  language: string;
  sourceRecordId: string;
  sourceRevision: string;
}
export interface DeliveryIntent extends RequestContext {
  id: string;
  revision: number;
  authorId: string;
  recipientRef: string;
  recipientContactRevision: string;
  senderRef: string;
  templateRef: string;
  templateRevision: string;
  templateCategory: MessageCategory;
  policyRevision: string;
  body: string;
  contentOrigin: 'deterministic' | 'human' | 'ai';
  expiresAtMs: number;
}
export interface TemplateState {
  scope: Scope;
  ref: string;
  revision: string;
  language: string;
  category: MessageCategory;
  internallyApproved: boolean;
  providerApproved: boolean;
  enabled: boolean;
}
export interface RecipientState {
  scope: Scope;
  ref: string;
  contactRevision: string;
  verified: boolean;
  active: boolean;
  optedInEventIds: readonly string[];
  optedOut: boolean;
  lastInboundAtMs?: number;
}
export interface SenderState {
  scope: Scope;
  ref: string;
  active: boolean;
  allowedEventIds: readonly string[];
}
export interface ApprovalRecord {
  intentId: string;
  digest: string;
  scope: Scope;
  approverId: string;
  approvedAtMs: number;
  expiresAtMs: number;
}
export interface Decision {
  allowed: boolean;
  reason: string;
}
export class CommunicationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CommunicationError';
  }
}
export function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CommunicationError(code);
}
export function sameScope(a: Scope, b: Scope): boolean {
  return a.application === b.application &&
    a.organizationId === b.organizationId &&
    a.companyId === b.companyId;
}
export function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
