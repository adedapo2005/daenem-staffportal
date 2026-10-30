import { APPLICATION, CommunicationError } from './communications/types.js';
import type {
  Channel, EnvironmentBoundary, PolicyRule, PolicySnapshot, Scope,
} from './communications/types.js';
import type { AuthEnv } from './auth.js';
import { resolveTypedScopedSetting } from './scoped-settings.js';

const ORGANIZATION_ID = 'daenem-group';

function bool(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function jsonArray(value: string | null | undefined, fallback: readonly string[]) {
  if (!value) return [...fallback];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string')
      ? parsed as string[]
      : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function assertStaffPortalCompany(companyId: string) {
  if (!companyId || /farm/i.test(companyId)) {
    throw new CommunicationError('COMPANY_NOT_ALLOWED');
  }
}

export function communicationScope(companyId: string): Scope {
  assertStaffPortalCompany(companyId);
  return {
    application: APPLICATION,
    organizationId: ORGANIZATION_ID,
    companyId,
  };
}

async function setting(env: AuthEnv, key: string): Promise<string | undefined> {
  const row = await env.DB.prepare(
    'SELECT setting_value AS value FROM app_settings WHERE setting_key=? LIMIT 1',
  ).bind(key).first<{ value: string }>();
  return row?.value;
}

export async function communicationBoundary(
  env: AuthEnv,
  companyId: string,
): Promise<EnvironmentBoundary> {
  assertStaffPortalCompany(companyId);
  const killSwitch = bool(await setting(env, 'communications.kill_switch'), true);
  return {
    application: APPLICATION,
    killSwitch,
    targets: [{ organizationId: ORGANIZATION_ID, companyId }],
  };
}

function rowRule(
  row: Record<string, unknown> | null,
  fallbackChannels: readonly Channel[],
  fallbackAi: boolean,
): PolicyRule {
  if (!row) {
    return {
      enabled: false,
      aiEnabled: false,
      autoGenerate: false,
      autoSend: false,
      requireHumanApproval: true,
      channels: [],
      languages: [],
      maxCharacters: 1000,
    };
  }
  const channels = jsonArray(String(row.channelsJson || ''), fallbackChannels)
    .filter(value => ['whatsapp','email','in_app','push'].includes(value)) as Channel[];
  const languages = jsonArray(String(row.languagesJson || ''), ['en']);
  return {
    enabled: Boolean(row.enabled),
    aiEnabled: fallbackAi && Boolean(row.aiEnabled),
    autoGenerate: Boolean(row.autoGenerate),
    autoSend: Boolean(row.autoSend),
    requireHumanApproval: Boolean(row.requireHumanApproval),
    channels,
    languages,
    maxCharacters: Math.max(1, Math.min(4000, Number(row.maxCharacters || 1000))),
  };
}

async function loadApplicableRestrictions(
  env:AuthEnv,
  companyId:string,
  eventId:string,
  employeeIds:readonly string[],
  fallbackChannels:readonly Channel[],
  fallbackAi:boolean,
):Promise<PolicyRule[]>{
  const ids=[...new Set(employeeIds.filter(Boolean))];
  if(!ids.length)return[];
  const employeeMarks=ids.map(()=>'?').join(',');
  const roleRows=await env.DB.prepare(`
    SELECT DISTINCT role_id AS roleId FROM employee_roles
    WHERE company_id=? AND employee_id IN (${employeeMarks})
  `).bind(companyId,...ids).all<{roleId:string}>();
  const roleIds=(roleRows.results||[]).map(row=>row.roleId).filter(Boolean);
  const conditions:string[]=[];
  const binds:unknown[]=[companyId,eventId];
  conditions.push(`(subject_type='employee' AND subject_id IN (${employeeMarks}))`);
  binds.push(...ids);
  if(roleIds.length){
    const roleMarks=roleIds.map(()=>'?').join(',');
    conditions.push(`(subject_type='role' AND subject_id IN (${roleMarks}))`);
    binds.push(...roleIds);
  }
  const rows=await env.DB.prepare(`
    SELECT enabled,ai_enabled AS aiEnabled,auto_generate AS autoGenerate,
      auto_send AS autoSend,require_human_approval AS requireHumanApproval,
      channels_json AS channelsJson,languages_json AS languagesJson,
      max_characters AS maxCharacters
    FROM communication_policy_restrictions
    WHERE company_id=? AND event_id=? AND (${conditions.join(' OR ')})
    ORDER BY subject_type,subject_id
  `).bind(...binds).all<Record<string,unknown>>();
  return (rows.results||[]).map(row=>rowRule(row,fallbackChannels,fallbackAi));
}

async function restrictionFingerprint(rules:readonly PolicyRule[]){
  const canonical=JSON.stringify(rules.map(rule=>({
    enabled:rule.enabled,aiEnabled:rule.aiEnabled,autoGenerate:rule.autoGenerate,
    autoSend:rule.autoSend,requireHumanApproval:rule.requireHumanApproval,
    channels:[...rule.channels].sort(),languages:[...rule.languages].sort(),
    maxCharacters:rule.maxCharacters,
  })));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].slice(0,8).map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function loadPolicySnapshot(
  env: AuthEnv,
  companyId: string,
  eventId: string,
  subjectEmployeeIds: readonly string[] = [],
): Promise<PolicySnapshot> {
  assertStaffPortalCompany(companyId);
  const [killSwitchRaw, whatsappScoped, aiScoped, row] = await Promise.all([
    setting(env, 'communications.kill_switch'),
    resolveTypedScopedSetting(env, 'communications.whatsapp_enabled', companyId),
    resolveTypedScopedSetting(env, 'communications.ai_enabled', companyId),
    env.DB.prepare(`
      SELECT enabled, ai_enabled AS aiEnabled, auto_generate AS autoGenerate,
        auto_send AS autoSend, require_human_approval AS requireHumanApproval,
        channels_json AS channelsJson, languages_json AS languagesJson,
        max_characters AS maxCharacters, revision
      FROM communication_policy_rules
      WHERE company_id=? AND event_id=?
      LIMIT 1
    `).bind(companyId, eventId).first<Record<string, unknown>>(),
  ]);
  const killSwitch = bool(killSwitchRaw, true);
  const whatsappEnabled = Boolean(whatsappScoped.value);
  const aiEnabled = Boolean(aiScoped.value);
  const channels: Channel[] = whatsappEnabled
    ? ['in_app','email','whatsapp']
    : ['in_app','email'];
  const base: PolicyRule = {
    enabled: !killSwitch,
    aiEnabled: !killSwitch && aiEnabled,
    autoGenerate: true,
    autoSend: true,
    requireHumanApproval: false,
    channels,
    languages: ['en'],
    maxCharacters: 4000,
  };
  const useCase = rowRule(row || null, channels, aiEnabled);
  const restrictions=await loadApplicableRestrictions(
    env,companyId,eventId,subjectEmployeeIds,channels,aiEnabled,
  );
  const restrictionRevision=await restrictionFingerprint(restrictions);
  const revision = (row
    ? `company:${companyId}:event:${eventId}:r${String(row.revision || 1)}`
    : `company:${companyId}:event:${eventId}:disabled`) + `:restr:${restrictionRevision}`;
  return {
    scope: communicationScope(companyId),
    eventId,
    revision,
    validUntilMs: Date.now() + 60_000,
    global: base,
    organization: base,
    module: base,
    useCase,
    restrictions,
  };
}

export async function upsertPolicyRule(
  env: AuthEnv,
  input: {
    companyId: string;
    module: string;
    eventId: string;
    enabled: boolean;
    aiEnabled: boolean;
    autoGenerate: boolean;
    autoSend: boolean;
    requireHumanApproval: boolean;
    channels: readonly Channel[];
    languages: readonly string[];
    maxCharacters: number;
    actorId: string;
  },
) {
  assertStaffPortalCompany(input.companyId);
  const id = `comm-policy-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT INTO communication_policy_rules(
      id,company_id,module,event_id,enabled,ai_enabled,auto_generate,auto_send,
      require_human_approval,channels_json,languages_json,max_characters,updated_by
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(company_id,event_id) DO UPDATE SET
      module=excluded.module,
      enabled=excluded.enabled,
      ai_enabled=excluded.ai_enabled,
      auto_generate=excluded.auto_generate,
      auto_send=excluded.auto_send,
      require_human_approval=excluded.require_human_approval,
      channels_json=excluded.channels_json,
      languages_json=excluded.languages_json,
      max_characters=excluded.max_characters,
      revision=communication_policy_rules.revision+1,
      updated_by=excluded.updated_by,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    id,input.companyId,input.module,input.eventId,
    input.enabled?1:0,input.aiEnabled?1:0,input.autoGenerate?1:0,input.autoSend?1:0,
    input.requireHumanApproval?1:0,JSON.stringify(input.channels),
    JSON.stringify(input.languages),input.maxCharacters,input.actorId,
  ).run();
}

export function mapCommunicationError(error: unknown) {
  if (error instanceof CommunicationError) return error.code;
  return 'COMMUNICATIONS_ERROR';
}
export async function reserveCapacity(
  env: AuthEnv,
  input: {
    companyId: string;
    actorId?: string;
    type: 'ai_generation' | 'provider_send';
    eventId: string;
    sourceId?: string;
  },
): Promise<boolean> {
  assertStaffPortalCompany(input.companyId);
  const settingKey = input.type === 'ai_generation'
    ? 'communications.ai_daily_limit' as const
    : 'communications.provider_daily_limit' as const;
  const configured = Number((await resolveTypedScopedSetting(env, settingKey, input.companyId)).value);
  const limit = Number.isInteger(configured) && configured >= 0 ? configured : 0;
  if (limit < 1) return false;
  const id = `comm-capacity-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO communication_capacity_reservations(
      id,company_id,actor_employee_id,capacity_type,event_id,source_id,expires_at
    )
    SELECT ?,?,?,?,?,?,?
    WHERE (
      SELECT COUNT(*) FROM communication_capacity_reservations
      WHERE company_id=? AND capacity_type=?
        AND released_at IS NULL
        AND datetime(reserved_at)>=datetime('now','start of day')
    ) < ?
  `).bind(
    id,input.companyId,input.actorId || null,input.type,input.eventId,input.sourceId || null,expiresAt,
    input.companyId,input.type,limit,
  ).run();
  return Number(result.meta?.changes || 0) === 1;
}
