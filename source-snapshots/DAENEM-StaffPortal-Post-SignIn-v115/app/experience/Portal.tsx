"use client";
import { activeEvidence } from "./evidence-state";
import { SmartRecordEditor } from "./smart-forms";
import { applyHandoff, handoffDefinitions } from "./handoffs";
import { validateImportBatch } from "./import-contract";
import { fixtureId } from "./fixture-id";
import { activeConfigurations, configurationGuard } from "./config-runtime";
import { type ConfigVersion } from "./enterprise-contract";
import { applyTransaction } from "./transactions";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CloudSun,
  ChevronRight,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Ellipsis,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Wifi,
  WifiOff,
  Plus,
  Users,
  Package,
  Truck,
  Car,
  ChartNoAxesCombined,
  BriefcaseBusiness,
  Printer,
  Monitor,
  ChevronDown,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  CircleHelp,
  Info,
  LifeBuoy,
  Settings,
  UserRound,
} from "lucide-react";
import "./record-interactions-v1.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command as CommandRoot,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  modules,
  byId,
  companies,
  layouts,
  canView,
  canAct,
  canRecordAct,
  canonicalEdit,
  recordsFor,
  authorizedRecords,
  recordsAreRelated,
  seedRecords,
  personFor,
  money,
  requirementsMissing,
  mutationError,
  authorizedCompaniesForModule,
  normalizeSessionCompany,
  sessionScopeKey,
  type Session,
  type Company,
  type Mode,
  type RecordData,
  type ModuleDef,
} from "./model";
import {
  Btn,
  IconBtn,
  Pick,
  Badge,
  Avatar,
  Panel,
  Callout,
  Timeline,
  Steps,
  Empty,
} from "./ui";
import { Context, useLab, type LabContext } from "./lab-context";
import { purgeDeviceStateMemory, useDeviceState } from "./device-state";
import {
  projectAudit,
  testProfiles,
  sessionForProfile,
  type AuditEvent,
} from "./security-contract";
import { neutralNotFound, fieldAccess, attentionRecords } from "./model";
import {
  formatRecordDateTime12,
  formatTime12,
  resolveAuthenticatedTimeZone,
} from "./time-standard";
const Workspace = lazy(() => import("./workspaces"));
import "./portal.css";
import "./enterprise-v3.css";
import "./scenery-v3.css";
import "./technology.css";
import "./portal-v13.css";
import "./portal-v14.css";
import "./portal-v22.css";
import "./navigation-v24.css";
import "./premium-shell-reset-v1.css";
import "./global-shell-admin.css";
import "./global-shell-weather-admin.css";
import "./cloud-storage-admin.css";
import "./printing-closure-v1.css";
import "./logistics-closure-v1.css";
import "./property-closure-v1.css";
import "./bakery-settlement-v1.css";
import "./offboarding-access-v1.css";
import GlobalShellAdmin from "./global-shell-admin";
import CloudStorageAdmin from "./cloud-storage-admin";
import { CURRENT_SAVED_SITE_VERSION } from "./site-version";
import { EntityQuickAccess, PageContext } from "./page-context";
import {
  GLOBAL_NAVIGATION,
  SIGNIN_STUDIO_ROUTE,
  studioNavigationFor,
  canViewStudioNavigationItem,
  studioSectionFromQuery,
  studioSectionPath,
  type StudioSectionId,
  type GlobalNavigationItem,
} from "./navigation-adapter";
export interface Preferences {
  radius?: number;
  effects?: { glow?: string; glass?: string; ambient?: string };
  customTokens?: { primary: string; surface: string; text: string };
  theme: string;
  layout: number;
  personalLayout?: boolean;
  orgLayout?: number;
  density: string;
  motion: string;
  navigation: string;
  forced: number | null;
  signin: {
    night: boolean;
    logoScale: string;
    clocks: string[];
    weather: boolean;
    context: boolean;
    glass: string;
    logoPosition: string;
    temperature: string;
    weatherDensity: string;
    experience?: string;
    locations?: string[];
    clockStyle?: string;
    focalPoint?: string;
    schedule?: string;
    dayExperience?: string;
    nightExperience?: string;
    overlay?: string;
    glow?: string;
    motionLevel?: string;
    aiVisual?: string;
    newsPresentation?: string;
    inspirationPresentation?: string;
  };
}
export const defaultPrefs: Preferences = {
  theme: "Daylight",
  layout: 0,
  personalLayout: false,
  orgLayout: 0,
  density: "Standard",
  motion: "Calm",
  navigation: "Sidebar",
  forced: null,
  signin: {
    night: false,
    logoScale: "Standard",
    clocks: ["Africa/Lagos", "Europe/London", "America/New_York"],
    weather: true,
    context: true,
    glass: "Balanced",
    logoPosition: "Left",
    temperature: "Fahrenheit",
    weatherDensity: "Standard",
  },
};
export function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className={`p-logo ${large ? "big" : ""}`}>
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path
          d="M8 5h12c12 0 18 7 18 16s-6 16-18 16H8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
        />
        <path
          d="M9 12l17 9L9 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
      </svg>
      <span>
        DAENEM<small>STAFF PORTAL</small>
      </span>
    </div>
  );
}
export const iconFor = (m: ModuleDef) =>
  m.company === "printing"
    ? Printer
    : m.company === "bakery"
      ? Package
      : m.company === "autos"
        ? Car
        : m.company === "logistics"
          ? Truck
          : m.company === "properties"
            ? Building2
            : m.family === "Staff ERP"
              ? Users
              : m.family === "Finance & Operations"
                ? ChartNoAxesCombined
                : m.family === "Jobs ERP"
                  ? BriefcaseBusiness
                  : m.family === "Security, Access & Admin"
                    ? Shield
                    : m.family === "Personalization"
                      ? SlidersHorizontal
                      : m.kind === "home"
                        ? LayoutDashboard
                        : Compass;
type AiSearchState =
  | "idle"
  | "typing"
  | "searching"
  | "reasoning"
  | "result-ready"
  | "offline"
  | "error";
const initialSession: Session = sessionForProfile("No permission");
const ORGANIZATION_WEATHER_UNIT = "F" as const;
const privilegedProjectionKey =
  /^(daenem-draft-record-|daenem-draft-form-response-|daenem-draft-form-canvas-)|^(daenem-draft-(favorites|table-views|saved|search)|daenem-demo-records-v3)$|^(favorites-|bookmarks-|recents-|recent-|saved-|search-history-|saved-search|dashboard-|record-selection-|fixture-projection-|daenem-demo-(favorites|bookmarks|recents|recent|saved|search|dashboard|selected|fixture))/i;
function hydrateSavedReviewProjection(saved: RecordData[], canonical: RecordData[]) {
  const canonicalByKey = new Map(
    canonical.map((row) => [`${row.module}:${row.id}`, row]),
  );
  return saved.map((row) => {
    if (row.module !== "performance") return row;
    const source = canonicalByKey.get(`${row.module}:${row.id}`);
    if (!source) return row;
    return {
      ...row,
      fields: {
        Employee: source.fields.Employee,
        "Review Notes": source.fields["Review Notes"],
        ...row.fields,
      },
    };
  });
}
function purgePrivilegedProjectionState() {
  if (typeof window === "undefined") return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key && privilegedProjectionKey.test(key)) storage.removeItem(key);
    }
  }
  purgeDeviceStateMemory();
  window.dispatchEvent(new Event("daenem-session-projection-reset"));
}
export default function Portal() {
  const path = usePathname() || "/",
    router = useRouter();
  const parts = path.split("/").filter(Boolean),
    isStudioPath =
      parts[0] === "admin" &&
      parts[1] === "experience" &&
      parts[2] === "sign-in-studio",
    isGlobalShellPath =
      parts[0] === "admin" &&
      parts[1] === "experience" &&
      parts[2] === "global-shell",
    isCloudStoragePath =
      parts[0] === "admin" &&
      parts[1] === "platform" &&
      parts[2] === "storage",
    adminContext = parts[0] === "admin" ? parts[1] || null : null,
    moduleId = isStudioPath ? "signin-design" : parts[0] || "signin",
    recordId = isStudioPath || (moduleId === "admin" && adminContext) ? undefined : parts[1],
    m = byId(moduleId);
  const [reviewTheme, setReviewTheme] = useState<string | null>(null);
  const [reviewMotionOff, setReviewMotionOff] = useState(false);
  const [studioSection, setStudioSection] = useState<StudioSectionId>("Home");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const value = query.get("reviewTheme");
    const timer = window.setTimeout(() => {
      setReviewTheme(value === "Daylight" || value === "Midnight" ? value : null);
      setReviewMotionOff(query.get("reviewMotion") === "off");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("reviewPopup") !== "1") return;
    const requestedWidth = Number(query.get("reviewWidth"));
    const requestedHeight = Number(query.get("reviewHeight"));
    if (
      !window.opener ||
      !Number.isInteger(requestedWidth) ||
      !Number.isInteger(requestedHeight) ||
      requestedWidth < 320 ||
      requestedHeight < 568 ||
      requestedWidth > 3840 ||
      requestedHeight > 2160
    ) {
      document.documentElement.dataset.reviewPopupViewport = "invalid";
      return;
    }
    let attempts = 0;
    let retryTimer: number | undefined;
    const alignViewport = () => {
      attempts += 1;
      const widthDelta = requestedWidth - window.innerWidth;
      const heightDelta = requestedHeight - window.innerHeight;
      if (widthDelta || heightDelta) {
        try {
          window.resizeBy(widthDelta, heightDelta);
        } catch {
          // Browsers may refuse scripted window resizing. The measured viewport
          // below remains authoritative and prevents a false exact-size claim.
        }
      }
      document.documentElement.dataset.reviewPopupRequested =
        `${requestedWidth}×${requestedHeight}`;
      document.documentElement.dataset.reviewPopupViewport =
        `${window.innerWidth}×${window.innerHeight}`;
      document.documentElement.dataset.reviewPopupExact =
        window.innerWidth === requestedWidth && window.innerHeight === requestedHeight
          ? "true"
          : "false";
      if (
        attempts < 3 &&
        (window.innerWidth !== requestedWidth || window.innerHeight !== requestedHeight)
      ) {
        retryTimer = window.setTimeout(alignViewport, 80);
      }
    };
    const timer = window.setTimeout(alignViewport, 0);
    return () => {
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, []);
  useEffect(() => {
    const syncStudioSection = () => {
      setStudioSection(
        isStudioPath
          ? studioSectionFromQuery(
              new URLSearchParams(window.location.search).get("studioSection"),
            )
          : "Home",
      );
    };
    syncStudioSection();
    window.addEventListener("popstate", syncStudioSection);
    window.addEventListener("daenem-studio-section-change", syncStudioSection);
    return () => {
      window.removeEventListener("popstate", syncStudioSection);
      window.removeEventListener("daenem-studio-section-change", syncStudioSection);
    };
  }, [isStudioPath]);
  const [session, setSession] = useState<Session>(initialSession),
    [signed, setSigned] = useState(false),
    [ready, setReady] = useState(false),
    [records, setRecords] = useState<RecordData[]>(seedRecords),
    [prefs, setPrefs] = useState<Preferences>(defaultPrefs),
    [mode, setMode] = useState<Mode>("Demo Data"),
    [mobile, setMobile] = useState(false),
    [command, setCommand] = useState(false),
    [dev, setDev] = useState(false),
    [drawer, setDrawer] = useState<
      "help" | "actions" | "profile" | "version" | "weather" | null
    >(null),
    [editing, setEditing] = useState<{
      row: RecordData;
      module: ModuleDef;
      isNew: boolean;
    } | null>(null),
    [pendingSignout, setPendingSignout] = useState(false),
    [sensitiveAction, setSensitiveAction] = useState<(() => void) | null>(null),
    [reauthPassword, setReauthPassword] = useState(""),
    [reauthError, setReauthError] = useState(""),
    [clock, setClock] = useState(""),
    [clockZone, setClockZone] = useState(""),
    [recentRefs, setRecentRefs] = useState<string[]>([]),
    [shellNavCollapsed, setShellNavCollapsed] = useState(false),
    [commandQuery, setCommandQuery] = useState(""),
    [aiSearchState, setAiSearchState] = useState<AiSearchState>("idle"),
    [notificationAcknowledged, setNotificationAcknowledged] = useState(false);
  const [weatherUnitOverride, setWeatherUnitOverride] = useDeviceState<
    "F" | "C" | null
  >(`weather-unit-${session.personId}`, null);
  const weatherUnit = weatherUnitOverride ?? ORGANIZATION_WEATHER_UNIT;
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const commandRestoreRef = useRef<HTMLElement | null>(null);
  const drawerRestoreRef = useRef<HTMLElement | null>(null);
  const mobileNavigationRestoreRef = useRef<HTMLElement | null>(null);
  const restoreCommandFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = commandRestoreRef.current || commandTriggerRef.current;
      if (target?.isConnected) target.focus();
      commandRestoreRef.current = null;
    });
  }, []);
  const openCommandPalette = useCallback(() => {
    const active = document.activeElement;
    commandRestoreRef.current = active instanceof HTMLElement ? active : commandTriggerRef.current;
    setCommand(true);
  }, []);
  const closeCommandPalette = useCallback((open: boolean) => {
    setCommand(open);
    if (!open) {
      setCommandQuery("");
      setAiSearchState("idle");
      restoreCommandFocus();
    }
  }, [restoreCommandFocus]);
  const openDrawer = useCallback((next: "help" | "actions" | "profile" | "version" | "weather") => {
    const active = document.activeElement;
    drawerRestoreRef.current = active instanceof HTMLElement && !active.closest("#ask-daenem-command")
      ? active
      : commandTriggerRef.current;
    setDrawer(next);
  }, []);
  const restoreDrawerFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = drawerRestoreRef.current;
      if (target?.isConnected) target.focus();
      drawerRestoreRef.current = null;
    });
  }, []);
  const openMobileNavigation = useCallback(() => {
    const active = document.activeElement;
    mobileNavigationRestoreRef.current =
      active instanceof HTMLElement ? active : null;
    setMobile(true);
  }, []);
  const restoreMobileNavigationFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = mobileNavigationRestoreRef.current;
      if (target?.isConnected) target.focus();
      mobileNavigationRestoreRef.current = null;
    });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const s = sessionStorage.getItem("daenem-demo-session-v3");
        if (s) {
          setSession(normalizeSessionCompany(JSON.parse(s) as Session));
          setSigned(true);
        }
        const isReviewHarness =
          new URLSearchParams(window.location.search).get("reviewHarness") ===
          "1";
        const r = localStorage.getItem("daenem-demo-records-v3");
        if (isReviewHarness) {
          setRecords(seedRecords());
        } else if (r) {
          const saved: RecordData[] = JSON.parse(r);
          const canonical = seedRecords();
          const hydratedSaved = hydrateSavedReviewProjection(saved, canonical);
          setRecords([
            ...hydratedSaved,
            ...canonical.filter(
              (row) =>
                !hydratedSaved.some(
                  (x) => x.module === row.module && x.id === row.id,
                ),
            ),
          ]);
        }
        const p = localStorage.getItem("daenem-demo-prefs-v3");
        if (p) setPrefs({ ...defaultPrefs, ...JSON.parse(p) });
      } catch {}
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("daenem-demo-records-v3", JSON.stringify(records));
        localStorage.setItem("daenem-demo-prefs-v3", JSON.stringify(prefs));
        if (signed)
          sessionStorage.setItem(
            "daenem-demo-session-v3",
            JSON.stringify(session),
          );
      } catch {
        toast.warning(
          "Device storage is unavailable. Current demo changes remain in memory.",
        );
      }
    }
  }, [records, prefs, session, signed, ready]);
  useEffect(() => {
    const update = () => {
      const zone = resolveAuthenticatedTimeZone({
        role: session.role,
        displayTimeZone: session.displayTimeZone,
      });
      setClockZone(zone);
      setClock(formatTime12(new Date(), zone));
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, [session.displayTimeZone, session.role]);
  useEffect(() => {
    const warn = () =>
      toast.warning(
        "Device storage is unavailable. Keep this page open to retain your current demo draft.",
      );
    window.addEventListener("daenem-storage-warning", warn);
    return () => window.removeEventListener("daenem-storage-warning", warn);
  }, []);
  useEffect(() => {
    if (ready && !signed) purgePrivilegedProjectionState();
  }, [ready, signed]);
  useEffect(() => {
    if (!signed) return;
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (command) closeCommandPalette(false);
        else openCommandPalette();
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [command, openCommandPalette, closeCommandPalette, signed]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobile(false);
      setDrawer(null);
      setEditing(null);
      window.scrollTo({ top: 0 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [path]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]),
    [auditReady, setAuditReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("daenem-demo-audit-v4");
        if (saved) setAuditLog(JSON.parse(saved));
      } catch {}
      setAuditReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (auditReady)
      try {
        localStorage.setItem("daenem-demo-audit-v4", JSON.stringify(auditLog));
      } catch {
        window.dispatchEvent(new Event("daenem-storage-warning"));
      }
  }, [auditLog, auditReady]);
  function audit(
    action: string,
    target: string,
    before = "",
    after = "",
    reason = "",
    type: "business" | "security" = "business",
  ) {
    const id = fixtureId();
    setAuditLog((items) => [
      ...items,
      {
        id,
        type,
        action,
        target,
        before,
        after,
        reason,
        actor: personFor(session),
        company: session.company,
        time: new Date().toISOString(),
        session: session.personId,
        correlation: id,
        device: "Browser-local simulation",
        ip: "Not collected",
      },
    ]);
  }
  const studioAccess = canViewStudioNavigationItem("Home", session);
  const studioSectionAccess =
    !isStudioPath || canViewStudioNavigationItem(studioSection, session);
  const adminModule = byId("admin");
  const globalShellAccess = Boolean(
    adminModule && canAct(adminModule, session, "manage"),
  );
  const cloudStorageAccess = globalShellAccess;
  const allowed = signed
    ? modules.filter(
        (x) => canView(x, session) && (x.id !== "signin-design" || studioAccess),
      )
    : [];
  const allowedRows = signed ? authorizedRecords(records, session) : [];
  const globalUtilityAccess = canView(byId("help"), session);
  const commandBusinessAreas = [
    ...new Map(allowed.map((item) => [item.family, item])).values(),
  ];
  const commandPeopleRows = allowedRows.filter((row) =>
    ["people", "hr-records", "performance", "lifecycle"].includes(row.module),
  );
  const commandJobRows = allowedRows.filter((row) =>
    ["applications", "interviews", "hiring"].includes(row.module),
  );
  const commandLogRows = allowedRows.filter((row) =>
    ["audit", "security"].includes(row.module),
  );
  const commandCategorizedRefs = new Set(
    [...commandPeopleRows, ...commandJobRows, ...commandLogRows].map(
      (row) => `${row.module}:${row.id}`,
    ),
  );
  const commandRecordRows = allowedRows.filter(
    (row) => !commandCategorizedRefs.has(`${row.module}:${row.id}`),
  );
  const companyPermissionContext =
    isStudioPath ||
    (moduleId === "admin" &&
      adminContext === "experience" &&
      !canView(m, session) &&
      studioAccess)
      ? byId("signin-design")
      : m;
  const authorizedCompanyIds = authorizedCompaniesForModule(
    session,
    companyPermissionContext,
  );
  const authorizedCompanyOptions = companies.filter((company) => authorizedCompanyIds.includes(company.id));
  const commandGovernedControls = [
    {
      moduleId: "communication-settings",
      value:
        "Communications Control communication governance recovery WhatsApp eligibility",
      route: "/communication-settings",
      label: "Communications Control",
      detail: "Owner · communication policy and provider release gates",
    },
    {
      moduleId: "meta-credential-vault",
      value:
        "Meta Credential Vault Facebook WhatsApp protected provider credentials",
      route: "/meta-credential-vault",
      label: "Meta Credential Vault",
      detail:
        "Owner · protected backend vault · connection state unavailable",
    },
  ].filter((item) => allowed.some((module) => module.id === item.moduleId));
  const activeSessionScopeKey = sessionScopeKey(session);
  const recentRows = recentRefs
    .map((ref) => allowedRows.find((row) => `${row.module}:${row.id}` === ref))
    .filter((row): row is RecordData => Boolean(row));
  const authorizedSearchTerms = [
    ...allowed.flatMap((item) => [item.title, item.family]),
    ...allowedRows.flatMap((row) => [row.title, row.id]),
    ...(studioAccess
      ? studioNavigationFor(session)
          .filter((item) => item.id !== "Home")
          .flatMap((item) => [item.label, item.description])
      : []),
    ...(cloudStorageAccess
      ? ["Cloud Storage & Backup", "Cloudflare R2", "Microsoft OneDrive secondary backup"]
      : []),
    ...(globalUtilityAccess
      ? [CURRENT_SAVED_SITE_VERSION, "Staff Portal Release", "Release Details"]
      : []),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const normalizedCommandQuery = commandQuery.trim().toLocaleLowerCase();
  const commandPrediction = normalizedCommandQuery.length >= 2
    ? authorizedSearchTerms.find((value) => {
        const normalizedValue = value.toLocaleLowerCase();
        return normalizedValue.startsWith(normalizedCommandQuery) &&
          normalizedValue !== normalizedCommandQuery;
      }) || ""
    : "";
  const commandPredictionSuffix = commandPrediction
    ? commandPrediction.slice(commandQuery.trim().length)
    : "";
  const hasAuthorizedSearchMatch = normalizedCommandQuery.length > 0 &&
    authorizedSearchTerms.some((value) =>
      value.toLocaleLowerCase().includes(normalizedCommandQuery),
    );
  const effectiveAiSearchState: AiSearchState = mode === "Offline"
    ? "offline"
    : mode === "Error" || mode === "Integration Unavailable"
      ? "error"
      : aiSearchState;
  useEffect(() => {
    if (!command || !normalizedCommandQuery) return;
    const searching = window.setTimeout(() => setAiSearchState("searching"), 120);
    const reasoning = window.setTimeout(() => setAiSearchState("reasoning"), 260);
    const ready = window.setTimeout(
      () => setAiSearchState(hasAuthorizedSearchMatch ? "result-ready" : "idle"),
      440,
    );
    return () => {
      window.clearTimeout(searching);
      window.clearTimeout(reasoning);
      window.clearTimeout(ready);
    };
  }, [command, hasAuthorizedSearchMatch, normalizedCommandQuery]);
  const adminExperienceSurface =
    moduleId === "admin" &&
    adminContext === "experience" &&
    (studioAccess || globalShellAccess) &&
    (!isGlobalShellPath || globalShellAccess);
  const adminPlatformSurface =
    moduleId === "admin" &&
    adminContext === "platform" &&
    isCloudStoragePath &&
    cloudStorageAccess;
  const surfaceAccess = isGlobalShellPath
    ? globalShellAccess
    : isCloudStoragePath
      ? cloudStorageAccess
    : (Boolean(m && canView(m, session)) && studioSectionAccess) ||
      adminExperienceSurface ||
      adminPlatformSurface;
  const noAuthorizedWorkspace = ready && signed && allowed.length === 0;
  useEffect(() => {
    if (ready && signed && isStudioPath && !studioSectionAccess) {
      router.replace("/unavailable");
    }
  }, [isStudioPath, ready, router, signed, studioSectionAccess]);
  function routeFor(id: string) {
    const canonical = byId(id)?.canonicalPath;
    if (canonical) return canonical;
    if (id.startsWith("admin/experience/sign-in-studio")) return `/${id}`;
    if (id.startsWith("/")) return id;
    return "/" + id;
  }
  function goRoute(route: string, capabilityModuleId?: string) {
    const studioDestination = route.startsWith(SIGNIN_STUDIO_ROUTE);
    const targetId = capabilityModuleId ||
      (studioDestination ? "signin-design" : route.split("/").filter(Boolean)[0]);
    const target = byId(targetId);
    const requestedSection = studioDestination
      ? studioSectionFromQuery(
          new URL(route, window.location.origin).searchParams.get("studioSection"),
        )
      : "Home";
    const permitted = studioDestination
      ? canViewStudioNavigationItem(requestedSection, session)
      : target
        ? canView(target, session)
        : false;
    if (!permitted) {
      setCommand(false);
      setCommandQuery("");
      setAiSearchState("idle");
      setMobile(false);
      router.push("/unavailable");
      return;
    }
    setCommand(false);
    setCommandQuery("");
    setAiSearchState("idle");
    setMobile(false);
    router.push(route);
  }
  function go(id: string) {
    const route = id === "admin/experience"
      ? "/admin/experience"
      : id.startsWith("admin/experience/sign-in-studio")
        ? `/${id}`
        : routeFor(id);
    goRoute(route, id.startsWith("admin/experience") ? "signin-design" : undefined);
  }
  function changeSession(s: Session) {
    const nextSession = normalizeSessionCompany(s);
    purgePrivilegedProjectionState();
    setRecentRefs([]);
    audit(
      "Preview context changed",
      "demo-session",
      session.profile || session.role,
      nextSession.profile || nextSession.role,
      "Explicit development preview selection",
      "security",
    );
    setSession(nextSession);
    setCommand(false);
    setCommandQuery("");
    setAiSearchState("idle");
    setNotificationAcknowledged(false);
    setSensitiveAction(null);
    setMode("Demo Data");
    setEditing(null);
    setDrawer(null);
    if (
      (isStudioPath && !canViewStudioNavigationItem(studioSection, nextSession)) ||
      (isGlobalShellPath && !(byId("admin") && canAct(byId("admin")!, nextSession, "manage"))) ||
      (isCloudStoragePath && !(byId("admin") && canAct(byId("admin")!, nextSession, "manage"))) ||
      (m && !canView(m, nextSession))
    )
      router.push("/home");
  }
  function open(row: RecordData, mod?: ModuleDef) {
    const visible = (a: ModuleDef) =>
      recordsFor(records, a, session).some(
        (r) => r.module === row.module && r.id === row.id,
      );
    const preferred = mod || byId(row.module);
    const model =
      preferred && visible(preferred) ? preferred : allowed.find(visible);
    if (model) {
      const ref = `${row.module}:${row.id}`;
      setRecentRefs((current) =>
        [ref, ...current.filter((item) => item !== ref)].slice(0, 6),
      );
      go(`${model.id}/${encodeURIComponent(row.id)}`);
    }
  }
  function create(mod: ModuleDef) {
    if (!canAct(mod, session, "create")) return;
    const row: RecordData = {
      id:
        mod.id.toUpperCase().slice(0, 3) +
        "-" +
        fixtureId().slice(-6),
      module: mod.id,
      title: "",
      subtitle:
        companies.find((c) => c.id === session.company)?.name ||
        "Daenem Printing & Technology",
      company:
        mod.company ||
        (session.company === "group" ? "printing" : session.company),
      status: mod.stages[0],
      owner: personFor(session),
      amount: 0,
      due: new Date().toISOString().slice(0, 10),
      fields: Object.fromEntries(mod.fields.map((f) => [f, ""])),
      evidence: [],
      history: [],
    };
    setEditing({ row, module: mod, isNew: true });
  }
  function mutate(
    row: RecordData,
    fields: Record<string, string>,
    status = row.status,
    action = "Record updated",
  ) {
    if (
      mode === "Offline" &&
      (status !== row.status || !["Draft", "To Do", "New"].includes(status))
    ) {
      toast.error(
        "Reconnect before this action. Only draft edits are available offline.",
      );
      return false;
    }
    const stored = records.find(
      (r) => r.module === row.module && r.id === row.id,
    );
    const isNew = !stored;
    const canonical = canonicalEdit(stored, row, session);
    const rules: ConfigVersion[] = [];
    for (const kind of [
      "workflow-builder",
      "business-rules",
      "field-builder",
    ]) {
      try {
        rules.push(
          ...activeConfigurations(
            JSON.parse(
              localStorage.getItem(
                "daenem-draft-governed-" + kind + "-" + session.company,
              ) || "[]",
            ),
            session,
          ).filter((v) => v.target === row.module),
        );
      } catch {
        toast.error(
          "An active configuration could not be read. Restore a valid configuration before changing records.",
        );
        return false;
      }
    }
    for (const rule of rules) {
      if (
        rule.kind === "field-builder" &&
        rule.definition.required === "Yes" &&
        status !== row.status &&
        !{ ...row.fields, ...fields }[rule.name]?.trim()
      ) {
        toast.error(rule.name + " is required.");
        return false;
      }
      if (
        rule.kind === "workflow-builder" &&
        rule.definition.edges &&
        status !== row.status
      ) {
        try {
          const edges = JSON.parse(rule.definition.edges) as {
            from: string;
            to: string;
            condition: string;
          }[];
          for (const edge of edges.filter(
            (e) => e.from === row.status && e.to === status,
          )) {
            const blocked = configurationGuard(
              { ...rule, definition: { ...rule.definition, ...edge } },
              { ...row, fields: { ...row.fields, ...fields } },
              personFor(session),
            );
            if (blocked) {
              toast.error(blocked);
              return false;
            }
          }
        } catch {
          toast.error(
            "The active workflow configuration is invalid. Ask an authorized administrator to restore a valid version.",
          );
          return false;
        }
      }
      if (
        rule.kind !== "field-builder" &&
        status !== row.status &&
        rule.definition.from === row.status &&
        rule.definition.to === status
      ) {
        const blocked = configurationGuard(
          rule,
          { ...row, fields: { ...row.fields, ...fields } },
          personFor(session),
        );
        if (blocked) {
          toast.error(blocked);
          return false;
        }
      }
    }
    const error = mutationError(canonical, fields, status, session, isNew);
    if (error) {
      toast.error(error);
      return false;
    }
    if (stored && row.revision !== stored.revision) {
      toast.error("This record changed. Reopen it before saving.");
      return false;
    }
    const next = {
      ...canonical,
      title:
        fieldAccess(row.module, "Title", session) === "edit"
          ? row.title
          : canonical.title,
      revision: (stored?.revision || 0) + 1,
      fields: { ...canonical.fields, ...fields },
      status,
      amount:
        fields.Amount !== undefined ? Number(fields.Amount) : canonical.amount,
      history: [
        ...canonical.history,
        {
          action: mode === "Offline" ? `${action} · Waiting to Sync` : action,
          actor: personFor(session),
          time: new Date().toISOString(),
        },
      ],
    };
    let updated: RecordData[];
    try {
      updated = applyTransaction(records, stored || row, next, session);
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
    audit(
      action,
      row.module + ":" + row.id,
      stored?.status || "New",
      status,
      fields["Decision Reason"] || "User action",
    );
    setRecords(updated);
    toast.success(
      mode === "Offline"
        ? "Demo draft saved on this device · Waiting to Sync"
        : `${action} · Demo only`,
    );
    return true;
  }
  function handoff(row: RecordData, target: string, reason: string) {
    if (mode === "Offline") {
      toast.error("Reconnect before a linked handoff.");
      return false;
    }
    try {
      const result = applyHandoff(records, row, target, session, reason);
      setRecords(result.records);
      audit(
        "Linked handoff",
        row.module + ":" + row.id,
        row.status,
        result.created.module,
        reason,
      );
      toast.success("Linked record created in the local lab");
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }
  function importBatch(batch: RecordData[]) {
    if (mode === "Offline" || !canAct(byId("data-import")!, session, "edit"))
      return false;
    const error = validateImportBatch(batch, session, records);
    if (error) {
      toast.error(error + " No rows changed.");
      return false;
    }
    const next = batch.map((r) => ({
      ...r,
      revision: 1,
      history: [
        {
          action: "Imported local batch",
          actor: personFor(session),
          time: new Date().toISOString(),
        },
      ],
    }));
    setRecords((current) => [...current, ...next]);
    for (const row of next)
      audit(
        "Imported record",
        row.module + ":" + row.id,
        "",
        row.status,
        "Validated local batch",
      );
    toast.success(next.length + " local records imported");
    return true;
  }
  const effectivePrefs = reviewMotionOff ? { ...prefs, motion: "Off" } : prefs;
  const ctx: LabContext = {
    handoff,
    importBatch,
    auditLog: projectAudit(auditLog, records, session),
    audit,
    session,
    setSession: changeSession,
    records: allowedRows,
    mode,
    setMode,
    go,
    open,
    create,
    mutate,
    prefs: effectivePrefs,
    setPrefs,
    notice: (s) => toast.info(s + " · Demo only"),
    signout: () => setPendingSignout(true),
    reauth: (action) => {
      setReauthPassword("");
      setReauthError("");
      setSensitiveAction(() => action);
    },
  };
  const signin = (moduleId === "signin" || !signed) && !noAuthorizedWorkspace;
  const selected =
    m && recordId
      ? recordsFor(records, m, session).find(
          (r) => r.id === decodeURIComponent(recordId),
        )
      : undefined;
  const noticeRows = attentionRecords(records, session);
  const hasAuthoritativeNotificationFreshness = false;
  const hasNewAuthorizedNotifications =
    hasAuthoritativeNotificationFreshness &&
    noticeRows.length > 0 &&
    !notificationAcknowledged;
  const canUseGlobalUtility = globalUtilityAccess;
  const drawerTitle =
    drawer === "help"
      ? "Help & Support"
      : drawer === "actions"
        ? "Notifications"
        : drawer === "profile"
          ? "Profile & Preferences"
          : drawer === "version"
            ? "Release Details"
            : "Weather";
  const drawerDescription =
    drawer === "help"
      ? "Contextual guidance and supported assistance for your authorized workspace."
      : drawer === "actions"
        ? "Your permitted requests and follow-ups."
        : drawer === "profile"
          ? "Session-aware account, preference and company controls."
          : drawer === "version"
            ? "Details about the Staff Portal release available to you."
            : "Truthful provider, freshness and unit status.";
  const activeStudioItem = studioNavigationFor(session).find(
    (item) => item.id === studioSection,
  );
  const contextVisible = (entry: (typeof GLOBAL_NAVIGATION)[number]["context"][number]) =>
    entry.id === "experience"
      ? canViewStudioNavigationItem("Home", session)
      : entry.id === "cloud-storage"
        ? cloudStorageAccess
      : canView(byId(entry.permissionModuleId), session);
  const visibleGlobal = (item: GlobalNavigationItem) =>
    item.id === "admin"
      ? canView(byId("admin"), session) || studioAccess
      : canView(byId(item.permissionModuleId), session) ||
        item.context.some((entry) => contextVisible(entry));
  const visibleGlobalItems = GLOBAL_NAVIGATION.filter(visibleGlobal);
  const pinnedGlobalItems = visibleGlobalItems.filter((item) => item.pinned);
  const mobileHome = visibleGlobalItems.find((item) => item.id === "home");
  const mobileMyWork = visibleGlobalItems.find((item) => item.id === "my-work");
  const requestedGlobal = GLOBAL_NAVIGATION.find((item) =>
    item.id === "admin"
      ? moduleId === "admin" || moduleId === "signin-design"
      : item.context.some(
          (entry) =>
            entry.moduleId === moduleId || entry.permissionModuleId === moduleId,
        ),
  );
  const activeGlobal =
    requestedGlobal && visibleGlobal(requestedGlobal)
      ? requestedGlobal
      : visibleGlobalItems[0];
  const destinationForGlobalItem = (item: GlobalNavigationItem) => {
    const rootVisible =
      item.id === "admin"
        ? canView(byId("admin"), session)
        : canView(byId(item.permissionModuleId), session);
    return {
      route:
        item.id === "admin" && !rootVisible
          ? "/admin/experience"
          : rootVisible
            ? item.route
            : item.context.find((entry) => contextVisible(entry))?.route || item.route,
      capabilityModuleId:
        item.id === "admin" && !rootVisible ? "signin-design" : undefined,
    };
  };
  const authorizedModule = m && canView(m, session) ? m : undefined;
  const activeCompany = companies.find((company) => company.id === session.company);
  const workspaceAuthorized = Boolean(
    m &&
      surfaceAccess &&
      mode !== "Permission Denied" &&
      (!recordId || selected),
  );
  const deniedRecordSurface = Boolean(
    recordId || (m?.kind === "records" && !surfaceAccess),
  );
  const homeBreadcrumb = {
    label: activeCompany?.short || "Workspace",
    route: "/home",
    capabilityModuleId: "home",
  };
  const breadcrumbItems: Array<{
    label: string;
    route?: string;
    capabilityModuleId?: string;
  }> = !workspaceAuthorized
    ? [{ label: "Workspace" }]
    : isStudioPath && studioSectionAccess
    ? [
        homeBreadcrumb,
        { label: "Admin", route: "/admin/experience", capabilityModuleId: "signin-design" },
        { label: "Experience", route: "/admin/experience", capabilityModuleId: "signin-design" },
        { label: "Sign-In Studio", route: studioSectionPath("Home"), capabilityModuleId: "signin-design" },
        ...(studioSection !== "Home" && activeStudioItem
          ? [{ label: activeStudioItem.label }]
          : []),
      ]
    : adminExperienceSurface
      ? [
          homeBreadcrumb,
          { label: "Admin", route: "/admin", capabilityModuleId: "admin" },
          { label: "Experience", route: "/admin/experience", capabilityModuleId: "admin" },
          ...(isGlobalShellPath ? [{ label: "Global Shell" }] : []),
        ]
      : adminPlatformSurface
        ? [
            homeBreadcrumb,
            { label: "Admin", route: "/admin", capabilityModuleId: "admin" },
            { label: "Platform", route: "/admin", capabilityModuleId: "admin" },
            { label: "Cloud Storage & Backup" },
          ]
      : [
          homeBreadcrumb,
          ...(activeGlobal
            ? [{ label: activeGlobal.label, ...destinationForGlobalItem(activeGlobal) }]
            : []),
          ...(authorizedModule &&
          authorizedModule.id !== activeGlobal?.moduleId &&
          authorizedModule.id !== "admin"
            ? [{
                label: authorizedModule.title,
                route: routeFor(authorizedModule.id),
                capabilityModuleId: authorizedModule.id,
              }]
            : []),
          ...(recordId && selected ? [{ label: selected.title }] : []),
        ];
  if (breadcrumbItems.length > 1) {
    delete breadcrumbItems[breadcrumbItems.length - 1].route;
    delete breadcrumbItems[breadcrumbItems.length - 1].capabilityModuleId;
  }
  const workspaceTitle = !workspaceAuthorized
    ? "Workspace"
    : selected
      ? selected.title
      : isStudioPath
        ? studioSection !== "Home" && activeStudioItem
          ? activeStudioItem.label
          : "Sign-In Studio"
        : adminExperienceSurface
          ? isGlobalShellPath
            ? "Global Shell"
            : "Experience"
          : adminPlatformSurface
            ? "Cloud Storage & Backup"
          : m?.id === "home"
            ? session.role === "Owner"
              ? "Your Group, in Perspective."
              : session.role === "Manager"
                ? "Your Team. A Clear Direction."
                : "Make Today Count."
            : authorizedModule?.title || "Workspace";
  const workspaceDescription = !workspaceAuthorized
    ? "This destination is unavailable."
    : isStudioPath
      ? activeStudioItem?.description ||
        "Governed sign-in experience tools for authorized administrators."
      : adminExperienceSurface
        ? isGlobalShellPath
          ? "Review the organization shell contract and prepare permission-aware settings without implying persistence."
          : "Owner-controlled experience tools and governed Sign-In Studio surfaces."
        : adminPlatformSurface
          ? "Govern Cloudflare R2 primary storage and the required asynchronous Microsoft OneDrive secondary-copy contract."
        : authorizedModule?.id === "home"
          ? `Good morning, ${personFor(session).split(" ")[0]}. Here is what needs your attention.`
          : authorizedModule?.purpose || "Authorized workspace";
  const workspaceActions = workspaceAuthorized && m ? (
    <div className="p-head-actions">
      {selected ? (
        <Btn variant="quiet" onClick={() => go(m.id)}>
          Back to {m.title}
        </Btn>
      ) : (
        !isStudioPath &&
        !adminExperienceSurface &&
        !adminPlatformSurface &&
        ![
          "home",
          "hub",
          "studio",
          "profile",
          "work",
          "cockpit",
          "attendance",
          "help",
          "signin-studio",
          "integrations",
          "resources",
          "archive",
        ].includes(m.kind) &&
        canAct(m, session, "create") && (
          <Btn
            onClick={() => {
              if (
                /^(Create|Add|Plan|Draft|Start|Schedule|Record|Capture|Prepare)/.test(
                  m.primary,
                )
              )
                create(m);
              else {
                const row = recordsFor(records, m, session)[0];
                if (row) open(row, m);
                else toast.info("No authorized records are available.");
              }
            }}
          >
            <Plus size={16} />
            {m.primary}
          </Btn>
        )
      )}
      {m.kind === "home" && canView(byId("layout"), session) && (
        <Btn variant="outline" onClick={() => go("layout")}>
          <SlidersHorizontal size={16} />
          Customize
        </Btn>
      )}
    </div>
  ) : null;
  const contextualItems = activeGlobal
    ? activeGlobal.context.filter((entry) => contextVisible(entry))
    : [];
  const activeContext = (entry: { id: string; moduleId?: string; permissionModuleId: string }) =>
    entry.id === "experience"
      ? adminContext === "experience" || isStudioPath
      : entry.id === "cloud-storage"
        ? isCloudStoragePath
      : entry.moduleId === moduleId || entry.permissionModuleId === moduleId;
  const nav = (
    <>
      <div className="p-shell-brand">
        <Logo />
        <button
          className="p-shell-collapse"
          aria-label={shellNavCollapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!shellNavCollapsed}
          title={shellNavCollapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setShellNavCollapsed((value) => !value)}
        >
          {shellNavCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <button
        className="p-company"
        onClick={() => (session.role === "Owner" ? setDev(true) : go("hub"))}
      >
        <span className="p-company-symbol">D</span>
        <span>
          <strong>
            {companies.find((c) => c.id === session.company)?.name}
          </strong>
          <small>
            {session.role === "Owner"
              ? "Group workspace"
              : "Assigned workspace"}
          </small>
        </span>
        <ChevronDown size={14} />
      </button>
      <div className="p-adaptive-navigation">
        <nav className="p-global-nav" aria-label="Global modules">
          {pinnedGlobalItems.length > 0 && (
            <div className="p-nav-cluster p-pinned-nav">
              <span className="p-nav-label"><Pin size={11} aria-hidden="true" /> PINNED</span>
              {pinnedGlobalItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeGlobal?.id === item.id;
                return (
                  <button
                    key={`pinned-${item.id}`}
                    className={isActive ? "active" : ""}
                    aria-label={`Pinned: ${item.label}`}
                    onClick={() => {
                      if (shellNavCollapsed) setShellNavCollapsed(false);
                      goRoute(item.route, item.moduleId);
                    }}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <span className="p-nav-label">AREAS</span>
          {visibleGlobalItems.map((item) => {
            const Icon = item.icon;
            const destination = destinationForGlobalItem(item);
            const isActive = activeGlobal?.id === item.id;
            return (
              <button
                key={item.id}
                className={isActive ? "active" : ""}
                title={item.description}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  if (shellNavCollapsed) setShellNavCollapsed(false);
                  goRoute(destination.route, destination.capabilityModuleId);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <nav className="p-context-nav" aria-label={`${activeGlobal?.label || "Workspace"} contextual navigation`}>
          <span className="p-nav-label">{activeGlobal?.label || "Workspace"}</span>
          <div className="p-context-heading">
            <strong>Available Pages</strong>
          </div>
          {contextualItems.map((entry) => (
            <button
              key={entry.id}
              className={activeContext(entry) ? "active" : ""}
              aria-current={activeContext(entry) ? "page" : undefined}
              onClick={() => goRoute(entry.route, entry.permissionModuleId)}
            >
              <ChevronRight size={14} aria-hidden="true" />
              <span>{entry.label}</span>
            </button>
          ))}
          {activeGlobal?.id === "admin" && (adminContext === "experience" || isStudioPath) && (studioAccess || globalShellAccess) && (
            <div className="p-context-branch">
              <span className="p-nav-label">EXPERIENCE</span>
              {studioAccess && (
                <button
                  className={isStudioPath ? "active" : ""}
                  aria-current={isStudioPath ? "page" : undefined}
                  onClick={() => goRoute(studioSectionPath("Home"), "signin-design")}
                >
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Sign-In Studio</span>
                </button>
              )}
              {globalShellAccess && (
                <button
                  className={isGlobalShellPath ? "active" : ""}
                  aria-current={isGlobalShellPath ? "page" : undefined}
                  onClick={() => goRoute("/admin/experience/global-shell", "admin")}
                >
                  <Settings size={15} aria-hidden="true" />
                  <span>Global Shell</span>
                </button>
              )}
            </div>
          )}
          {recentRows.length > 0 && (
            <div className="p-context-recents">
              <span className="p-nav-label">RECENT</span>
              {recentRows.slice(0, 3).map((row) => (
                <button key={`nav-recent-${row.module}-${row.id}`} onClick={() => open(row)}>
                  <History size={14} aria-hidden="true" />
                  <span>{row.title}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </div>
      <div className="p-sidebar-bottom">
        <div className="p-shell-utility-label">
          <Shield size={14} aria-hidden="true" />
          <span>Secure Workspace</span>
        </div>
        {canView(byId("layout")!, session) && (
          <button onClick={() => go("layout")}>
            <SlidersHorizontal size={17} />
            Personalize workspace
          </button>
        )}
        {canView(byId("help")!, session) && (
          <button onClick={() => openDrawer("help")}>
            <Bot size={17} />
            AI Guide
          </button>
        )}
        {canView(byId("profile"), session) && (
          <button
            className="p-user-card"
            onClick={() => go("profile")}
            aria-label="Open my profile"
          >
            <Avatar name={personFor(session)} />
            <span>
              <strong>{personFor(session)}</strong>
              <small>{session.role} · Demo Session</small>
            </span>
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </>
  );
  if (!ready)
    return (
      <div className="p-start">
        <Logo />
        <p>Preparing your workspace…</p>
      </div>
    );
  return (
    <TooltipProvider>
      <Context.Provider value={ctx}>
        <div
          key={activeSessionScopeKey}
          data-workspace={workspaceAuthorized || signin ? moduleId : "workspace"}
          data-review-ready={ready && signed ? "true" : "false"}
          data-review-authorized={workspaceAuthorized ? "true" : "false"}
          style={
            {
              "--tech-radius": (prefs.radius ?? 16) + "px",
              ...(prefs.customTokens
                ? {
                    "--p-accent": prefs.customTokens.primary,
                    "--p-surface": prefs.customTokens.surface,
                    "--p-ink": prefs.customTokens.text,
                  }
                : {}),
            } as React.CSSProperties
          }
          data-navigation-contract="global-shell-v2"
          data-premium-shell-contract="premium-shell-reset-v1"
          data-shell-design="daenem-command-interface"
          className={`p-app premium-shell-reset ${moduleId === "signin-design" && workspaceAuthorized ? "signin-studio-shell" : ""} ${shellNavCollapsed ? "p-shell-nav-collapsed" : ""} theme-${(reviewTheme || effectivePrefs.theme).toLowerCase()} density-${effectivePrefs.density.toLowerCase()} motion-${effectivePrefs.motion.toLowerCase()} glow-${(effectivePrefs.effects?.glow || "Balanced").toLowerCase()} glass-${(effectivePrefs.effects?.glass || "Balanced").toLowerCase()} ambient-${(effectivePrefs.effects?.ambient || "Balanced").toLowerCase()}`}
        >
          <a className="p-skip" href="#main-content">
            Skip to content
          </a>
          {signin ? (
            <main id="main-content" className="v3-unassigned" tabIndex={-1}>
              <Logo />
              <h1>Staff workspace</h1>
              <p>The Sign-In page is excluded from this post-sign-in source export. Supply the authenticated session through your host application's session integration.</p>
            </main>
          ) : !allowed.length ? (
            <main
              className="v3-unassigned"
              id="main-content"
              tabIndex={-1}
              data-site-identity="daenem-staff-portal"
              data-no-authorized-workspace="true"
              data-auth-renderer="staff-portal-auth-v3"
            >
              <Logo />
              <Shield size={36} />
              <h1>
                {session.provisional
                  ? "Identity ready. Assignment pending."
                  : "Your workspace is not assigned yet."}
              </h1>
              <p>
                An authorized administrator can complete your assignment. No
                operational content is available in this state.
              </p>
              <Btn onClick={() => setPendingSignout(true)}>Sign out</Btn>
              <details>
                <summary>Development preview controls</summary>
                <Btn variant="outline" onClick={() => setDev(true)}>
                  Change simulated profile
                </Btn>
              </details>
            </main>
          ) : (
            <>
              <aside className="p-sidebar">{nav}</aside>
              <div className="p-main">
                <header
                  className="p-topbar"
                  data-topbar-contract="global-shell-v2"
                  data-premium-command-contract="premium-command-interface-v1"
                >
                  <div className="p-topbar-leading">
                    <IconBtn
                      label="Open Navigation"
                      onClick={openMobileNavigation}
                    >
                      <Menu size={21} />
                    </IconBtn>
                    <span>DAENEM Staff Portal</span>
                  </div>
                  <div className="p-topbar-command-zone">
                    <button
                      ref={commandTriggerRef}
                      className="p-command-button"
                      onClick={openCommandPalette}
                      aria-label="Open Ask DAENEM search"
                      data-ai-state={effectiveAiSearchState}
                    >
                      <span className="p-ai-orb" aria-hidden="true">
                        <Bot size={16} />
                      </span>
                      <span className="p-command-copy">
                        <strong>Ask DAENEM</strong>
                        <small>Search your work areas and records</small>
                      </span>
                      <span className="p-command-hint" aria-hidden="true">
                        <Search size={15} />
                        <kbd>Ctrl / ⌘ K</kbd>
                      </span>
                    </button>
                  </div>
                  <div
                    className="p-topbar-utilities"
                    role="group"
                    aria-label="Workspace utilities"
                  >
                    <span
                      className="p-clock"
                      data-authenticated-time-primary="true"
                      data-time-zone={clockZone}
                    >
                      {clock}
                      <small>{clockZone}</small>
                    </span>
                    {canUseGlobalUtility && (
                      <button
                        className="p-weather-chip"
                        type="button"
                        onClick={() => openDrawer("weather")}
                        aria-label={`Open Weather status, unavailable, ${weatherUnit}`}
                        data-provider-state="required"
                        data-weather-unit={weatherUnit}
                      >
                        <CloudSun size={16} aria-hidden="true" />
                        <span>—°{weatherUnit}</span>
                      </button>
                    )}
                    {canUseGlobalUtility && (
                      <button
                        className="p-version-chip"
                        type="button"
                        onClick={() => openDrawer("version")}
                        aria-label={`Open Release Details, current ${CURRENT_SAVED_SITE_VERSION}`}
                        data-version-state="saved"
                        data-saved-version={CURRENT_SAVED_SITE_VERSION}
                      >
                        <History size={15} aria-hidden="true" />
                        <span>{CURRENT_SAVED_SITE_VERSION}</span>
                      </button>
                    )}
                    {canView(byId("sync"), session) && (
                      <IconBtn
                        label="Open Sync Status"
                        onClick={() => go("sync")}
                      >
                        {mode === "Offline" ? (
                          <WifiOff size={18} />
                        ) : (
                          <Wifi size={18} />
                        )}
                      </IconBtn>
                    )}
                    {canView(byId("help"), session) && (
                      <IconBtn
                        label="Open Help and Support"
                        onClick={() => openDrawer("help")}
                      >
                        <CircleHelp size={18} />
                      </IconBtn>
                    )}
                    {canView(byId("notifications"), session) && (
                      <span
                        className="p-notification-control"
                        data-new-authorized={hasNewAuthorizedNotifications}
                      >
                        <IconBtn
                          label="Open Notifications"
                          onClick={() => {
                            setNotificationAcknowledged(true);
                            openDrawer("actions");
                          }}
                        >
                          <Bell size={18} />
                        </IconBtn>
                      </span>
                    )}
                    {canView(byId("profile"), session) && (
                      <button
                        className="p-avatar-button"
                        onClick={() => openDrawer("profile")}
                        aria-label="Open My Profile"
                      >
                        <Avatar name={personFor(session)} />
                      </button>
                    )}
                  </div>
                </header>
                <section
                  className="p-shell-workspace-context"
                  aria-labelledby="workspace-title"
                >
                  <nav className="p-shell-breadcrumb" aria-label="Breadcrumb">
                    {breadcrumbItems.map((item, index) => (
                      <span className="p-shell-breadcrumb-item" key={`${item.label}-${index}`}>
                        {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
                        {index === breadcrumbItems.length - 1 ? (
                          <strong aria-current="page">{item.label}</strong>
                        ) : item.route ? (
                          <button
                            type="button"
                            onClick={() => goRoute(item.route!, item.capabilityModuleId)}
                          >
                            {item.label}
                          </button>
                        ) : (
                          <span>{item.label}</span>
                        )}
                      </span>
                    ))}
                  </nav>
                  <div className="p-workspace-header">
                    <div className="p-workspace-heading">
                      <span className="p-workspace-scope">
                        <Building2 size={14} aria-hidden="true" />
                        {activeCompany?.name || "Assigned workspace"}
                      </span>
                      <h1 id="workspace-title">{workspaceTitle}</h1>
                      <p>{workspaceDescription}</p>
                    </div>
                    {workspaceActions}
                  </div>
                </section>
                <div className="p-demo-strip">
                  <span>
                    <Shield size={13} />
                    <strong>DEVELOPMENT PREVIEW ONLY</strong>
                    <span className="p-demo-copy">
                      Fictional Records · Local Simulations
                    </span>
                  </span>
                  <button onClick={() => setDev(true)}>
                    {session.role} · {mode}
                    <SlidersHorizontal size={14} />
                  </button>
                </div>
                <main
                  id="main-content"
                  tabIndex={-1}
                  aria-labelledby="workspace-title"
                  className={`p-content ${m && ["home", "cockpit", "work"].includes(m.kind) && !selected ? "v3-home-content" : ""}`}
                >
                  {!m ||
                  !surfaceAccess ||
                  mode === "Permission Denied" ||
                  (!!recordId && !selected) ? (
                    <div
                      data-record-denied={deniedRecordSurface ? "true" : undefined}
                      data-record-denial-state={
                        deniedRecordSurface ? "neutral-not-found" : undefined
                      }
                      data-review-ready={deniedRecordSurface ? "true" : undefined}
                    >
                      <Empty
                        title={neutralNotFound.title}
                        message={neutralNotFound.message}
                        action={
                          <Btn
                            onClick={() => {
                              setMode("Demo Data");
                              router.push("/home");
                            }}
                          >
                            Return to Workspace
                          </Btn>
                        }
                      />
                    </div>
                  ) : (
                    <>
                      {!isStudioPath && !adminExperienceSurface && !adminPlatformSurface && (
                        <PageContext module={m} selected={selected} />
                      )}
                      <StateBoundary mode={mode} setMode={setMode}>
                        {recordId ? (
                          selected ? (
                            <RecordDetail
                              key={JSON.stringify(session) + selected.id}
                              row={selected}
                              module={m}
                              onEdit={() =>
                                setEditing({
                                  row: selected,
                                  module: m,
                                  isNew: false,
                                })
                              }
                            />
                          ) : (
                            <Empty
                              title={neutralNotFound.title}
                              message={neutralNotFound.message}
                            />
                          )
                        ) : (
                          <Suspense
                            fallback={
                              <Panel>
                                <div className="p-skeleton" />
                                <p>Preparing This Workspace…</p>
                              </Panel>
                            }
                          >
                            {adminPlatformSurface ? (
                              <CloudStorageAdmin
                                onBack={() => goRoute("/admin", "admin")}
                              />
                            ) : adminExperienceSurface ? (
                              isGlobalShellPath ? (
                                <GlobalShellAdmin
                                  session={session}
                                  preferences={effectivePrefs}
                                  organizationTemperatureUnit={ORGANIZATION_WEATHER_UNIT}
                                  onBack={() => goRoute("/admin/experience", "admin")}
                                />
                              ) : (
                                <AdminExperienceHub
                                  session={session}
                                  onOpenStudio={(section) =>
                                    goRoute(studioSectionPath(section), "signin-design")
                                  }
                                  onOpenGlobalShell={() =>
                                    goRoute("/admin/experience/global-shell", "admin")
                                  }
                                />
                              )
                            ) : (
                              <Workspace
                                key={JSON.stringify(session)}
                                module={m}
                              />
                            )}
                          </Suspense>
                        )}
                      </StateBoundary>
                    </>
                  )}
                </main>
                <footer className="p-footer">
                  <span>DAENEM · Staff Portal</span>
                  <span>
                    Demo Environment ·{" "}
                    {prefs.forced !== null
                      ? "Organization Layout"
                      : layouts[prefs.layout]}
                  </span>
                  <button onClick={() => setPendingSignout(true)}>
                    Secure Sign Out <LogOut size={13} />
                  </button>
                </footer>
              </div>
              <nav
                className="p-mobile-bottom-nav"
                aria-label="Mobile primary navigation"
                data-mobile-navigation-contract="global-shell-v2"
              >
                {[mobileHome, mobileMyWork]
                  .filter((item): item is GlobalNavigationItem => Boolean(item))
                  .map((item) => {
                    const Icon = item.icon;
                    const destination = destinationForGlobalItem(item);
                    const isActive = activeGlobal?.id === item.id;
                    return (
                      <button
                        key={`mobile-${item.id}`}
                        type="button"
                        className={isActive ? "active" : ""}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() =>
                          goRoute(destination.route, destination.capabilityModuleId)
                        }
                      >
                        <Icon size={19} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                <button
                  type="button"
                  className={command ? "active" : ""}
                  aria-expanded={command}
                  aria-controls="ask-daenem-command"
                  onClick={() => {
                    setMobile(false);
                    openCommandPalette();
                  }}
                >
                  <Search size={19} aria-hidden="true" />
                  <span>Search</span>
                </button>
                {canView(byId("notifications"), session) && (
                  <button
                    type="button"
                    className={drawer === "actions" ? "active" : ""}
                    aria-expanded={drawer === "actions"}
                    onClick={() => {
                      setNotificationAcknowledged(true);
                      setMobile(false);
                      openDrawer("actions");
                    }}
                  >
                    <Bell size={19} aria-hidden="true" />
                    <span>Notifications</span>
                  </button>
                )}
                <button
                  type="button"
                  className={mobile ? "active" : ""}
                  aria-expanded={mobile}
                  aria-controls="responsive-navigation-sheet"
                  onClick={openMobileNavigation}
                >
                  <Ellipsis size={20} aria-hidden="true" />
                  <span>More</span>
                </button>
              </nav>
            </>
          )}
          <Sheet open={mobile} onOpenChange={setMobile}>
            <SheetContent
              id="responsive-navigation-sheet"
              side="left"
              className="p-mobile-nav p-responsive-navigation-sheet"
              data-navigation-source="authorized-global-projection"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                restoreMobileNavigationFocus();
              }}
            >
              <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Work areas and pages available to you
              </SheetDescription>
              {nav}
            </SheetContent>
          </Sheet>
          <Dialog open={signed && command} onOpenChange={closeCommandPalette}>
            <DialogContent id="ask-daenem-command" className="p-modal p-command-modal" onCloseAutoFocus={(event) => { event.preventDefault(); restoreCommandFocus(); }}>
              <DialogTitle className="sr-only">
                Search Staff Portal
              </DialogTitle>
              <DialogDescription className="sr-only">
                Find work areas and records available to you.
              </DialogDescription>
              <CommandRoot data-ai-search-contract="authorized-projection-v2">
                <div className="p-ai-search-heading" data-ai-state={effectiveAiSearchState}>
                  <span className="p-ai-orb" aria-hidden="true"><Bot size={17} /></span>
                  <span>
                    <strong>Ask DAENEM</strong>
                    <small aria-live="polite">
                      {effectiveAiSearchState === "typing"
                        ? "Listening"
                        : effectiveAiSearchState === "searching"
                          ? "Searching your work areas"
                          : effectiveAiSearchState === "reasoning"
                            ? "Matching your request"
                            : effectiveAiSearchState === "result-ready"
                              ? "Suggestions ready"
                              : effectiveAiSearchState === "offline"
                                ? "Offline · searching saved items only"
                                : effectiveAiSearchState === "error"
                                  ? "Search assistance unavailable · local matching only"
                                  : "Search only what you are allowed to access"}
                    </small>
                  </span>
                </div>
                <div className="p-ai-query-field">
                  <CommandInput
                    value={commandQuery}
                    onValueChange={(value) => {
                      setCommandQuery(value);
                      setAiSearchState(value.trim() ? "typing" : "idle");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && commandPrediction) {
                        event.preventDefault();
                        setCommandQuery(commandPrediction);
                        setAiSearchState("typing");
                      }
                    }}
                    aria-describedby="ask-daenem-guidance"
                    placeholder="Search work areas, records or actions…"
                  />
                  {commandPredictionSuffix && (
                    <span className="p-ai-ghost-text" aria-hidden="true">
                      <i>{commandQuery.trim()}</i>
                      <b>{commandPredictionSuffix}</b>
                    </span>
                  )}
                </div>
                <div className="p-ai-search-guidance" id="ask-daenem-guidance">
                  {commandPrediction ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCommandQuery(commandPrediction);
                        setAiSearchState("typing");
                      }}
                      aria-label={`Accept prediction ${commandPrediction}`}
                    >
                      <span>Prediction</span>
                      <strong>{commandPrediction}</strong>
                      <kbd>Tab</kbd>
                    </button>
                  ) : (
                    <span>Suggestions match the work available to you.</span>
                  )}
                </div>
                <CommandList>
                  <CommandEmpty>No authorized results.</CommandEmpty>
                  <CommandGroup heading="Workspaces">
                    {allowed.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={a.title + " " + a.family}
                        onSelect={() => go(a.id)}
                      >
                        <Compass size={17} />
                        <span>
                          {a.title}
                          <small>{a.family}</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {commandBusinessAreas.length > 0 && (
                    <CommandGroup heading="Business Areas">
                      {commandBusinessAreas.map((area) => (
                        <CommandItem
                          key={`business-area-${area.family}`}
                          value={`Business Area ${area.family}`}
                          onSelect={() => go(area.id)}
                        >
                          <Building2 size={17} />
                          <span>
                            {area.family}
                            <small>Open a work area available to you</small>
                          </span>
                          <ArrowUpRight size={15} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {studioAccess && studioNavigationFor(session).length > 1 && (
                    <CommandGroup heading="Sign-In Studio">
                      {studioNavigationFor(session)
                        .filter((item) => item.id !== "Home")
                        .map((item) => (
                          <CommandItem
                            key={`studio-${item.id}`}
                            value={`Sign-In Studio ${item.label} ${item.description}`}
                            onSelect={() =>
                              goRoute(studioSectionPath(item.id), "signin-design")
                            }
                          >
                            <Sparkles size={17} />
                            <span>
                              {item.label}
                              <small>Admin · Experience · Sign-In Studio</small>
                            </span>
                            <ArrowUpRight size={15} />
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                  {commandGovernedControls.length > 0 && (
                    <CommandGroup heading="Governed Controls">
                      {commandGovernedControls.map((item) => (
                        <CommandItem
                          key={`governed-control-${item.moduleId}`}
                          value={item.value}
                          onSelect={() => goRoute(item.route, item.moduleId)}
                        >
                          <Shield size={17} />
                          <span>
                            {item.label}
                            <small>{item.detail}</small>
                          </span>
                          <ArrowUpRight size={15} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {recentRows.length > 0 && (
                    <CommandGroup heading="Recently Viewed">
                      {recentRows.map((r) => (
                        <CommandItem
                          key={`recent-${r.module}-${r.id}`}
                          value={`recent ${r.title} ${r.id}`}
                          onSelect={() => open(r)}
                        >
                          <History size={16} />
                          <span>
                            {r.title}
                            <small>{byId(r.module)?.title}</small>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {commandPeopleRows.length > 0 && (
                    <CommandGroup heading="Employees & People">
                      {commandPeopleRows.map((row) => (
                        <CommandItem
                          key={`person-${row.module}-${row.id}`}
                          value={`Employee Person ${row.title} ${row.id}`}
                          onSelect={() => open(row)}
                        >
                          <Users size={16} />
                          <span>{row.title}<small>{byId(row.module)?.title}</small></span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {commandJobRows.length > 0 && (
                    <CommandGroup heading="Jobs & Recruitment">
                      {commandJobRows.map((row) => (
                        <CommandItem
                          key={`job-${row.module}-${row.id}`}
                          value={`Job Recruitment ${row.title} ${row.id}`}
                          onSelect={() => open(row)}
                        >
                          <BriefcaseBusiness size={16} />
                          <span>{row.title}<small>{byId(row.module)?.title}</small></span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {commandLogRows.length > 0 && (
                    <CommandGroup heading="Logs & Security">
                      {commandLogRows.map((row) => (
                        <CommandItem
                          key={`log-${row.module}-${row.id}`}
                          value={`Log Security ${row.title} ${row.id}`}
                          onSelect={() => open(row)}
                        >
                          <Shield size={16} />
                          <span>{row.title}<small>{byId(row.module)?.title}</small></span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {canUseGlobalUtility && (
                    <CommandGroup heading="Staff Portal Release">
                      <CommandItem
                        value={`Staff Portal Release Details ${CURRENT_SAVED_SITE_VERSION}`}
                        onSelect={() => {
                          setCommand(false);
                          setCommandQuery("");
                          setAiSearchState("idle");
                          openDrawer("version");
                        }}
                      >
                        <History size={16} />
                        <span>
                          Staff Portal Release · {CURRENT_SAVED_SITE_VERSION}
                          <small>View Release Details</small>
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                  <CommandGroup heading="Records">
                    {commandRecordRows.map((r) => (
                      <CommandItem
                        key={r.module + r.id}
                        value={r.title + " " + r.id}
                        onSelect={() => open(r)}
                      >
                        <FileText size={16} />
                        {r.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </CommandRoot>
            </DialogContent>
          </Dialog>
          <Dialog open={signed && dev} onOpenChange={setDev}>
            <DialogContent className="p-modal">
              <DialogTitle>Development preview controls</DialogTitle>
              <DialogDescription>
                Change the simulated session and inspect failure states. No real
                access or production data changes.
              </DialogDescription>
              <label className="p-field">
                Acceptance profile
                <Pick
                  label="Acceptance profile"
                  value={session.profile || session.role}
                  options={testProfiles}
                  onChange={(v) => changeSession(sessionForProfile(v))}
                />
              </label>
              <label className="p-field">
                Role
                <Pick
                  label="Demo role"
                  value={session.role}
                  options={["Owner", "Manager", "Employee"]}
                  onChange={(role) => changeSession(sessionForProfile(role))}
                />
              </label>
              {authorizedCompanyOptions.length > 0 ? (
                <label className="p-field">
                  Company scope
                  <Pick
                    label="Demo company"
                    value={session.company}
                    options={authorizedCompanyOptions.map((c) => ({ value: c.id, label: c.name }))}
                    onChange={(c) =>
                      changeSession({ ...session, company: c as Company })
                    }
                  />
                </label>
              ) : (
                <Callout tone="neutral" title="No assigned company scope">
                  Company names are not listed until the authenticated session has an active company assignment.
                </Callout>
              )}
              {studioAccess && (
                <Link className="p-btn outline" href="/review/viewports">
                  Open responsive review workbench
                </Link>
              )}
              <label className="p-field">
                Data state
                <Pick
                  label="Demo data state"
                  value={mode}
                  onChange={(v) => setMode(v as Mode)}
                  options={[
                    "Demo Data",
                    "Loading",
                    "Empty",
                    "Error",
                    "Offline",
                    "Stale",
                    "Permission Denied",
                    "No Results",
                    "Sync Conflict",
                    "Integration Unavailable",
                  ]}
                />
              </label>
              <Callout tone="neutral" title="Preview scope only">
                Session changes filter navigation, search, actions, counts and
                record access together.
              </Callout>
              <Btn onClick={() => setDev(false)}>Inspect this experience</Btn>
              <Btn
                variant="quiet"
                onClick={() => {
                  sessionStorage.removeItem("daenem-demo-session-v3");
                  setRecentRefs([]);
                  setSigned(false);
                  setDev(false);
                  go("signin");
                }}
              >
                Return to sign-in review
              </Btn>
            </DialogContent>
          </Dialog>
          <Sheet
            open={signed && drawer !== null}
            onOpenChange={(v) => !v && setDrawer(null)}
          >
            <SheetContent
              className="p-side-sheet"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                restoreDrawerFocus();
              }}
            >
              <SheetTitle>{drawerTitle}</SheetTitle>
              <SheetDescription>{drawerDescription}</SheetDescription>
              {drawer === "help" ? (
                <div className="p-help-inline">
                  <Sparkles size={32} />
                  <h3>
                    {m && canView(m, session) ? m.title : "Workspace guidance"}
                  </h3>
                  <p>{m && canView(m, session) ? m.purpose : ""}</p>
                  <p>
                    {m && canView(m, session) && m.required
                      ? `Before completion, capture ${m.required}. It provides the accountability evidence for this workflow.`
                      : "Open a record to inspect its status, required fields and available next actions."}
                  </p>
                  <Btn
                    onClick={() => {
                      go("help");
                      setDrawer(null);
                    }}
                  >
                    Search Help
                  </Btn>
                  <div className="p-action-list" aria-label="Help options">
                    <button
                      onClick={() => {
                        setDrawer(null);
                        window.setTimeout(openCommandPalette, 0);
                      }}
                    >
                      <Search size={18} />
                      <span>
                        <strong>Ask DAENEM</strong>
                        <small>Search your work areas and records.</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <div className="p-provider-row">
                      <BookOpen size={18} />
                      <span>
                        <strong>Documentation</strong>
                        <small>Authoritative support content is not connected.</small>
                      </span>
                      <Badge>Unavailable</Badge>
                    </div>
                    <div className="p-provider-row">
                      <CircleHelp size={18} />
                      <span>
                        <strong>FAQs</strong>
                        <small>Authoritative answers are not connected.</small>
                      </span>
                      <Badge>Unavailable</Badge>
                    </div>
                    {canView(byId("support"), session) && (
                      <button
                        onClick={() => {
                          go("support");
                          setDrawer(null);
                        }}
                      >
                        <LifeBuoy size={18} />
                        <span>
                          <strong>Contact Support</strong>
                          <small>Open the authorized support workspace.</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("support"), session) && (
                      <button
                        onClick={() => {
                          go("support");
                          setDrawer(null);
                        }}
                      >
                        <Info size={18} />
                        <span>
                          <strong>Report a Problem</strong>
                          <small>Use the governed support case workflow.</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("resources"), session) && (
                      <button
                        onClick={() => {
                          go("resources");
                          setDrawer(null);
                        }}
                      >
                        <Wifi size={18} />
                        <span>
                          <strong>System Status</strong>
                          <small>Open permitted service availability details.</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ) : drawer === "actions" ? (
                <div className="p-action-list">
                  {noticeRows.map((r) => (
                    <button
                      key={r.module + r.id}
                      onClick={() => {
                        setDrawer(null);
                        open(r);
                      }}
                    >
                      <FileText size={18} />
                      <span>
                        <strong>{r.title}</strong>
                        <small>
                          {r.status} · {r.id}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {!noticeRows.length && (
                    <Empty
                      title="You are all caught up"
                      message="No authorized actions need attention."
                    />
                  )}
                  <Btn
                    variant="outline"
                    onClick={() => {
                      go("notifications");
                      setDrawer(null);
                    }}
                  >
                    Open Action Center
                  </Btn>
                </div>
              ) : drawer === "profile" ? (
                <div className="p-profile-drawer">
                  <div className="p-profile-drawer-identity">
                    <Avatar name={personFor(session)} />
                    <span>
                      <strong>{personFor(session)}</strong>
                      <small>{session.role}</small>
                    </span>
                  </div>
                  <div className="p-action-list" aria-label="Profile options">
                    <button onClick={() => { go("profile"); setDrawer(null); }}>
                      <UserRound size={18} />
                      <span><strong>My Profile</strong><small>Identity and permitted personal details.</small></span>
                      <ChevronRight size={16} />
                    </button>
                    {canView(byId("layout"), session) && (
                      <button onClick={() => { go("layout"); setDrawer(null); }}>
                        <Settings size={18} />
                        <span><strong>My Preferences</strong><small>Density, motion and workspace composition.</small></span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("theme"), session) && (
                      <button onClick={() => { go("theme"); setDrawer(null); }}>
                        <Sparkles size={18} />
                        <span><strong>Appearance</strong><small>Permitted visual theme controls.</small></span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("layout"), session) && (
                      <button onClick={() => { go("layout"); setDrawer(null); }}>
                        <SlidersHorizontal size={18} />
                        <span><strong>Accessibility</strong><small>Reduced Motion and readable workspace settings.</small></span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("notifications"), session) && (
                      <button onClick={() => { go("notifications"); setDrawer(null); }}>
                        <Bell size={18} />
                        <span><strong>Notification Settings</strong><small>Open your authorized Action Center.</small></span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {canView(byId("security"), session) && (
                      <button onClick={() => { go("security"); setDrawer(null); }}>
                        <Shield size={18} />
                        <span><strong>Security</strong><small>Authorized sign-in and session controls.</small></span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                  {authorizedCompanyOptions.length > 1 && (
                    <label className="p-field">
                      Switch Company
                      <Pick
                        label="Switch Company"
                        value={session.company}
                        onChange={(value) =>
                          changeSession({ ...session, company: value as Company })
                        }
                        options={authorizedCompanyOptions.map((company) => ({
                          value: company.id,
                          label: company.name,
                        }))}
                      />
                    </label>
                  )}
                  <Btn
                    variant="outline"
                    onClick={() => {
                      setDrawer(null);
                      setPendingSignout(true);
                    }}
                  >
                    <LogOut size={16} /> Sign Out
                  </Btn>
                </div>
              ) : drawer === "version" ? (
                <div className="p-version-history" data-version-history-contract="plain-language-release-details">
                  <div className="p-version-current">
                    <History size={24} />
                    <span>
                      <small>Current Staff Portal Release</small>
                      <strong>{CURRENT_SAVED_SITE_VERSION}</strong>
                    </span>
                  </div>
                  <Callout tone="neutral" title="You Are Using This Release">
                    This is the Staff Portal release currently available to you.
                  </Callout>
                  <p className="p-secondary">
                    Detailed release notes are not available yet.
                  </p>
                </div>
              ) : drawer === "weather" ? (
                <div className="p-weather-drawer" data-weather-contract="provider-required">
                  <div className="p-weather-unavailable">
                    <CloudSun size={34} />
                    <span>
                      <strong>—°{weatherUnit}</strong>
                      <small>No current observation</small>
                    </span>
                  </div>
                  <div className="p-temperature-unit" role="group" aria-label="Temperature unit">
                    <button
                      type="button"
                      aria-pressed={weatherUnit === "F"}
                      onClick={() => setWeatherUnitOverride("F")}
                    >
                      Fahrenheit (°F)
                    </button>
                    <button
                      type="button"
                      aria-pressed={weatherUnit === "C"}
                      onClick={() => setWeatherUnitOverride("C")}
                    >
                      Celsius (°C)
                    </button>
                    {weatherUnitOverride && (
                      <button
                        className="p-temperature-default"
                        type="button"
                        onClick={() => setWeatherUnitOverride(null)}
                      >
                        Use Organization Default (°{ORGANIZATION_WEATHER_UNIT})
                      </button>
                    )}
                  </div>
                  <Callout tone="neutral" title="Weather provider required">
                    Live conditions, location and freshness cannot be shown until an
                    approved provider and organization location policy are connected.
                  </Callout>
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
          <Dialog
            open={signed && !!editing}
            onOpenChange={(v) => !v && setEditing(null)}
          >
            <DialogContent className="p-modal p-edit-modal">
              {editing && (
                <SmartRecordEditor
                  key={editing.row.id}
                  {...editing}
                  onClose={() => setEditing(null)}
                />
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={pendingSignout} onOpenChange={setPendingSignout}>
            <DialogContent className="p-modal">
              <DialogTitle>Sign out securely?</DialogTitle>
              <DialogDescription>
                Your local demo drafts are retained on this device. Your
                simulated session will end.
              </DialogDescription>
              <div className="p-button-row">
                <Btn variant="outline" onClick={() => setPendingSignout(false)}>
                  Keep working
                </Btn>
                <Btn
                  onClick={() => {
                    setRecentRefs([]);
                    setSigned(false);
                    sessionStorage.removeItem("daenem-demo-session-v3");
                    setPendingSignout(false);
                    go("signin");
                  }}
                >
                  Sign out
                </Btn>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={sensitiveAction !== null}
            onOpenChange={(v) => !v && setSensitiveAction(null)}
          >
            <DialogContent className="p-modal">
              <DialogTitle>
                High-risk step-up verification · demonstration
              </DialogTitle>
              <DialogDescription>
                This demonstration reauthenticates a sensitive bank-detail or
                Access Control change. Nothing is sent to an identity provider
                and no production permission or bank data changes.
              </DialogDescription>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reauthPassword !== "DEMO-CONFIRM") {
                    setReauthError(
                      "The demo password does not match. Use DEMO-CONFIRM.",
                    );
                    return;
                  }
                  const action = sensitiveAction;
                  setSensitiveAction(null);
                  setReauthPassword("");
                  action?.();
                }}
              >
                <label className="p-field">
                  Demonstration password
                  <input
                    type="password"
                    autoComplete="off"
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                  />
                </label>
                <p className="p-secondary">
                  Local demonstration password: <strong>DEMO-CONFIRM</strong>
                </p>
                {reauthError && (
                  <p className="p-form-error" role="alert">
                    {reauthError}
                  </p>
                )}
                <div className="p-button-row">
                  <Btn
                    variant="outline"
                    onClick={() => setSensitiveAction(null)}
                  >
                    Cancel demonstration
                  </Btn>
                  <Btn type="submit">Verify step-up & continue</Btn>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Toaster richColors position="bottom-right" />
        </div>
      </Context.Provider>
    </TooltipProvider>
  );
}

function AdminExperienceHub({
  session,
  onOpenStudio,
  onOpenGlobalShell,
}: {
  session: Session;
  onOpenStudio: (section: StudioSectionId) => void;
  onOpenGlobalShell: () => void;
}) {
  const destinations = [
    {
      label: "Sign-In Studio",
      detail: "Open only the Sign-In Studio capabilities assigned to this session.",
      icon: Sparkles,
      action: () => onOpenStudio("Home"),
      primary: true,
    },
    ...(byId("admin") && canAct(byId("admin")!, session, "manage")
      ? [{
          label: "Global Shell",
          detail: "Review navigation, AI Search, top bar, weather, motion and version policy controls.",
          icon: Settings,
          action: onOpenGlobalShell,
          primary: false,
        }]
      : []),
    ...(canViewStudioNavigationItem("History", session)
      ? [{
          label: "Experience governance",
          detail: "Review ownership, safe publication boundaries and reversible local drafts.",
          icon: Shield,
          action: () => onOpenStudio("History"),
          primary: false,
        }]
      : []),
    ...(canViewStudioNavigationItem("Devices", session)
      ? [{
          label: "Responsive review",
          detail: "Inspect the shared experience across Mobile, Tablet, Desktop and 4K.",
          icon: Monitor,
          action: () => onOpenStudio("Devices"),
          primary: false,
        }]
      : []),
  ];
  return (
    <section className="p-admin-experience" aria-labelledby="admin-experience-title">
      <header className="p-admin-experience-hero">
        <div>
          <span className="p-kicker">ADMIN / EXPERIENCE</span>
          <h2 id="admin-experience-title">Experience workspace</h2>
          <p>Open the governed experience tools assigned to this session. Every destination resolves to one canonical workspace.</p>
        </div>
        <Badge>DEMO LAB · {session.role.toUpperCase()}</Badge>
      </header>
      <div className="p-admin-experience-grid">
        {destinations.map(({ label, detail, icon: Icon, action, primary }) => (
          <button key={label} className={primary ? "primary" : ""} onClick={action}>
            <span className="p-admin-experience-icon"><Icon size={22} /></span>
            <span><strong>{label}</strong><small>{detail}</small></span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      <Callout tone="neutral" title="Canonical ownership">
        Sign-In Studio is the single home for assigned sign-in experience tools. Search, shortcuts and future module hubs must resolve through the same permission-filtered workspace.
      </Callout>
    </section>
  );
}

function StateBoundary({
  mode,
  setMode,
  children,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  children: ReactNode;
}) {
  if (mode === "Loading")
    return (
      <Panel>
        <div className="p-skeleton" />
        <div className="p-skeleton short" />
        <div className="p-skeleton" />
        <Btn onClick={() => setMode("Demo Data")}>Finish demo loading</Btn>
      </Panel>
    );
  if (
    ["Empty", "No Results", "Error", "Integration Unavailable"].includes(mode)
  )
    return (
      <Empty
        title={
          mode === "Empty"
            ? "No authorized records"
            : mode === "No Results"
              ? "No results match your search"
              : mode === "Error"
                ? "Unable to load this workspace"
                : "Authorized Integration Data Unavailable"
        }
        message={
          mode === "Error"
            ? "Your saved work is retained. Retry when the connection is available."
            : "No production values are substituted for missing data."
        }
        action={
          <Btn onClick={() => setMode("Demo Data")}>Return to demo data</Btn>
        }
      />
    );
  return (
    <>
      {mode !== "Demo Data" && (
        <Callout
          title={
            mode === "Offline"
              ? "Offline · Changes stay on this device"
              : mode === "Stale"
                ? "Stale data · Last fixture update 11 Sep 2026"
                : "Sync conflict · Review both versions"
          }
        >
          <button
            className="p-inline-link"
            onClick={() => setMode("Demo Data")}
          >
            Restore demo connection
          </button>
        </Callout>
      )}
      {children}
    </>
  );
}
function RecordEditor({
  row,
  module,
  isNew,
  onClose,
}: {
  row: RecordData;
  module: ModuleDef;
  isNew: boolean;
  onClose: () => void;
}) {
  const { mutate, session } = useLab();
  const [configuredFields] = useState<ConfigVersion[]>(() => {
    try {
      return activeConfigurations(
        JSON.parse(
          localStorage.getItem(
            "daenem-draft-governed-field-builder-" + session.company,
          ) || "[]",
        ),
        session,
      ).filter((v) => v.target === module.id);
    } catch {
      return [];
    }
  });
  const [title, setTitle] = useState(row.title),
    [fields, setFields] = useState(row.fields),
    [evidence, setEvidence] = useState(row.evidence),
    [evidenceData, setEvidenceData] = useState(row.evidenceData || {}),
    [error, setError] = useState("");
  return (
    <>
      <DialogTitle>{isNew ? module.primary : "Edit " + row.title}</DialogTitle>
      <DialogDescription>
        Changes are stored in this private demo on this device.
      </DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) {
            setError("Enter a record title.");
            return;
          }
          const draft = { ...row, title, evidence, evidenceData };
          if (
            mutate(
              draft,
              fields,
              row.status,
              isNew ? "Draft created" : "Record updated",
            )
          )
            onClose();
        }}
      >
        <label className="p-field">
          Record title
          <input
            value={title}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="p-form-grid">
          {[
            ...new Set([
              ...module.fields,
              ...configuredFields.map((v) => v.name),
            ]),
          ]
            .filter((f) => fieldAccess(module.id, f, session) === "edit")
            .map((f) => (
              <label className="p-field" key={f}>
                {f}
                {module.required === f && (
                  <small>Required before submission or completion</small>
                )}
                {/Purpose|Notes|Response|Message|Caption|Commentary|Body/.test(
                  f,
                ) ? (
                  <textarea
                    rows={3}
                    value={fields[f] || ""}
                    onChange={(e) =>
                      setFields({ ...fields, [f]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    value={fields[f] || ""}
                    type={
                      /Amount|Yield|Cost|Debit|Credit|Quantity|Budget|Actual|Revenue/.test(
                        f,
                      )
                        ? "number"
                        : "text"
                    }
                    onChange={(e) =>
                      setFields({ ...fields, [f]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
        </div>
        <label className="p-field">
          Evidence attachment
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (
                ![
                  "application/pdf",
                  "image/png",
                  "image/jpeg",
                  "text/plain",
                ].includes(f.type)
              ) {
                setError("Choose a PDF, PNG, JPEG or plain text file.");
                return;
              }
              if (f.size > 2 * 1024 * 1024) {
                setError(
                  "Use a demo attachment smaller than 2 MB for device-local storage.",
                );
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setEvidence([...new Set([...evidence, f.name])]);
                setEvidenceData({
                  ...evidenceData,
                  [f.name]: { mime: f.type, data: String(reader.result) },
                });
                if (
                  module.required === "Receipt" ||
                  module.required === "Proof of Delivery"
                )
                  setFields({ ...fields, [module.required]: f.name });
                setError("");
              };
              reader.readAsDataURL(f);
            }}
          />
          <small>
            PDF, image or text · Up to 2 MB. Attachment bytes stay in this
            browser&apos;s local demo storage.
          </small>
        </label>
        {evidence.map((e, i) => (
          <div className="p-attachment" key={i}>
            <FileText size={16} />
            {e}
          </div>
        ))}
        <Btn
          variant="quiet"
          onClick={() => {
            setEvidence(["Demo evidence.pdf"]);
            if (
              module.required === "Receipt" ||
              module.required === "Proof of Delivery"
            )
              setFields({ ...fields, [module.required]: "Demo evidence.pdf" });
          }}
        >
          Use demo evidence
        </Btn>
        {error && <p role="alert">{error}</p>}
        <div className="p-button-row">
          <Btn variant="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit">Save demo draft</Btn>
        </div>
      </form>
    </>
  );
}
type DedicatedRecordTab =
  | "Overview"
  | "Documents"
  | "Related Records"
  | "Approvals"
  | "Notes"
  | "History"
  | "Audit";

function RecordDetail({
  row,
  module,
  onEdit,
}: {
  row: RecordData;
  module: ModuleDef;
  onEdit: () => void;
}) {
  const { session, mutate, go, handoff, records, auditLog } = useLab();
  const [reason, setReason] = useState(""),
    [evidenceOpen, setEvidenceOpen] = useState<string | null>(null),
    [tab, setTab] = useState<DedicatedRecordTab>("Overview");
  const moreActionsRef = useRef<HTMLDetailsElement>(null);
  const missing = requirementsMissing(row, module);
  const index = Math.max(0, module.stages.indexOf(row.status));
  const navigationRows = recordsFor(records, module, session);
  const navigationIndex = navigationRows.findIndex(
    (candidate) => candidate.id === row.id && candidate.module === row.module,
  );
  const permittedRows = authorizedRecords(records, session);
  const relatedRows = permittedRows.filter((candidate) =>
    recordsAreRelated(row, candidate),
  );
  const documents = activeEvidence(row);
  const noteEntries = Object.entries(row.fields).filter(
    ([field, value]) =>
      /^(Notes|Case Notes|Manager Commentary|Decision Reason)$/i.test(field) &&
      value.trim().length > 0,
  );
  const noteFields = new Set(noteEntries.map(([field]) => field));
  const overviewFields = Object.entries(row.fields).filter(
    ([field]) => !noteFields.has(field),
  );
  const isExpenseRequest = ["expenses", "expense-approvals"].includes(module.id);
  const expenseSummaryFields = new Set([
    "Amount",
    "Category",
    "Supplier",
    "Cost Centre",
    "Purpose",
    "Receipt",
  ]);
  const detailOverviewFields = isExpenseRequest
    ? overviewFields.filter(([field]) => !expenseSummaryFields.has(field))
    : overviewFields;
  const recordAudit = auditLog.filter(
    (event) => event.target === `${row.module}:${row.id}`,
  );
  const tabs: DedicatedRecordTab[] = [
    "Overview",
    ...(documents.length ? (["Documents"] as DedicatedRecordTab[]) : []),
    ...(relatedRows.length
      ? (["Related Records"] as DedicatedRecordTab[])
      : []),
    ...(module.stages.some((stage) =>
      /Appro|Review|Return|Reject/.test(stage),
    )
      ? (["Approvals"] as DedicatedRecordTab[])
      : []),
    ...(noteEntries.length ? (["Notes"] as DedicatedRecordTab[]) : []),
    ...(row.history.length ? (["History"] as DedicatedRecordTab[]) : []),
    ...(recordAudit.length ? (["Audit"] as DedicatedRecordTab[]) : []),
  ];
  const activeTab = tabs.includes(tab) ? tab : "Overview";
  const requestFlow = [
    "expenses",
    "expense-approvals",
    "leave",
    "forms",
  ].includes(module.id);
  const next = requestFlow
    ? ["Draft", "Returned"].includes(row.status)
      ? "Submitted"
      : ""
    : module.stages[Math.min(index + 1, module.stages.length - 1)];
  const decisionAllowed =
    canRecordAct(row, module, session, "approve") &&
    row.owner !== personFor(session) &&
    (!requestFlow || row.status === "Submitted");
  const primaryAdvanceAllowed =
    canRecordAct(row, module, session) &&
    next &&
    next !== row.status &&
    !["Approved", "Rejected", "Returned"].includes(next) &&
    (!["Closed", "Reconciled", "Published (Demo)"].includes(next) ||
      canRecordAct(
        row,
        module,
        session,
        next === "Closed"
          ? "close"
          : next === "Reconciled"
            ? "reconcile"
            : "publish",
      ));

  function moveRecord(direction: number) {
    if (navigationIndex < 0) return;
    const target = navigationRows[navigationIndex + direction];
    if (target) go(`${module.id}/${encodeURIComponent(target.id)}`);
  }

  function moveRecordTab(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tabIndex: number,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (tabIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    setTab(tabs[targetIndex]);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [targetIndex]?.focus();
  }

  function openRecordSection(section: DedicatedRecordTab) {
    setTab(section);
    moreActionsRef.current?.removeAttribute("open");
    window.requestAnimationFrame(() => {
      document
        .getElementById(
          `dedicated-record-tab-${section.toLowerCase().replace(/\s+/g, "-")}`,
        )
        ?.focus();
    });
  }

  async function copyRecordLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      moreActionsRef.current?.removeAttribute("open");
      moreActionsRef.current?.querySelector<HTMLElement>("summary")?.focus();
      toast.success("Record link copied");
    } catch {
      toast.error("Record link could not be copied.");
    }
  }

  return (
    <section
      className="dr-page"
      data-record-interaction="dedicated-record-page"
      aria-labelledby="dedicated-record-title"
    >
      <header className="dr-identity-bar">
        <button type="button" className="dr-back" onClick={() => go(module.id)}>
          <ArrowLeft size={16} />
          Back To Record List
        </button>
        <div className="dr-record-identity">
          <div>
            <span className="p-kicker">{module.title} · {row.id}</span>
            <h2 id="dedicated-record-title">{row.title}</h2>
            <p>{row.subtitle}</p>
          </div>
          <Badge>{row.status}</Badge>
        </div>
        <dl className="dr-key-identity" aria-label="Record Identity">
          <div><dt>Record Type</dt><dd>{module.title}</dd></div>
          <div><dt>Status</dt><dd>{row.status}</dd></div>
          <div><dt>Key Identifier</dt><dd>{row.id}</dd></div>
        </dl>
        <div className="dr-header-actions">
          <div className="dr-record-pager" aria-label="Record Navigation">
            <button
              type="button"
              onClick={() => moveRecord(-1)}
              disabled={navigationIndex <= 0}
              aria-label="Previous Record"
            ><ArrowLeft size={16} /></button>
            <span>{navigationIndex + 1} / {navigationRows.length}</span>
            <button
              type="button"
              onClick={() => moveRecord(1)}
              disabled={navigationIndex < 0 || navigationIndex >= navigationRows.length - 1}
              aria-label="Next Record"
            ><ArrowRight size={16} /></button>
          </div>
          {primaryAdvanceAllowed && (
            <Btn
              className="dr-primary-action"
              onClick={() => mutate(row, {}, next, `Moved to ${next}`)}
            >
              Continue To {next}
            </Btn>
          )}
          {canRecordAct(row, module, session) && (
            <Btn variant="outline" onClick={onEdit}>Edit Record</Btn>
          )}
          <details
            className="dr-more-actions"
            ref={moreActionsRef}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !moreActionsRef.current?.open) return;
              event.preventDefault();
              moreActionsRef.current.removeAttribute("open");
              moreActionsRef.current.querySelector<HTMLElement>("summary")?.focus();
            }}
          >
            <summary><Ellipsis size={16} />More Actions</summary>
            <div className="dr-more-actions-menu" aria-label="More Record Actions">
              {documents.length > 0 && (
                <button type="button" onClick={() => openRecordSection("Documents")}>Review Documents</button>
              )}
              {relatedRows.length > 0 && (
                <button type="button" onClick={() => openRecordSection("Related Records")}>Review Related Records</button>
              )}
              {tabs.includes("Approvals") && (
                <button type="button" onClick={() => openRecordSection("Approvals")}>Review Approvals</button>
              )}
              <button type="button" onClick={copyRecordLink}>Copy Record Link</button>
            </div>
          </details>
        </div>
      </header>

      <nav className="dr-tabs" aria-label="Record Sections" role="tablist">
        {tabs.map((item, tabIndex) => {
          const slug = item.toLowerCase().replace(/\s+/g, "-");
          return (
            <button
              type="button"
              key={item}
              id={`dedicated-record-tab-${slug}`}
              role="tab"
              aria-controls={`dedicated-record-panel-${slug}`}
              aria-selected={activeTab === item}
              tabIndex={activeTab === item ? 0 : -1}
              className={activeTab === item ? "is-active" : ""}
              onClick={() => setTab(item)}
              onKeyDown={(event) => moveRecordTab(event, tabIndex)}
            >{item}</button>
          );
        })}
      </nav>

      <div
        className="dr-tab-panel"
        id={`dedicated-record-panel-${activeTab.toLowerCase().replace(/\s+/g, "-")}`}
        role="tabpanel"
        aria-labelledby={`dedicated-record-tab-${activeTab.toLowerCase().replace(/\s+/g, "-")}`}
        tabIndex={0}
      >
        {activeTab === "Overview" && (
          <div className="p-record-detail dr-overview">
            <Panel className="p-record-main">
              {isExpenseRequest && (
                <section
                  className="dr-expense-brief"
                  aria-label="Expense Request Summary"
                  data-record-composition="expense-request"
                >
                  <div className="dr-expense-amount">
                    <span>Recorded Amount</span>
                    <strong>{money(row.amount)}</strong>
                    <small>{row.fields.Category || "Category Not Recorded"}</small>
                  </div>
                  <dl className="dr-expense-facts">
                    <div><dt>Cost Centre</dt><dd>{row.fields["Cost Centre"] || "Not Recorded"}</dd></div>
                    <div><dt>Supplier</dt><dd>{row.fields.Supplier || "Not Recorded"}</dd></div>
                    <div><dt>Receipt Reference</dt><dd>{row.fields.Receipt || "Not Recorded"}</dd></div>
                    <div><dt>Documents</dt><dd>{documents.length ? `${documents.length} Available` : "No Uploaded Document"}</dd></div>
                  </dl>
                  <div className="dr-expense-purpose">
                    <span>Business Purpose</span>
                    <p>{row.fields.Purpose || "No business purpose recorded."}</p>
                  </div>
                </section>
              )}
              <Steps steps={module.stages} current={index} />
              {missing.length > 0 && (
                <Callout title={`${missing.join(", ")} required`}>
                  Capture this information to keep the workflow accountable.
                  Completion becomes available after the requirement is satisfied.{" "}
                  {canRecordAct(row, module, session) && (
                    <button className="p-inline-link" onClick={onEdit}>
                      Complete Required Information
                    </button>
                  )}
                </Callout>
              )}
              <dl className="p-detail-fields">
                {detailOverviewFields.map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{value || <span className="p-warning-text">Action Required</span>}</dd></div>
                ))}
              </dl>
              <div className="p-record-actions">
                {module.kind === "archive" && <Badge>Read-Only Historical Record</Badge>}
              </div>
            </Panel>
            <aside>
              {handoffDefinitions.filter((definition) =>
                definition.source === row.module &&
                canView(byId(definition.target), session) &&
                canAct(byId(definition.target)!, session, "create") &&
                canRecordAct(row, module, session),
              ).map((definition) => (
                <Panel key={definition.target} title="Linked Workflow">
                  <p>{definition.label}</p>
                  <Badge>{row.status === definition.state ? "Ready For Source Validation" : `Requires ${definition.state}`}</Badge>
                  <label className="p-field">Handoff Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                  <Btn disabled={row.status !== definition.state || !reason.trim()} onClick={() => handoff(row, definition.target, reason)}>{definition.label}</Btn>
                  {permittedRows.filter((candidate) => candidate.module === definition.target && candidate.fields["Source Record"] === `${row.module}:${row.id}`).map((candidate) => (
                    <Btn key={candidate.id} variant="quiet" onClick={() => go(`${candidate.module}/${candidate.id}`)}>Open {candidate.id}</Btn>
                  ))}
                </Panel>
              ))}
              <EntityQuickAccess row={row} module={module} />
              <Panel title="Accountability" kicker="RECORD CONTEXT">
                <dl className="p-detail-fields single">
                  <div><dt>Responsible Person</dt><dd>{row.owner}</dd></div>
                  <div><dt>Due Date</dt><dd>{row.due}</dd></div>
                  <div><dt>Data Mode</dt><dd>Demo Data</dd></div>
                </dl>
              </Panel>
            </aside>
          </div>
        )}

        {activeTab === "Documents" && (
          <Panel title="Documents" kicker="GOVERNED EVIDENCE" className="dr-section-panel">
            <div className="p-evidence">
              {documents.map((document, documentIndex) => (
                <button className="p-attachment" key={documentIndex} onClick={() => setEvidenceOpen(document)}>
                  <FileText size={20} />
                  <span>{document}<small>{row.evidenceData?.[document] ? "Local Attachment" : "Demo Document Reference"}</small></span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "Related Records" && (
          <Panel title="Related Records" kicker="AUTHORIZED CONNECTIONS" className="dr-section-panel">
            <div className="dr-related-records">
              {relatedRows.map((related) => (
                <button type="button" key={`${related.module}:${related.id}`} onClick={() => go(`${related.module}/${encodeURIComponent(related.id)}`)}>
                  <span><strong>{related.title}</strong><small>{related.id} · {related.owner}</small></span>
                  <Badge>{related.status}</Badge><ChevronRight size={16} />
                </button>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "Approvals" && (
          <Panel title="Approvals" kicker="GOVERNED DECISION" className="dr-section-panel">
            <Steps steps={module.stages} current={index} />
            {decisionAllowed && (module.stages.includes("Approved") || module.stages.includes("Returned")) && (
              <div className="dr-decision">
                <label className="p-field">Decision Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record your decision…" /></label>
                <div className="p-button-row">
                  <Btn onClick={() => { if (!reason.trim()) return toast.error("Enter a decision reason."); mutate(row, { "Decision Reason": reason }, "Approved", "Approved with reason"); }}>Approve</Btn>
                  <Btn variant="outline" onClick={() => { if (!reason.trim()) return toast.error("Enter a return reason."); mutate(row, { "Decision Reason": reason }, "Returned", "Returned for information"); }}>Return</Btn>
                </div>
              </div>
            )}
          </Panel>
        )}

        {activeTab === "Notes" && (
          <Panel title="Notes" kicker="AUTHORIZED RECORD NOTES" className="dr-section-panel">
            <dl className="p-detail-fields single">
              {noteEntries.map(([field, value]) => (
                <div key={field}><dt>{field}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </Panel>
        )}

        {activeTab === "History" && (
          <Panel title="History" kicker="RECORD HISTORY" className="dr-section-panel"><Timeline items={row.history.map((event) => ({ ...event, time: formatRecordDateTime12(event.time, session) }))} /></Panel>
        )}

        {activeTab === "Audit" && (
          <Panel title="Audit" kicker="AUTHORIZED RECORD EVENTS" className="dr-section-panel">
            <Timeline items={recordAudit.map((event) => ({
              action: event.action,
              actor: event.actor,
              time: formatRecordDateTime12(event.time, session),
            }))} />
          </Panel>
        )}
      </div>
      <Dialog
        open={evidenceOpen !== null}
        onOpenChange={(v) => !v && setEvidenceOpen(null)}
      >
        <DialogContent className="p-modal">
          <DialogTitle>Evidence preview</DialogTitle>
          <DialogDescription>
            {evidenceOpen && row.evidenceData?.[evidenceOpen]
              ? "Device-local attachment. This file has not been uploaded."
              : "Illustrative supporting document for this demo record."}
          </DialogDescription>
          {evidenceOpen &&
          !row.filePolicies?.[evidenceOpen]?.deleted &&
          row.evidenceData?.[evidenceOpen] ? (
            <LocalEvidence
              file={row.evidenceData[evidenceOpen]}
              name={evidenceOpen}
              downloadAllowed={canRecordAct(row, module, session, "export")}
            />
          ) : (
            <div className="p-document-paper">
              <Logo />
              <h2>Supporting evidence</h2>
              <p>
                {row.id} · {row.title}
              </p>
              <hr />
              <p>Fixture evidence supplied for workflow review.</p>
              <strong>{money(row.amount)}</strong>
              <p>This is not a receipt, invoice or payment instruction.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function LocalEvidence({
  file,
  name,
  downloadAllowed,
}: {
  downloadAllowed: boolean;
  file: {
    mime: string;
    data: string;
  };
  name: string;
}) {
  const safe = file.data.startsWith("data:" + file.mime + ";base64,");
  if (!safe)
    return (
      <Callout title="Attachment unavailable">
        The local attachment data is invalid.
      </Callout>
    );
  return (
    <div className="p-local-evidence">
      {file.mime.startsWith("image/") ? (
        <img src={file.data} alt={name} />
      ) : file.mime === "application/pdf" ? (
        <object data={file.data} type="application/pdf" aria-label={name}>
          <p>
            Use Download attachment if your browser cannot display this PDF.
          </p>
        </object>
      ) : (
        <pre>
          {new TextDecoder().decode(
            Uint8Array.from(atob(file.data.split(",")[1]), (c) =>
              c.charCodeAt(0),
            ),
          )}
        </pre>
      )}
      {downloadAllowed && (
        <a className="p-btn outline" href={file.data} download={name}>
          Download attachment
        </a>
      )}
    </div>
  );
}
