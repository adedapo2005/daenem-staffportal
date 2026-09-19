import { checkBoundary, effectivePolicy } from './policy.js';
import { eventById } from './catalog.js';
import { isNonEmpty, requireCondition, sameScope } from './types.js';
import type { EnvironmentBoundary, PolicySnapshot, Scope } from './types.js';

export interface AuthenticationDelivery {
  scope: Scope;
  purpose: 'signup_phone' | 'signin_step_up' | 'password_reset';
  challengeId: string;
  code: string;
  toE164: string;
  contactRevision: string;
  currentContactRevision: string;
  contactAlreadyVerified: boolean;
  expiresAtMs: number;
  consumed: boolean;
  explicitChannelRequest: boolean;
  phishingResistantRequired: boolean;
  identityTransactionAuthorized: boolean;
  abuseAndBudgetCapacityReserved: boolean;
  template: {
    scope: Scope;
    name: string;
    language: string;
    category: 'authentication';
    internallyApproved: boolean;
    providerApproved: boolean;
    enabled: boolean;
    allowedPurposes: readonly AuthenticationDelivery['purpose'][];
  };
}

export function authenticationPayload(
  delivery: AuthenticationDelivery,
  policy: PolicySnapshot,
  boundary: EnvironmentBoundary,
  nowMs: number,
): Record<string, unknown> {
  checkBoundary(delivery.scope, boundary);
  const events = {
    signup_phone: 'identity.signup_verification',
    signin_step_up: 'identity.signin_verification',
    password_reset: 'identity.recovery_verification',
  } as const;
  requireCondition(Object.hasOwn(events, delivery.purpose), 'UNKNOWN_AUTH_PURPOSE');
  requireCondition(
    sameScope(delivery.scope, policy.scope) &&
      policy.eventId === events[delivery.purpose],
    'POLICY_SCOPE_MISMATCH',
  );
  const effective = effectivePolicy(policy, nowMs);
  requireCondition(
    effective.enabled && effective.channels.includes('whatsapp'),
    'WHATSAPP_AUTH_DISABLED',
  );
  requireCondition(
    delivery.identityTransactionAuthorized &&
      delivery.explicitChannelRequest &&
      delivery.abuseAndBudgetCapacityReserved,
    'IDENTITY_AUTHORIZATION_REQUIRED',
  );
  requireCondition(
    !delivery.phishingResistantRequired,
    'STRONGER_AUTHENTICATOR_REQUIRED',
  );
  requireCondition(
    isNonEmpty(delivery.challengeId) &&
      !delivery.consumed &&
      Number.isFinite(delivery.expiresAtMs) &&
      nowMs < delivery.expiresAtMs,
    'CHALLENGE_EXPIRED_OR_CONSUMED',
  );
  requireCondition(
    /^\d{6}$/.test(delivery.code) && /^\+[1-9]\d{6,14}$/.test(delivery.toE164),
    'INVALID_AUTH_DELIVERY',
  );
  requireCondition(
    isNonEmpty(delivery.contactRevision) &&
      delivery.contactRevision === delivery.currentContactRevision,
    'CONTACT_CHANGED',
  );
  requireCondition(
    delivery.purpose === 'signup_phone' || delivery.contactAlreadyVerified,
    'ENROLLED_CONTACT_REQUIRED',
  );
  const template = delivery.template;
  requireCondition(
    sameScope(delivery.scope, template.scope) &&
      template.category === 'authentication' &&
      template.internallyApproved &&
      template.providerApproved &&
      template.enabled &&
      template.allowedPurposes.includes(delivery.purpose) &&
      /^[a-z0-9_]{1,128}$/.test(template.name) &&
      effective.languages.includes(template.language),
    'AUTH_TEMPLATE_NOT_APPROVED',
  );
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: delivery.toE164.slice(1),
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: delivery.code }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: delivery.code }],
        },
      ],
    },
  };
}

export async function verifyWebhookSignature(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }
  const hex = signature.slice(7);
  const bytes = Uint8Array.from(
    hex.match(/.{2}/g)!,
    value => parseInt(value, 16),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, bytes, raw);
}

export interface WebhookInbox {
  persistVerifiedEvent(raw: Uint8Array): Promise<void>;
}

export async function acknowledgeWebhook(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
  inbox: WebhookInbox,
  maximumBytes = 1_048_576,
): Promise<Response> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    return new Response('Unavailable', { status: 503 });
  }
  if (raw.byteLength > maximumBytes) {
    return new Response('Too large', { status: 413 });
  }
  if (!await verifyWebhookSignature(raw, signature, secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (
      !body ||
      typeof body !== 'object' ||
      (body as { object?: unknown }).object !== 'whatsapp_business_account'
    ) {
      return new Response('Invalid event', { status: 400 });
    }
  } catch {
    return new Response('Invalid event', { status: 400 });
  }
  try {
    await inbox.persistVerifiedEvent(raw);
  } catch {
    return new Response('Temporarily unavailable', { status: 503 });
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
}

export function renderPlaceholders(
  eventId: string,
  template: string,
  values: Record<string, string>,
  allowedPortalOrigin: string,
): string {
  const event = eventById(eventId);
  requireCondition(event.category !== 'authentication', 'USE_IDENTITY_PATH');
  const placeholders = [
    ...template.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g),
  ].map(match => match[1]!);
  requireCondition(
    placeholders.length > 0 &&
      placeholders.every(key => event.placeholders.includes(key)) &&
      Object.keys(values).length === new Set(placeholders).size &&
      placeholders.every(key => Object.hasOwn(values, key)),
    'PLACEHOLDER_MISMATCH',
  );
  for (const [key, value] of Object.entries(values)) {
    requireCondition(
      typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 500 &&
        !/[{}\r\n\u0000-\u001F\u202A-\u202E\u2066-\u2069]/.test(value),
      'INVALID_PLACEHOLDER_VALUE',
    );
    if (key === 'portal_link') {
      let link: URL;
      let origin: URL;
      try {
        link = new URL(value);
        origin = new URL(allowedPortalOrigin);
      } catch {
        requireCondition(false, 'INVALID_PORTAL_LINK');
      }
      requireCondition(
        link.protocol === 'https:' &&
          link.origin === origin.origin &&
          !link.username &&
          !link.password &&
          !link.search &&
          !link.hash,
        'INVALID_PORTAL_LINK',
      );
    } else {
      requireCondition(
        !/https?:|www\.|@/.test(value),
        'INVALID_PLACEHOLDER_VALUE',
      );
    }
  }
  const result = template.replace(
    /\{\{([a-z][a-z0-9_]*)\}\}/g,
    (_whole, key: string) => values[key]!,
  );
  requireCondition(
    !/[{}]/.test(result) && result.length <= 4000,
    'INVALID_RENDERED_MESSAGE',
  );
  return result;
}
