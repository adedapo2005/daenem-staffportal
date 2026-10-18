/**
 * Daenem human-visible time contract.
 *
 * All values shown to a person use a 12-hour clock with an explicit AM/PM
 * marker.  Internal timestamps remain UTC/ISO and are never formatted here
 * without an explicit display timezone.
 */
export const LAGOS_TIME_ZONE = "Africa/Lagos";
export const NEW_YORK_TIME_ZONE = "America/New_York";
export const UTC_TIME_ZONE = "UTC";

type AuthenticatedTimeSession = {
  role?: string;
  displayTimeZone?: string | null;
};

type DateInput = Date | string | number | null | undefined;

function asDate(value: DateInput) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date;
  if (typeof value !== "string") return null;

  // Compatibility for device-local demo records saved before history moved to
  // canonical ISO. Interpret the old wall clock as Lagos once, then route it
  // through the same IANA presentation authority as every current record.
  const legacy = value.trim().match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+·\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i,
  );
  if (!legacy) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(legacy[2].toLowerCase()) + 1;
  if (!month) return null;
  const iso = zonedLocalToIso(
    `${legacy[3]}-${String(month).padStart(2, "0")}-${legacy[1].padStart(2, "0")}`,
    Number(legacy[4]),
    Number(legacy[5]),
    legacy[6].toUpperCase() as "AM" | "PM",
    LAGOS_TIME_ZONE,
  );
  return iso ? new Date(iso) : null;
}

export function formatTime12(value: DateInput, timeZone: string, includeSeconds = false) {
  const date = asDate(value);
  if (!date || !isValidTimeZone(timeZone)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: true,
  }).format(date);
}

export function formatDateTime12(value: DateInput, timeZone: string) {
  const date = asDate(value);
  if (!date || !isValidTimeZone(timeZone)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function isValidTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return true; } catch { return false; }
}

/** The browser zone is only a presentation fallback. It never changes stored
 * UTC/ISO values or a domain business date. */
export function browserIanaTimeZone() {
  if (typeof Intl === "undefined") return LAGOS_TIME_ZONE;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : LAGOS_TIME_ZONE;
}

/** One authority for authenticated presentation: configured profile first,
 * then the current browser IANA zone, then Nigeria as the safe fallback. */
export function resolveAuthenticatedTimeZone(
  session: AuthenticatedTimeSession,
  browserTimeZone?: string,
) {
  if (session.displayTimeZone && isValidTimeZone(session.displayTimeZone)) {
    return session.displayTimeZone;
  }
  if (session.role === "Owner") return LAGOS_TIME_ZONE;
  if (browserTimeZone && isValidTimeZone(browserTimeZone)) return browserTimeZone;
  return browserIanaTimeZone();
}

export function formatAuthenticatedTime12(
  value: DateInput,
  session: AuthenticatedTimeSession,
  includeSeconds = false,
  browserTimeZone?: string,
) {
  return formatTime12(
    value,
    resolveAuthenticatedTimeZone(session, browserTimeZone),
    includeSeconds,
  );
}

export function formatAuthenticatedDateTime12(
  value: DateInput,
  session: AuthenticatedTimeSession,
  browserTimeZone?: string,
) {
  return formatDateTime12(
    value,
    resolveAuthenticatedTimeZone(session, browserTimeZone),
  );
}

/** Owner record context always presents the two approved, DST-correct IANA
 * zones. Other authenticated users see their configured/browser zone only. */
export function formatRecordDateTime12(
  value: DateInput,
  session: AuthenticatedTimeSession,
  browserTimeZone?: string,
) {
  const date = asDate(value);
  if (!date) return typeof value === "string" && value.trim() ? value : "—";
  if (session.role === "Owner") {
    return `${formatDateTime12(date, LAGOS_TIME_ZONE)} · ${LAGOS_TIME_ZONE} | ${formatDateTime12(date, NEW_YORK_TIME_ZONE)} · ${NEW_YORK_TIME_ZONE}`;
  }
  const zone = resolveAuthenticatedTimeZone(session, browserTimeZone);
  return `${formatDateTime12(date, zone)} · ${zone}`;
}

/** Convert an Owner-facing 12-hour wall-clock selection to canonical UTC.
 * The offset is derived from the IANA zone at the selected instant, so New York
 * daylight-saving transitions remain automatic. Invalid or nonexistent inputs
 * fail truthfully instead of becoming an epoch timestamp. */
export function zonedLocalToIso(date: string, hour: number, minute: number, period: "AM" | "PM", timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !isValidTimeZone(timeZone)) return null;
  const [year, month, day] = date.split("-").map(Number), hour24 = hour % 12 + (period === "PM" ? 12 : 0);
  let candidate = Date.UTC(year, month - 1, day, hour24, minute);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    candidate += Date.UTC(year, month - 1, day, hour24, minute) - represented;
  }
  const roundTrip = Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return roundTrip.year === year && roundTrip.month === month && roundTrip.day === day && roundTrip.hour === hour24 && roundTrip.minute === minute ? new Date(candidate).toISOString() : null;
}

export function formatWeatherTime(value: string | null, timeZone = LAGOS_TIME_ZONE) {
  if (!value) return "—";
  return formatTime12(value, timeZone);
}

/** Keep the audit detector deliberately conservative: only clock-like text. */
export function countVisible24HourTimeTokens(text: string) {
  const tokens = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?[AP]M)?\b/gi) || [];
  return tokens.filter(token => !/\b(?:1[0-2]|0?[1-9]):[0-5]\d\s?(?:AM|PM)\b/i.test(token)).length;
}

export function countVisibleTimesWithoutAmPm(text: string) {
  const tokens = text.match(/\b(?:0?[1-9]|1[0-2]|2[0-3]):[0-5]\d\b/g) || [];
  return tokens.filter(token => !new RegExp(`${token}\\s?(?:AM|PM)\\b`, "i").test(text)).length;
}
