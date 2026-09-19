import type { EventDefinition, Module, MessageCategory } from './types.js';
import { CommunicationError } from './types.js';

const event = (
  id: string,
  module: Module,
  domainPermission: string,
  description: string,
  options: Partial<Omit<EventDefinition, 'id' | 'module' | 'domainPermission' | 'description'>> = {},
): EventDefinition => Object.freeze({
  id,
  module,
  domainPermission,
  description,
  category: 'utility' as MessageCategory,
  sensitivity: 'routine' as const,
  aiAllowed: true,
  autoSendEligible: true,
  requiresHumanApproval: false,
  ...options,
  placeholders: Object.freeze([...(options.placeholders ?? ['first_name','organization_name','portal_link'])]),
});

export const EVENTS: readonly EventDefinition[] = Object.freeze([
  event('identity.signup_verification','identity','security.access','Verify a requested WhatsApp contact.',
    { category:'authentication', sensitivity:'authentication', aiAllowed:false, autoSendEligible:false, placeholders:['code'] }),
  event('identity.signin_verification','identity','security.access','Verify an eligible pending sign-in.',
    { category:'authentication', sensitivity:'authentication', aiAllowed:false, autoSendEligible:false, placeholders:['code'] }),
  event('identity.recovery_verification','identity','security.access','Verify password recovery through an enrolled contact.',
    { category:'authentication', sensitivity:'authentication', aiAllowed:false, autoSendEligible:false, placeholders:['code'] }),
  event('hr.onboarding.reminder','hr','hr.lifecycle','Reminder for an onboarding task; no identity document contents.'),
  event('hr.training.due','hr','hr.access','Training assignment reminder.',
    { placeholders:['first_name','organization_name','training_title','due_at','portal_link'] }),
  event('hr.attendance.incomplete','hr','attendance.access','Neutral incomplete attendance-record reminder.'),
  event('hr.shift.changed','hr','attendance.access','Notify an authorized schedule change.',
    { placeholders:['first_name','organization_name','shift_time','portal_link'] }),
  event('hr.leave.status_ready','hr','leave.admin','Neutral notice that a leave decision is available.',
    { sensitivity:'confidential_notice', aiAllowed:false, autoSendEligible:false, requiresHumanApproval:true }),
  event('hr.payroll.payslip_ready','hr','payroll.access','Neutral payslip availability notice.',
    { sensitivity:'confidential_notice', aiAllowed:false, autoSendEligible:false, requiresHumanApproval:true }),
  event('hr.review.meeting','hr','reviews.admin','Performance-review meeting reminder without scores or judgments.',
    { autoSendEligible:false, requiresHumanApproval:true, placeholders:['first_name','organization_name','meeting_time','portal_link'] }),
  event('hr.announcement','hr','broadcasts.access','Authorized workforce announcement.',
    { autoSendEligible:false, requiresHumanApproval:true }),
  event('hr.case.secure_notice','hr','hr.cases','Generic secure notice for a confidential HR case.',
    { sensitivity:'confidential_notice', aiAllowed:false, autoSendEligible:false, requiresHumanApproval:true }),
  event('support.case.update','support','support.access','Permission-scoped support update.'),
  event('support.reply','support','support.access','Human-reviewed support reply.',
    { category:'service', autoSendEligible:false, requiresHumanApproval:true }),
  event('operations.order.update','operations','sales.access','Authoritative order status notification.',
    { placeholders:['first_name','organization_name','order_reference','status','portal_link'] }),
  event('operations.delivery.reminder','operations','logistics.access','Authorized delivery reminder.',
    { placeholders:['first_name','organization_name','appointment_time','portal_link'] }),
  event('finance.invoice.ready','finance','finance.access','Secure-link invoice availability notice.',
    { sensitivity:'confidential_notice', aiAllowed:false, autoSendEligible:false, requiresHumanApproval:true }),
]);

const BY_ID = new Map(EVENTS.map(value => [value.id, value]));
export function eventById(id: string): EventDefinition {
  const result = BY_ID.get(id);
  if (!result) throw new CommunicationError('UNKNOWN_USE_CASE');
  return result;
}
