export type AccessLevel = "none" | "view" | "create" | "edit" | "approve" | "manage";

export type RecoveryMethodPolicy = "email" | "whatsapp" | "email_whatsapp";
export type ScopedSettingKey =
  | "security.password_recovery_methods"
  | "communications.whatsapp_enabled"
  | "communications.ai_enabled"
  | "communications.ai_daily_limit"
  | "communications.provider_daily_limit";
export type ScopedSettingValue = RecoveryMethodPolicy | boolean | number;

export type ScopedCompany = {
  id: string;
  code: string;
  name: string;
  value: ScopedSettingValue;
  source: "company" | "inherited";
};

export type ScopedSettingsResponse = {
  settingKey: ScopedSettingKey;
  valueType: "string" | "boolean" | "number";
  global: { value: ScopedSettingValue; source: "global" };
  companies: ScopedCompany[];
  canSetGlobal: boolean;
  canManage: boolean;
  canManageCompanyIds: string[];
};

export function isScopedSettingsResponse(value: unknown): value is ScopedSettingsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<ScopedSettingsResponse>;
  return Boolean(
    response.global &&
    typeof response.global === "object" &&
    Array.isArray(response.companies) &&
    typeof response.canSetGlobal === "boolean" &&
    typeof response.canManage === "boolean" &&
    Array.isArray(response.canManageCompanyIds),
  );
}

export type StaffPortalAuthResult = {
  authenticated: boolean;
  context?: {
    permissions?: Record<string, AccessLevel>;
    companyPermissions?: Record<string, Record<string, AccessLevel>>;
  };
};

export const SCOPED_SETTING_DEFINITIONS: Array<{
  key: ScopedSettingKey;
  label: string;
  description: string;
  kind: "choice" | "boolean" | "number";
}> = [
  {
    key: "security.password_recovery_methods",
    label: "Forgot Password methods",
    description: "Which verified recovery channels may be offered for the scope.",
    kind: "choice",
  },
  {
    key: "communications.whatsapp_enabled",
    label: "WhatsApp eligibility",
    description: "Allow the backend policy resolver to offer WhatsApp where enrolled.",
    kind: "boolean",
  },
  {
    key: "communications.ai_enabled",
    label: "AI drafting eligibility",
    description: "Permit governed draft assistance; it never grants send authority.",
    kind: "boolean",
  },
  {
    key: "communications.ai_daily_limit",
    label: "Daily AI draft limit",
    description: "Server-enforced maximum for this scope, not a browser quota.",
    kind: "number",
  },
  {
    key: "communications.provider_daily_limit",
    label: "Daily provider-send budget",
    description: "Server-enforced budget for approved provider sends.",
    kind: "number",
  },
];

declare global {
  interface Window {
    __DAENEM_STAFFPORTAL_API_ORIGIN__?: string;
  }
}

const TRUSTED_API_ORIGINS = new Set([
  "https://daenem-staffportal-api-staging.adedapo2005.workers.dev",
]);
const DEFAULT_API_ORIGIN = "https://daenem-staffportal-api-staging.adedapo2005.workers.dev";
const REQUEST_TIMEOUT_MS = 12_000;

type StaffPortalApiErrorCode =
  | "configuration"
  | "network"
  | "timeout"
  | "authentication"
  | "authorization"
  | "validation"
  | "conflict"
  | "rate_limit"
  | "unavailable"
  | "invalid_response";

export class StaffPortalApiError extends Error {
  constructor(
    message: string,
    readonly code: StaffPortalApiErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = "StaffPortalApiError";
  }
}

function requestPath(path: string) {
  if (!path.startsWith("/api/") && path !== "/health") {
    throw new StaffPortalApiError("The Staff Portal API request is not configured.", "configuration");
  }
  return path;
}

function apiUrl(path: string) {
  const safePath = requestPath(path);
  const selectedOrigin =
    typeof window === "undefined"
      ? DEFAULT_API_ORIGIN
      : window.__DAENEM_STAFFPORTAL_API_ORIGIN__ || DEFAULT_API_ORIGIN;
  let configured: URL;
  try {
    configured = new URL(selectedOrigin);
  } catch {
    throw new StaffPortalApiError("The Staff Portal API request is not configured.", "configuration");
  }
  if (
    configured.protocol !== "https:" ||
    configured.username ||
    configured.password ||
    configured.pathname !== "/" ||
    configured.search ||
    configured.hash ||
    !TRUSTED_API_ORIGINS.has(configured.origin)
  ) {
    throw new StaffPortalApiError("The Staff Portal API request is not configured.", "configuration");
  }
  return new URL(safePath, configured.origin).toString();
}

function neutralResponseError(status: number) {
  if (status === 401) return new StaffPortalApiError("Your Staff Portal session has expired. Sign in again.", "authentication", status);
  if (status === 403 || status === 404) return new StaffPortalApiError("This Staff Portal action is not available.", "authorization", status);
  if (status === 400 || status === 422) return new StaffPortalApiError("Review the submitted values and try again.", "validation", status);
  if (status === 409 || status === 412) return new StaffPortalApiError("The authoritative state changed. Refresh and try again.", "conflict", status);
  if (status === 429) return new StaffPortalApiError("The Staff Portal service is busy. Wait a moment and try again.", "rate_limit", status);
  return new StaffPortalApiError("The Staff Portal service is temporarily unavailable.", "unavailable", status);
}

export async function staffPortalApi<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof StaffPortalApiError) throw error;
    if (timedOut) throw new StaffPortalApiError("The Staff Portal service took too long to respond.", "timeout");
    if (options.signal?.aborted) throw error;
    throw new StaffPortalApiError("The Staff Portal service could not be reached.", "network");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
  if (!response.ok) throw neutralResponseError(response.status);
  if (response.status === 204) return {} as T;
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new StaffPortalApiError("The Staff Portal service returned an invalid response.", "invalid_response", response.status);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new StaffPortalApiError("The Staff Portal service returned an invalid response.", "invalid_response", response.status);
  }
}

export function apiErrorMessage(error: unknown) {
  return error instanceof StaffPortalApiError
    ? error.message
    : "The Staff Portal service could not complete that request.";
}
