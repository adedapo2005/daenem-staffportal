import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface AttendanceEnv extends AuthEnv {
  FILES: R2Bucket;
}

type ClockAction = 'clock_in' | 'clock_out';

type AttendancePolicyRow = {
  companyId: string;
  locationId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  radiusM: number;
  requireGeofence: number;
  requireClockInPhoto: number;
  requireClockOutPhoto: number;
  allowOffline: number;
  scheduledStart?: string;
  scheduledEnd?: string;
};

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function uid(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function requestIp(request: Request) { return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null; }

function nigeriaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (number: number) => number * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function policyFor(env: AttendanceEnv, employeeId: string, companyId: string) {
  return env.DB.prepare(`
    SELECT m.company_id AS companyId, m.location_id AS locationId, cl.name AS locationName,
           cl.latitude, cl.longitude,
           COALESCE(ap.geofence_radius_m, cl.geofence_radius_m, 150) AS radiusM,
           COALESCE(ap.require_clock_geofence, 1) AS requireGeofence,
           COALESCE(ap.require_clock_in_photo, 1) AS requireClockInPhoto,
           COALESCE(ap.require_clock_out_photo, 0) AS requireClockOutPhoto,
           COALESCE(ap.allow_offline_attendance, 0) AS allowOffline,
           ap.scheduled_start_local AS scheduledStart,
           ap.scheduled_end_local AS scheduledEnd
    FROM employee_company_memberships m
    LEFT JOIN company_locations cl ON cl.id = m.location_id AND cl.company_id = m.company_id
    LEFT JOIN attendance_policies ap
      ON ap.company_id = m.company_id AND ap.active = 1
      AND (ap.location_id IS NULL OR ap.location_id = m.location_id)
    WHERE m.employee_id = ? AND m.company_id = ? AND m.active = 1
    ORDER BY ap.location_id IS NOT NULL DESC
    LIMIT 1
  `).bind(employeeId, companyId).first<AttendancePolicyRow>();
}

function validateLocation(policy: AttendancePolicyRow, latitude?: number, longitude?: number, accuracy?: number) {
  if (!policy.requireGeofence) return { ok: true, result: 'not_required', distanceM: null } as const;
  if (!Number.isFinite(policy.latitude) || !Number.isFinite(policy.longitude)) {
    return { ok: false, code: 'GEOFENCE_NOT_CONFIGURED', message: 'Attendance is locked until an administrator sets this work location geofence.' } as const;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, code: 'LOCATION_REQUIRED', message: 'Your GPS location is required to clock in or clock out.' } as const;
  }
  const distance = distanceMeters(latitude!, longitude!, policy.latitude!, policy.longitude!);
  const tolerance = Math.min(Math.max(Number(accuracy || 0), 0), 50);
  const inside = distance <= Number(policy.radiusM || 150) + tolerance;
  return inside
    ? { ok: true, result: 'inside', distanceM: Math.round(distance) } as const
    : { ok: false, code: 'OUTSIDE_ATTENDANCE_GEOFENCE', message: `You are outside the assigned attendance area (${Math.round(distance)}m away).`, distanceM: Math.round(distance) } as const;
}

async function ensureDay(env: AttendanceEnv, employeeId: string, companyId: string, locationId: string | undefined, workDate: string) {
  const existing = await env.DB.prepare(`SELECT * FROM attendance_days WHERE employee_id = ? AND company_id = ? AND work_date = ? LIMIT 1`).bind(employeeId, companyId, workDate).first<Record<string, unknown>>();
  if (existing) return existing;
  const id = uid('attendance-day');
  await env.DB.prepare(`
    INSERT INTO attendance_days (id, employee_id, company_id, location_id, work_date, status)
    VALUES (?, ?, ?, ?, ?, 'incomplete')
  `).bind(id, employeeId, companyId, locationId || null, workDate).run();
  return { id, employee_id: employeeId, company_id: companyId, location_id: locationId, work_date: workDate, status: 'incomplete' };
}

async function recordRejected(
  request: Request,
  env: AttendanceEnv,
  context: SessionContext,
  companyId: string,
  locationId: string | undefined,
  workDate: string,
  reason: string,
  latitude?: number,
  longitude?: number,
  accuracy?: number,
) {
  const day = await ensureDay(env, context.employee.id, companyId, locationId, workDate);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO attendance_events (
        id, attendance_day_id, employee_id, event_type, latitude, longitude, accuracy_m,
        geofence_result, device_id, rejection_reason, metadata_json
      ) VALUES (?, ?, ?, 'rejected_attempt', ?, ?, ?, 'outside', ?, ?, ?)
    `).bind(uid('attendance-event'), day.id, context.employee.id, latitude ?? null, longitude ?? null, accuracy ?? null, null, reason, JSON.stringify({ ip: requestIp(request) })),
    env.DB.prepare(`
      INSERT INTO security_logs (
        id, employee_id, company_id, session_id, event_type, severity, result,
        ip_address, user_agent, latitude, longitude, accuracy_m, risk_score, details_json
      ) VALUES (?, ?, ?, ?, 'attendance_rejected', 'high', 'denied', ?, ?, ?, ?, ?, 65, ?)
    `).bind(uid('security'), context.employee.id, companyId, context.sessionId, requestIp(request), request.headers.get('user-agent'), latitude ?? null, longitude ?? null, accuracy ?? null, JSON.stringify({ reason })),
  ]);
}

function decodeImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Attendance photo must be a JPEG, PNG or WebP image.');
  const binary = atob(match[2]);
  if (binary.length > 2_500_000) throw new Error('Attendance photo is too large. Maximum size is 2.5 MB.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { contentType: match[1], bytes };
}

async function savePhoto(env: AttendanceEnv, companyId: string, employeeId: string, workDate: string, action: ClockAction, dataUrl: string) {
  const image = decodeImage(dataUrl);
  const extension = image.contentType === 'image/png' ? 'png' : image.contentType === 'image/webp' ? 'webp' : 'jpg';
  const key = `attendance/${companyId}/${employeeId}/${workDate}/${action}-${crypto.randomUUID()}.${extension}`;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', image.bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  await env.FILES.put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: { companyId, employeeId, workDate, action, sha256: digest },
  });
  return { key, digest, sizeBytes: image.bytes.byteLength, contentType: image.contentType };
}

function eventTime(policy: AttendancePolicyRow, offlineCreatedAt?: string) {
  if (!offlineCreatedAt) return new Date();
  if (!policy.allowOffline) throw new Error('Offline attendance is disabled for this company.');
  const value = new Date(offlineCreatedAt);
  if (!Number.isFinite(value.getTime())) throw new Error('Offline attendance timestamp is invalid.');
  const age = Date.now() - value.getTime();
  if (age < -10 * 60_000 || age > 48 * 60 * 60_000) throw new Error('Offline attendance must synchronize within 48 hours and cannot be in the future.');
  return value;
}

async function today(request: Request, env: AttendanceEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId') || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id;
  if (!companyId || !context.companies.some((company) => company.id === companyId)) return json({ error: 'Select an assigned company.' }, 400);
  if (!hasPermission(context, 'attendance.access', 'view', companyId)) return json({ error: 'Attendance access is not assigned for this company.' }, 403);
  const policy = await policyFor(env, context.employee.id, companyId);
  if (!policy) return json({ error: 'No attendance policy is assigned for this company.' }, 404);
  const workDate = nigeriaDate();
  const day = await env.DB.prepare(`
    SELECT id, status, clock_in_at AS clockInAt, clock_out_at AS clockOutAt,
           worked_minutes AS workedMinutes, late_minutes AS lateMinutes
    FROM attendance_days WHERE employee_id = ? AND company_id = ? AND work_date = ? LIMIT 1
  `).bind(context.employee.id, companyId, workDate).first<Record<string, unknown>>();
  return json({
    companyId, workDate, day: day || null,
    policy: {
      locationId: policy.locationId || null,
      locationName: policy.locationName || 'Assigned work location',
      radiusM: policy.radiusM,
      geofenceRequired: Boolean(policy.requireGeofence),
      geofenceConfigured: Number.isFinite(policy.latitude) && Number.isFinite(policy.longitude),
      clockInPhotoRequired: Boolean(policy.requireClockInPhoto),
      clockOutPhotoRequired: Boolean(policy.requireClockOutPhoto),
      offlineAllowed: Boolean(policy.allowOffline),
    },
    rule: 'A clock-in without a valid clock-out remains incomplete and does not count as a worked/present day.',
  });
}

async function clock(request: Request, env: AttendanceEnv, context: SessionContext) {
  let body: {
    action?: ClockAction; companyId?: string; latitude?: number; longitude?: number; accuracy?: number;
    photoDataUrl?: string; offlineCreatedAt?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid attendance request.' }, 400); }
  if (!['clock_in', 'clock_out'].includes(String(body.action))) return json({ error: 'Clock action must be clock_in or clock_out.' }, 400);
  const action = body.action as ClockAction;
  const companyId = String(body.companyId || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || '');
  if (!companyId || !context.companies.some((company) => company.id === companyId)) return json({ error: 'You are not assigned to this company.' }, 403);
  if (!hasPermission(context, 'attendance.access', 'create', companyId)) return json({ error: 'Clock-in/out permission is not assigned for this company.' }, 403);
  const policy = await policyFor(env, context.employee.id, companyId);
  if (!policy) return json({ error: 'No attendance policy is assigned for this company.' }, 409);

  let occurred: Date;
  try { occurred = eventTime(policy, body.offlineCreatedAt); }
  catch (error) { return json({ error: (error as Error).message }, 400); }
  const workDate = nigeriaDate(occurred);
  const location = validateLocation(policy, body.latitude, body.longitude, body.accuracy);
  if (!location.ok) {
    await recordRejected(request, env, context, companyId, policy.locationId, workDate, location.code, body.latitude, body.longitude, body.accuracy);
    return json({ error: location.message, code: location.code }, location.code === 'GEOFENCE_NOT_CONFIGURED' ? 409 : 403);
  }

  const photoRequired = action === 'clock_in' ? Boolean(policy.requireClockInPhoto) : Boolean(policy.requireClockOutPhoto);
  if (photoRequired && !body.photoDataUrl) {
    await recordRejected(request, env, context, companyId, policy.locationId, workDate, `${action.toUpperCase()}_PHOTO_REQUIRED`, body.latitude, body.longitude, body.accuracy);
    return json({ error: `A live employee photo is required to ${action === 'clock_in' ? 'clock in' : 'clock out'}.`, code: 'ATTENDANCE_PHOTO_REQUIRED' }, 400);
  }

  const day = await ensureDay(env, context.employee.id, companyId, policy.locationId, workDate);
  if (action === 'clock_in' && day.clock_in_at) return json({ error: 'You already clocked in for this work day.' }, 409);
  if (action === 'clock_out' && !day.clock_in_at) return json({ error: 'You cannot clock out without a valid clock-in.' }, 409);
  if (action === 'clock_out' && day.clock_out_at) return json({ error: 'You already clocked out for this work day.' }, 409);
  const clockInAt = action === 'clock_out' ? new Date(String(day.clock_in_at)) : null;
  const workedMinutes = clockInAt ? Math.max(0, Math.round((occurred.getTime() - clockInAt.getTime()) / 60_000)) : 0;
  if (action === 'clock_out' && workedMinutes > 24 * 60) {
    return json({ error: 'Clock-out is too far from the recorded clock-in. A manager must review this attendance day.' }, 409);
  }

  let photo: Awaited<ReturnType<typeof savePhoto>> | null = null;
  if (body.photoDataUrl) {
    try { photo = await savePhoto(env, companyId, context.employee.id, workDate, action, body.photoDataUrl); }
    catch (error) { return json({ error: (error as Error).message }, 400); }
  }
  const photoKey = photo?.key || null;

  const occurredAt = occurred.toISOString();
  const eventId = uid('attendance-event');
  try {
    if (action === 'clock_in') {
      await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO attendance_events (
          id, attendance_day_id, employee_id, event_type, occurred_at, latitude, longitude,
          accuracy_m, geofence_result, photo_key, offline_created_at, synced_at, metadata_json
        ) VALUES (?, ?, ?, 'clock_in', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `).bind(eventId, day.id, context.employee.id, occurredAt, body.latitude ?? null, body.longitude ?? null, body.accuracy ?? null, location.result, photoKey, body.offlineCreatedAt || null, JSON.stringify({ distanceM: location.distanceM })),
      env.DB.prepare(`
        UPDATE attendance_days SET clock_in_at = ?, status = 'incomplete', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(occurredAt, day.id),
      ...(photo ? [env.DB.prepare(`
        INSERT OR IGNORE INTO storage_mirror_jobs(
          id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,size_bytes,sha256,idempotency_key,status
        ) VALUES(?,'microsoft_onedrive','attendance',?,?,?,?,?,?,?,?,'provider_required')
      `).bind(`storage-mirror-attendance-${eventId}-${photo.digest}`, eventId, companyId, photo.key,
        `${action}.${photo.contentType === 'image/png' ? 'png' : photo.contentType === 'image/webp' ? 'webp' : 'jpg'}`,
        photo.contentType, photo.sizeBytes, photo.digest, `microsoft_onedrive:attendance:${eventId}:${photo.digest}`)] : []),
      ]);
    } else {
      await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO attendance_events (
          id, attendance_day_id, employee_id, event_type, occurred_at, latitude, longitude,
          accuracy_m, geofence_result, photo_key, offline_created_at, synced_at, metadata_json
        ) VALUES (?, ?, ?, 'clock_out', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `).bind(eventId, day.id, context.employee.id, occurredAt, body.latitude ?? null, body.longitude ?? null, body.accuracy ?? null, location.result, photoKey, body.offlineCreatedAt || null, JSON.stringify({ distanceM: location.distanceM })),
      env.DB.prepare(`
        UPDATE attendance_days SET clock_out_at = ?, worked_minutes = ?, status = 'present',
          completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).bind(occurredAt, workedMinutes, day.id),
      ...(photo ? [env.DB.prepare(`
        INSERT OR IGNORE INTO storage_mirror_jobs(
          id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,size_bytes,sha256,idempotency_key,status
        ) VALUES(?,'microsoft_onedrive','attendance',?,?,?,?,?,?,?,?,'provider_required')
      `).bind(`storage-mirror-attendance-${eventId}-${photo.digest}`, eventId, companyId, photo.key,
        `${action}.${photo.contentType === 'image/png' ? 'png' : photo.contentType === 'image/webp' ? 'webp' : 'jpg'}`,
        photo.contentType, photo.sizeBytes, photo.digest, `microsoft_onedrive:attendance:${eventId}:${photo.digest}`)] : []),
      ]);
    }
  } catch (error) {
    if (photo) await env.FILES.delete(photo.key);
    throw error;
  }

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source)
    VALUES (?, ?, ?, 'attendance', ?, 'attendance_day', ?, ?, ?)
  `).bind(uid('audit'), context.employee.id, companyId, action, day.id, JSON.stringify({ occurredAt, geofence: location.result, photoKey }), body.offlineCreatedAt ? 'offline_sync' : 'web').run();

  const updated = await env.DB.prepare(`
    SELECT id, status, clock_in_at AS clockInAt, clock_out_at AS clockOutAt, worked_minutes AS workedMinutes
    FROM attendance_days WHERE id = ?
  `).bind(day.id).first<Record<string, unknown>>();
  return json({ ok: true, day: updated, message: action === 'clock_in' ? 'Clock-in recorded. The day remains incomplete until a valid clock-out.' : 'Clock-out recorded. This work day now counts as present/worked.' });
}

export async function routeAttendance(request: Request, env: AttendanceEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/attendance/today' && request.method === 'GET') return today(request, env, context);
  if (url.pathname === '/api/attendance/clock' && request.method === 'POST') return clock(request, env, context);
  return null;
}
