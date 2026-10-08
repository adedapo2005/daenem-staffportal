/**
 * Human-visible StaffPortal timestamps. Persist and exchange UTC/ISO values;
 * convert only when rendering a permitted record for its viewer.
 */
export function parsePortalTimestamp(value?: string | Date | null): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  // D1's UTC timestamp convention has no suffix. Never parse it as device-local time.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? trimmed.replace(' ', 'T') + 'Z'
    : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(normalized)) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(normalized);
  if (!parts) return null;
  const [year, month, day, hour = '0', minute = '0', second = '0'] = parts.slice(1).map((part) => part === undefined ? undefined : part);
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month)
    || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function validZone(zone?: string | null): string | null {
  if (!zone || typeof zone !== 'string') return null;
  try {
    new Intl.DateTimeFormat('en-NG', { timeZone: zone }).format(0);
    return zone;
  } catch {
    return null;
  }
}

/** Use the employee's configured zone first, then the device zone; never trust a broken zone. */
export function resolveStaffTimeZone(configured?: string | null, deviceZone?: string | null): string {
  const browserZone = deviceZone === undefined
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : deviceZone;
  return validZone(configured) || validZone(browserZone) || 'UTC';
}

function formatInZone(value: string | Date | null | undefined, timeZone: string | undefined, withDate: boolean): string {
  const date = parsePortalTimestamp(value);
  if (!date) return '';
  const zone = resolveStaffTimeZone(timeZone);
  const options: Intl.DateTimeFormatOptions = withDate
    ? { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }
    : { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true };
  return new Intl.DateTimeFormat('en-NG', options).format(date).replace(/\b(am|pm)\b/gi, (match) => match.toUpperCase());
}

export function formatPortalTime(value?: string | Date | null, timeZone?: string): string {
  return formatInZone(value, timeZone, false);
}

export function formatPortalDateTime(value?: string | Date | null, timeZone?: string): string {
  return formatInZone(value, timeZone, true);
}

/** Only authorized Owner surfaces should display both operations time zones. */
export function formatOwnerDualTime(value?: string | Date | null): { lagos: string; newYork: string } {
  return {
    lagos: formatPortalDateTime(value, 'Africa/Lagos'),
    newYork: formatPortalDateTime(value, 'America/New_York'),
  };
}
