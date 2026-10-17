"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Archive,
  ArrowLeftRight,
  CalendarClock,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  Gauge,
  History,
  Image as ImageIcon,
  Layers3,
  Maximize2,
  Monitor,
  PencilRuler,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tablet,
  WandSparkles,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import SignInExperienceBuilder from "./signin-builder-v16";
import {
  persistTheme,
  SIGNIN_CURRENT_BUILDER_THEME_STORAGE,
} from "./signin-theme-runtime";
import {
  CANONICAL_SIGNIN_THEME_REGISTRY,
  SITES_THEME_RECORDS,
  STAFFPORTAL_BACKGROUND_LIBRARY,
  STAFFPORTAL_DEFAULT_THEME_ID,
  STAFFPORTAL_THEME_RECORDS,
  activateUnifiedThemeForPreview,
  allUnifiedThemeRecords,
  createEditableVariant,
  currentActiveUnifiedThemeId,
  currentActiveVisualMode,
  registerEditableVariant,
  readAuthoritativeSignInConfig,
  returnToStaffPortalDefault,
  saveVisualModeForPreview,
  SHARED_SIGNIN_CONFIG_STATUS,
  themeRelationship,
  type UnifiedSignInThemeRecord,
} from "./signin-unified-registry";
import { Badge, Btn, Callout, Pick } from "./ui";
import {
  PREBUILT_WIDGET_TYPE_COUNT,
  PUBLIC_WIDGET_REGISTRY,
  WIDGET_VARIANT_COUNT,
} from "./signin-widget-registry";
import {
  AIDesignCopilotPanel,
  BrandStudioPanel,
  CustomWidgetBuilderPanel,
  WidgetVariantPickerPanel,
} from "./signin-studio-v21-panels";
import { useLab } from "./lab-context";
import { CURRENT_SIGNIN_STUDIO_VERSION } from "./site-version";
import { canViewStudioSection } from "./model";
import {
  canViewStudioNavigationItem,
  studioNavigationFor,
  studioNavigationGroupOrder,
  studioSectionFromQuery,
  studioSectionPath,
  type StudioSectionId,
} from "./navigation-adapter";
import "./signin-studio-v20.css";

type StudioSection = StudioSectionId;
type PreviewDevice = "390 Mobile" | "430 Mobile" | "768 Tablet" | "1024 Tablet" | "1366 Desktop" | "1672 Desktop" | "1920 Desktop" | "2560 Wide" | "4K";
const VIEWPORTS: Record<
  PreviewDevice,
  { width: number; height: number; label: string }
> = {
  "390 Mobile": { width: 390, height: 844, label: "390 × 844" },
  "430 Mobile": { width: 430, height: 932, label: "430 × 932" },
  "768 Tablet": { width: 768, height: 1024, label: "768 × 1024" },
  "1024 Tablet": { width: 1024, height: 1366, label: "1024 × 1366" },
  "1366 Desktop": { width: 1366, height: 768, label: "1366 × 768" },
  "1672 Desktop": { width: 1672, height: 941, label: "1672 × 941" },
  "1920 Desktop": { width: 1920, height: 1080, label: "1920 × 1080" },
  "2560 Wide": { width: 2560, height: 1440, label: "2560 × 1440" },
  "4K": { width: 3840, height: 2160, label: "3840 × 2160" },
};
const WIDGET_FAMILIES = Object.entries(
  PUBLIC_WIDGET_REGISTRY.reduce<Record<string, string[]>>((groups, entry) => {
    (groups[entry.category] ||= []).push(entry.name);
    return groups;
  }, {}),
);

function ThemeMiniature({ record }: { record: UnifiedSignInThemeRecord }) {
  const image = record.BACKGROUND.previewSrc || record.BACKGROUND.src;
  return (
    <div
      className={`ss20-mini layout-${record.LAYOUT_FAMILY}`}
      style={
        {
          "--mini-primary":
            record.STYLE_TOKENS.primary ||
            record.STYLE_TOKENS.gradient ||
            "#2563eb",
          "--mini-accent": record.STYLE_TOKENS.accent || "#38bdf8",
        } as CSSProperties
      }
    >
      <img src={image} alt="" loading="lazy" />
      <div className="ss20-mini-scrim" />
      <span className="ss20-mini-time">
        9:41 AM<small>Ibadan · Monday</small>
      </span>
      <div className="ss20-mini-auth">
        <i />
        <i />
        <b>Sign In</b>
      </div>
      <div className="ss20-mini-context">
        <i />
        <i />
        <i />
      </div>
      <span className="ss20-mini-orbit" />
    </div>
  );
}

function ThemeCard({
  record,
  selected,
  onSelect,
  onPreview,
  onEdit,
  onActivate,
  onCompare,
  onHistory,
}: {
  record: UnifiedSignInThemeRecord;
  selected: boolean;
  onSelect: () => void;
  onPreview?: () => void;
  onEdit?: () => void;
  onActivate?: () => void;
  onCompare?: () => void;
  onHistory?: () => void;
}) {
  return (
    <article
      className={`ss20-theme-card ${selected ? "is-selected" : ""}`}
      data-theme-id={record.THEME_ID}
      data-source-provenance={record.SOURCE_PROVENANCE}
    >
      <button
        className="ss20-theme-select"
        onClick={onSelect}
        aria-label={`Select ${record.DISPLAY_NAME}`}
      >
        <ThemeMiniature record={record} />
      </button>
      <div className="ss20-card-body">
        <div className="ss20-card-title">
          <span>
            <small>{record.SOURCE_PROVENANCE}</small>
            <h3>{record.DISPLAY_NAME}</h3>
          </span>
          {record.IS_DEFAULT ? (
            <Badge>Default</Badge>
          ) : (
            <Badge>{record.STATUS}</Badge>
          )}
        </div>
        <p>{record.DESCRIPTION}</p>
        <dl>
          <div>
            <dt>Layout</dt>
            <dd>{record.LAYOUT_FAMILY}</dd>
          </div>
          <div>
            <dt>Readiness</dt>
            <dd>Mobile · Tablet · Desktop · 4K</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>v{record.VERSION}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{new Date(record.UPDATED_AT).toLocaleDateString("en-US")}</dd>
          </div>
          <div>
            <dt>Day / Night</dt>
            <dd>{record.RENDERER_FAMILY === "WEBFLOW_HOME" ? "Supported" : "Theme dependent"}</dd>
          </div>
        </dl>
        <div className="ss20-card-actions">
          {onPreview && (
            <button onClick={onPreview}>
              <Eye />
              Preview
            </button>
          )}
          {onEdit && (
            <>
              <button onClick={onEdit}>
                <PencilRuler />
                Edit Variant
              </button>
              <button onClick={onEdit}>
                <Copy />
                Clone
              </button>
            </>
          )}
          {onActivate && (
            <button onClick={onActivate}>
              <Play />
              Set as Default
            </button>
          )}
          {onCompare && (
            <button onClick={onCompare}>
              <ArrowLeftRight />
              Compare
            </button>
          )}
          {onHistory && (
            <button onClick={onHistory}>
              <History />
              History
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function StatusTile({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`ss20-status tone-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export default function SignInStudioV20() {
  const { session } = useLab();
  const [section, setSection] = useState<StudioSection>("Home");
  const [records, setRecords] = useState<UnifiedSignInThemeRecord[]>(
    CANONICAL_SIGNIN_THEME_REGISTRY,
  );
  const [selectedId, setSelectedId] = useState(STAFFPORTAL_DEFAULT_THEME_ID);
  const [activeId, setActiveId] = useState(STAFFPORTAL_DEFAULT_THEME_ID);
  const [device, setDevice] = useState<PreviewDevice>("1672 Desktop");
  const [zoom, setZoom] = useState(42);
  const [compareId, setCompareId] = useState("sites:horizon");
  const [filter, setFilter] = useState<
    "All" | "Staff Portal" | "Sites" | "Custom"
  >("All");
  const [editorKey, setEditorKey] = useState(0);
  const [widgetSearch, setWidgetSearch] = useState("");
  const [visualMode, setVisualMode] = useState<"day" | "night">("day");
  const visibleSections = studioNavigationFor(session);
  // All Studio surfaces resolve through the canonical UI-item -> capability adapter.
  // Overview uses these same decisions so an authorized Home route cannot become a
  // side channel for unassigned theme, widget, responsive or AI information.
  const canOpenSection = useCallback(
    (candidate: StudioSection) =>
      canViewStudioNavigationItem(candidate, session),
    [session],
  );
  const canOpenThemes = canOpenSection("Themes");
  const canOpenWidgets = canOpenSection("Widgets");
  const canOpenVariants = canOpenSection("Variants");
  const canOpenBrand = canOpenSection("Brand");
  const canOpenPreview = canOpenSection("Preview");
  const canOpenResponsive = canOpenSection("Devices");
  const canOpenLayout = canOpenSection("Editor");
  const canOpenCustom = canOpenSection("Custom");
  const canOpenVersions = canOpenSection("History");
  const canOpenCompare = canOpenSection("Compare");
  const canOpenContract = canOpenSection("Contract");
  const canPublishLocalTheme = canViewStudioSection("Publish", session);
  const effectiveSection = canOpenSection(section) ? section : "Home";
  const visibleNavigationGroups = studioNavigationGroupOrder().filter((group) =>
    visibleSections.some((item) => item.group === group),
  );

  useEffect(() => {
    const syncSection = () => {
      const requested = studioSectionFromQuery(
        new URLSearchParams(window.location.search).get("studioSection"),
      );
      const next = canOpenSection(requested) ? requested : "Home";
      setSection(next);
      if (next !== requested)
        window.history.replaceState({}, "", studioSectionPath("Home"));
    };
    const timer = window.setTimeout(() => {
      setRecords(allUnifiedThemeRecords());
      setActiveId(currentActiveUnifiedThemeId());
      setVisualMode(currentActiveVisualMode());
      syncSection();
    }, 0);
    const onHistoryNavigation = syncSection;
    window.addEventListener("popstate", onHistoryNavigation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onHistoryNavigation);
    };
  }, [canOpenSection, session]);
  const selected =
    records.find((record) => record.THEME_ID === selectedId) || records[0];
  const active =
    records.find((record) => record.THEME_ID === activeId) || records[0];
  const compared =
    records.find(
      (record) =>
        record.THEME_ID === compareId && record.THEME_ID !== selected.THEME_ID,
    ) ||
    records.find((record) => record.THEME_ID !== selected.THEME_ID) ||
    records[0];
  const filtered = records.filter(
    (record) =>
      filter === "All" ||
      (filter === "Staff Portal" &&
        record.SOURCE_PROVENANCE === "STAFFPORTAL") ||
      (filter === "Sites" && record.SOURCE_PROVENANCE === "SITES") ||
      (filter === "Custom" && record.SOURCE_PROVENANCE === "CUSTOM"),
  );
  const searchableWidgetFamilies = WIDGET_FAMILIES.map(
    ([family, items]) =>
      [
        family,
        items.filter((item) =>
          item.toLowerCase().includes(widgetSearch.trim().toLowerCase()),
        ),
      ] as const,
  ).filter(([, items]) => items.length);

  function preview(record: UnifiedSignInThemeRecord) {
    if (!canOpenPreview) return;
    setSelectedId(record.THEME_ID);
    openSection("Preview");
  }
  function startEditor(record: UnifiedSignInThemeRecord) {
    if (!canOpenLayout) {
      toast.info("Layout Editor access is not assigned to this session.");
      return;
    }
    const variant = createEditableVariant(record);
    const customRecord = registerEditableVariant(record, variant);
    persistTheme(variant);
    localStorage.setItem(SIGNIN_CURRENT_BUILDER_THEME_STORAGE, variant.id);
    setRecords(allUnifiedThemeRecords());
    setSelectedId(customRecord.THEME_ID);
    setEditorKey((value) => value + 1);
    openSection("Editor");
    toast.success(
      `${record.DISPLAY_NAME} preserved. An editable draft variant is open.`,
    );
  }
  function openSection(next: StudioSection) {
    if (!canOpenSection(next)) return;
    setSection(next);
    window.history.pushState({}, "", studioSectionPath(next));
    window.dispatchEvent(new Event("daenem-studio-section-change"));
  }
  function addToLayout(type: string) {
    if (!canOpenLayout) {
      toast.info("Layout Editor access is not assigned to this session.");
      return;
    }
    localStorage.setItem("daenem-signin-add-to-layout-v26", type);
    startEditor(selected);
    toast.info(
      "Layout Editor opened with this widget queued for the active local draft.",
    );
  }
  function activate() {
    if (!canPublishLocalTheme) return;
    const record = activateUnifiedThemeForPreview(selected.THEME_ID);
    setActiveId(record.THEME_ID);
    toast.success(
      "Activated in this Sites laboratory only. No Site version or production system was published.",
    );
  }
  function activateRecord(record: UnifiedSignInThemeRecord) {
    if (!canPublishLocalTheme) return;
    const activated = activateUnifiedThemeForPreview(record.THEME_ID);
    setSelectedId(activated.THEME_ID);
    setActiveId(activated.THEME_ID);
    toast.success(`${activated.DISPLAY_NAME} is now the active review-lab Sign-In. The canonical Webflow default remains preserved.`);
  }
  function resetDefault() {
    if (!canPublishLocalTheme) return;
    const record = returnToStaffPortalDefault();
    setActiveId(record.THEME_ID);
    setSelectedId(record.THEME_ID);
    toast.success(
      "Returned to the Staff Portal default in this Sites laboratory.",
    );
  }
  function configureVisualMode(next: "day" | "night") {
    if (!canPublishLocalTheme) return;
    saveVisualModeForPreview(next);
    setVisualMode(next);
    toast.success(
      `Local preview visual mode set to ${next === "day" ? "Daytime" : "Nighttime"}; shared portal configuration is unavailable.`,
    );
  }
  function fitPreview() {
    if (!canOpenPreview) return;
    const available = Math.max(320, window.innerWidth - 430);
    setZoom(
      Math.max(
        10,
        Math.min(100, Math.floor((available / VIEWPORTS[device].width) * 100)),
      ),
    );
  }

  const studioPreview = (record: UnifiedSignInThemeRecord, label?: string) => {
    const viewport = VIEWPORTS[device];
    return (
      <div
        className="ss20-preview-shell"
        data-preview-device={device}
        style={
          {
            "--preview-w": `${viewport.width}px`,
            "--preview-h": `${viewport.height}px`,
            "--preview-scale": zoom / 100,
          } as CSSProperties
        }
      >
        <header>
          <span>
            <i className="ss20-live-dot" />
            LIVE DRAFT PREVIEW
          </span>
          <strong>{label || record.DISPLAY_NAME}</strong>
          <small>
            {viewport.label} · {zoom}%
          </small>
        </header>
        <div className="ss20-preview-stage">
          <iframe
            title={`${record.DISPLAY_NAME} ${device} preview`}
            src={`/signin?experience=${encodeURIComponent(record.THEME_ID)}&studioPreview=1`}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      className="ss20 ss21"
      data-site-identity="daenem-staff-portal"
      data-studio-ready="true"
      data-studio-section={effectiveSection}
      data-studio-version={
        canOpenVersions ? CURRENT_SIGNIN_STUDIO_VERSION : undefined
      }
      data-navigation-architecture="adaptive-hybrid"
      data-studio-role={session.role}
      data-studio-profile={session.profile || session.role}
      data-shared-config-status={
        canOpenContract ? SHARED_SIGNIN_CONFIG_STATUS : undefined
      }
      data-authoritative-active-theme={
        canOpenThemes || canOpenPreview
          ? readAuthoritativeSignInConfig().activeSignInTheme
          : undefined
      }
      data-authoritative-visual-mode={
        canOpenThemes || canOpenPreview
          ? readAuthoritativeSignInConfig().activeSignInVisualMode
          : undefined
      }
      data-default-theme={
        canOpenThemes ? STAFFPORTAL_DEFAULT_THEME_ID : undefined
      }
      data-published-sites-version={canOpenThemes ? "V16" : undefined}
    >
      <header className="ss20-hero">
        <div>
          <span className="p-kicker">ADMIN / EXPERIENCE / SIGN-IN STUDIO</span>
          <h1>Sign-In Studio</h1>
          <p>
            {canOpenThemes
              ? "One governed studio for the production Staff Portal foundation, every preserved Sites theme, and future Owner-created variants."
              : "A governed Studio workspace showing only capabilities assigned to the current session."}
          </p>
          {canOpenVersions && (
            <small
              className="ss20-current-version"
              data-current-version={CURRENT_SIGNIN_STUDIO_VERSION}
            >
              CURRENT SAVED VERSION · {CURRENT_SIGNIN_STUDIO_VERSION}
            </small>
          )}
        </div>
        <div className="ss20-state-rail">
          {canOpenThemes ? (
            <>
              <span>
                <small>PUBLIC DEFAULT</small>
                <b>Webflow Home</b>
              </span>
              <i />
              <span>
                <small>SITES LAB ACTIVE</small>
                <b>{active.DISPLAY_NAME}</b>
              </span>
              <i />
              <span>
                <small>EDITING</small>
                <b>{selected.DISPLAY_NAME}</b>
              </span>
            </>
          ) : (
            <>
              <span>
                <small>AUTHORIZED SURFACE</small>
                <b>Assigned Studio</b>
              </span>
              {canOpenBrand && (
                <>
                  <i />
                  <span>
                    <small>BRAND ACCESS</small>
                    <b>Logo &amp; Brand</b>
                  </span>
                </>
              )}
              {canOpenWidgets && (
                <>
                  <i />
                  <span>
                    <small>WIDGET ACCESS</small>
                    <b>Widget Library</b>
                  </span>
                </>
              )}
              {canOpenResponsive && (
                <>
                  <i />
                  <span>
                    <small>RESPONSIVE ACCESS</small>
                    <b>Responsive Preview</b>
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </header>
      <div className="ss20-truth">
        <ShieldCheck />
        <span>
          <b>
            {canOpenThemes || canOpenPreview
              ? "Preview is isolated."
              : "Workspace is isolated."}
          </b>{" "}
          {canOpenThemes || canOpenPreview
            ? "Draft, Preview and Review never switch the public Sign-In. Only the explicit “Activate Preview” laboratory action changes this Site’s local active experience."
            : "Draft changes remain local to this review workspace and do not change the public Sign-In."}
        </span>
        <Badge>NOT PUBLISHED</Badge>
      </div>
      <div className="ss20-layout">
        <nav className="ss20-nav" aria-label="Sign-In Studio local navigation">
          <span>STUDIO</span>
          {visibleNavigationGroups.map((group) => (
            <div className="ss20-nav-group" key={group}>
              <small>{group}</small>
              {visibleSections
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={effectiveSection === item.id ? "active" : ""}
                      onClick={() => openSection(item.id)}
                      title={item.description}
                      aria-current={effectiveSection === item.id ? "page" : undefined}
                    >
                      <Icon />
                      <b>{item.label}</b>
                      <ChevronRight />
                    </button>
                  );
                })}
            </div>
          ))}
          <div className="ss20-nav-contract">
            {canOpenThemes ? (
              <>
                <small>SOURCE PROVENANCE</small>
                <b>Always visible</b>
                <span>Staff Portal + Sites preserved</span>
              </>
            ) : (
              <>
                <small>ACCESS BOUNDARY</small>
                <b>Least privilege</b>
                <span>Only assigned capabilities appear</span>
              </>
            )}
          </div>
        </nav>
        <main className="ss20-main">
          {canOpenThemes && (
            <section
              className="ss20-truth"
              aria-label="Active Sign-In visual mode"
            >
              <ShieldCheck />
              <span>
                <b>ACTIVE SIGN-IN · WEBFLOW HOME</b> Default visual mode:{" "}
                {visualMode === "day" ? "DAYTIME" : "NIGHTTIME"}. Shared
                project persistence is unavailable in this Site, so these
                controls are local preview state only.
              </span>
              {canPublishLocalTheme && (
                <>
                  <Btn
                    variant={visualMode === "day" ? undefined : "outline"}
                    onClick={() => configureVisualMode("day")}
                  >
                    Daytime
                  </Btn>
                  <Btn
                    variant={visualMode === "night" ? undefined : "outline"}
                    onClick={() => configureVisualMode("night")}
                  >
                    Nighttime
                  </Btn>
                </>
              )}
            </section>
          )}
          {effectiveSection === "Home" && (
            <>
              {canOpenThemes ? (
                <>
                  <div className="ss20-status-grid">
                    <StatusTile
                      label="CURRENT DEFAULT"
                      value="Webflow Home"
                      detail="webflow:home-default · DEFAULT · ACTIVE"
                      tone="cyan"
                    />
                    <StatusTile
                      label="CURRENT ACTIVE"
                      value={active.DISPLAY_NAME}
                      detail={`${active.SOURCE_PROVENANCE} · Sites laboratory only`}
                      tone="violet"
                    />
                    <StatusTile
                      label="DRAFTS"
                      value={String(
                        records.filter((record) => record.IS_DRAFT).length,
                      )}
                      detail="Autosave recovery enabled"
                    />
                    <StatusTile
                      label="THEME PRESERVATION"
                      value={`${records.length} / ${records.length}`}
                      detail="Webflow default + 20 preserved alternatives"
                      tone="amber"
                    />
                  </div>
                  <section className="ss20-home-grid">
                    <div className="ss20-featured">
                      <header>
                        <span>
                          <small>ACTIVE SIGN-IN</small>
                          <h2>Webflow Home — Accepted Default</h2>
                          <p>
                            Owner-accepted Webflow Home is now authoritative.
                            All former defaults remain preserved as alternatives.
                          </p>
                        </span>
                        <Badge>DEFAULT</Badge>
                      </header>
                      <ThemeMiniature record={records[0]} />
                      <footer>
                        <span>
                          <b>Source</b>Accepted Webflow Home
                        </span>
                        <span>
                          <b>Status</b>DEFAULT · ACTIVE
                        </span>
                        <span>
                          <b>Breakpoints</b>Mobile · Tablet · Desktop · 4K
                        </span>
                        <div>
                          <Btn onClick={() => preview(records[0])}>
                            <Play />
                            Open Live Preview
                          </Btn>
                          <Btn
                            variant="outline"
                            onClick={() => startEditor(records[0])}
                          >
                            <Copy />
                            Create Variant
                          </Btn>
                        </div>
                      </footer>
                    </div>
                    <div className="ss20-home-side">
                      <article>
                        <ImageIcon />
                        <span>
                          <small>BACKGROUND LIBRARY</small>
                          <strong>
                            {STAFFPORTAL_BACKGROUND_LIBRARY.length} approved
                            experiences
                          </strong>
                          <p>Original asset and focal metadata retained.</p>
                        </span>
                      </article>
                      <article>
                        <Layers3 />
                        <span>
                          <small>CANONICAL REGISTRY</small>
                          <strong>{records.length} selectable themes</strong>
                          <p>Provenance-aware IDs prevent overwrite.</p>
                        </span>
                      </article>
                      <article>
                        <Workflow />
                        <span>
                          <small>LIFECYCLE</small>
                          <strong>Draft → Preview → Review</strong>
                          <p>Production integration remains pending.</p>
                        </span>
                      </article>
                      <article>
                        <Gauge />
                        <span>
                          <small>BREAKPOINT CONTROL</small>
                          <strong>Independent layouts</strong>
                          <p>
                            Mobile, Tablet, Desktop and 4K persist separately.
                          </p>
                        </span>
                      </article>
                      <Btn onClick={() => openSection("Themes")}>
                        Browse Theme Library
                        <ChevronRight />
                      </Btn>
                    </div>
                  </section>
                  <section className="ss20-home-strip">
                    <header>
                      <div>
                        <small>RECENT / PRESERVED EXPERIENCES</small>
                        <h2>Designed to stay distinct.</h2>
                      </div>
                      <button onClick={() => openSection("Themes")}>
                        View all {records.length} themes
                      </button>
                    </header>
                    <div>
                      {records.slice(0, 6).map((record) => (
                        <button
                          key={record.THEME_ID}
                          onClick={() => preview(record)}
                        >
                          <ThemeMiniature record={record} />
                          <span>
                            <b>{record.DISPLAY_NAME}</b>
                            <small>
                              {record.SOURCE_PROVENANCE} ·{" "}
                              {record.LAYOUT_FAMILY}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <div className="ss20-status-grid ss20-authorized-status">
                    <StatusTile
                      label="AUTHORIZED SURFACE"
                      value="Sign-In Studio"
                      detail="Only assigned Studio capabilities are active"
                      tone="cyan"
                    />
                    {canOpenBrand && (
                      <StatusTile
                        label="BRAND ACCESS"
                        value="Logo & Brand"
                        detail="Approved brand-object controls"
                      />
                    )}
                    {canOpenWidgets && (
                      <StatusTile
                        label="WIDGET ACCESS"
                        value={`${PREBUILT_WIDGET_TYPE_COUNT} types`}
                        detail="Assigned governed widget registry"
                      />
                    )}
                    {canOpenResponsive && (
                      <StatusTile
                        label="RESPONSIVE ACCESS"
                        value="Preview"
                        detail="Assigned breakpoint review"
                      />
                    )}
                  </div>
                  <section className="ss20-home-grid ss20-authorized-overview">
                    <div className="ss20-featured">
                      <header>
                        <span>
                          <small>ASSIGNED STUDIO WORKSPACE</small>
                          <h2>Studio tools ready for this session</h2>
                          <p>
                            This overview is intentionally limited to the
                            capabilities assigned to the current session.
                          </p>
                        </span>
                        <Badge>ISOLATED</Badge>
                      </header>
                      <div
                        className="ss20-authorized-workspace-mark"
                        aria-hidden="true"
                      >
                        <Sparkles />
                      </div>
                      <footer>
                        <span>
                          <b>Role</b>
                          {session.role}
                        </span>
                        <span>
                          <b>Access</b>Explicit capabilities
                        </span>
                      </footer>
                    </div>
                    <div className="ss20-home-side">
                      <article>
                        <ShieldCheck />
                        <span>
                          <small>GOVERNED WORKSPACE</small>
                          <strong>Assignment-aware controls</strong>
                          <p>
                            Every visible action resolves through the Studio
                            access contract.
                          </p>
                        </span>
                      </article>
                      {canOpenBrand && (
                        <Btn onClick={() => openSection("Brand")}>
                          Open Logo &amp; Brand
                          <ChevronRight />
                        </Btn>
                      )}
                      {canOpenPreview && (
                        <Btn onClick={() => openSection("Preview")}>
                          Open Live Preview
                          <ChevronRight />
                        </Btn>
                      )}
                      {canOpenWidgets && (
                        <Btn onClick={() => openSection("Widgets")}>
                          Open Widget Library
                          <ChevronRight />
                        </Btn>
                      )}
                      {canOpenVariants && (
                        <Btn onClick={() => openSection("Variants")}>
                          Open Widget Variants
                          <ChevronRight />
                        </Btn>
                      )}
                      {canOpenResponsive && (
                        <Btn onClick={() => openSection("Devices")}>
                          Open Responsive Preview
                          <ChevronRight />
                        </Btn>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {effectiveSection === "Themes" && (
            <section className="ss20-library">
              <header>
                <div>
                  <span className="p-kicker">THEME LIBRARY</span>
                  <h2>Every valid source theme, intact.</h2>
                  <p>
                    Canonical records are never overwritten. Edit creates a
                    governed variant and keeps the historical source identity.
                  </p>
                </div>
                <div>
                  <Pick
                    label="Theme source"
                    value={filter}
                    onChange={(value) => setFilter(value as typeof filter)}
                    options={["All", "Staff Portal", "Sites", "Custom"]}
                  />
                  <Btn onClick={() => startEditor(selected)}>
                    <Plus />
                    Create Theme
                  </Btn>
                </div>
              </header>
              <div className="ss20-inventory-tabs">
                <button
                  className={filter === "All" ? "active" : ""}
                  onClick={() => setFilter("All")}
                >
                  All <b>{records.length}</b>
                </button>
                <button
                  className={filter === "Staff Portal" ? "active" : ""}
                  onClick={() => setFilter("Staff Portal")}
                >
                  Staff Portal <b>{STAFFPORTAL_THEME_RECORDS.length}</b>
                </button>
                <button
                  className={filter === "Sites" ? "active" : ""}
                  onClick={() => setFilter("Sites")}
                >
                  Sites <b>{SITES_THEME_RECORDS.length}</b>
                </button>
                <button
                  className={filter === "Custom" ? "active" : ""}
                  onClick={() => setFilter("Custom")}
                >
                  Custom{" "}
                  <b>
                    {
                      records.filter(
                        (record) => record.SOURCE_PROVENANCE === "CUSTOM",
                      ).length
                    }
                  </b>
                </button>
              </div>
              <div className="ss20-theme-grid">
                {filtered.map((record) => (
                  <ThemeCard
                    key={record.THEME_ID}
                    record={record}
                    selected={selected.THEME_ID === record.THEME_ID}
                    onSelect={() => setSelectedId(record.THEME_ID)}
                    onPreview={
                      canOpenPreview ? () => preview(record) : undefined
                    }
                    onEdit={
                      canOpenLayout ? () => startEditor(record) : undefined
                    }
                    onActivate={
                      canPublishLocalTheme
                        ? () => activateRecord(record)
                        : undefined
                    }
                    onCompare={
                      canOpenCompare
                        ? () => {
                            setSelectedId(record.THEME_ID);
                            openSection("Compare");
                          }
                        : undefined
                    }
                    onHistory={
                      canOpenVersions
                        ? () => openSection("History")
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {effectiveSection === "Preview" && (
            <section className="ss20-preview-workspace">
              <header>
                <div>
                  <span className="p-kicker">
                    LIVE PREVIEW / SAME PUBLIC RENDERER
                  </span>
                  <h2>{selected.DISPLAY_NAME}</h2>
                  <p>
                    <b>{selected.SOURCE_PROVENANCE}</b> · {selected.THEME_ID} ·
                    v{selected.VERSION}
                  </p>
                </div>
                <div className="ss20-preview-actions">
                  {canPublishLocalTheme && (
                    <Btn variant="outline" onClick={resetDefault}>
                      <RotateCcw />
                      Return To Staff Portal Default
                    </Btn>
                  )}
                  {canOpenLayout && (
                    <Btn variant="outline" onClick={() => startEditor(selected)}>
                      <PencilRuler />
                      Edit Variant
                    </Btn>
                  )}
                  {canPublishLocalTheme && (
                    <Btn onClick={activate}>
                      <Play />
                      Activate Preview
                    </Btn>
                  )}
                </div>
              </header>
              <div className="ss20-device-bar">
                <div>
                  {(Object.keys(VIEWPORTS) as PreviewDevice[]).map((item) => (
                    <button
                      key={item}
                      className={device === item ? "active" : ""}
                      onClick={() => setDevice(item)}
                    >
                      {item.includes("Mobile") ? (
                        <Smartphone />
                      ) : item.includes("Tablet") ? (
                        <Tablet />
                      ) : (
                        <Monitor />
                      )}
                      <span>
                        <b>{item}</b>
                        <small>{VIEWPORTS[item].label}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="ss20-zoom">
                  <button onClick={fitPreview}>Fit</button>
                  <button onClick={() => setZoom(100)}>100%</button>
                  <input
                    aria-label="Preview zoom"
                    type="range"
                    min="10"
                    max="100"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <output>{zoom}%</output>
                  <button
                    onClick={() =>
                      document
                        .querySelector<HTMLIFrameElement>(
                          ".ss20-preview-stage iframe",
                        )
                        ?.requestFullscreen()
                    }
                  >
                    <Maximize2 />
                    Full Screen
                  </button>
                </div>
              </div>
              {studioPreview(selected)}
              <Callout tone="neutral" title="Preview does not activate">
                This iframe uses the same Sign-In route and renderer at the
                selected real viewport width. It does not change Current Active,
                save a Draft or publish a Site version.
              </Callout>
            </section>
          )}

          {effectiveSection === "Editor" && (
            <section className="ss20-editor">
              <header>
                <div>
                  <span className="p-kicker">NO-CODE EDIT MODE</span>
                  <h2>Independent breakpoint canvas</h2>
                  <p>
                    Drag, drop, resize, reorder, group, lock, style, animate and
                    version a safe declarative theme.
                  </p>
                </div>
                <div className="ss20-editor-badges">
                  <Badge>DRAFT</Badge>
                  <Badge>PUBLIC UNCHANGED</Badge>
                  <Badge>AUTOSAVE RECOVERY</Badge>
                </div>
              </header>
              <SignInExperienceBuilder key={editorKey} />
            </section>
          )}

          {effectiveSection === "Widgets" && (
            <section className="ss20-widget-library">
              <header>
                <div>
                  <span className="p-kicker">
                    EXTENSIBLE GOVERNED WIDGET REGISTRY
                  </span>
                  <h2>
                    {PREBUILT_WIDGET_TYPE_COUNT} functional public-safe widget
                    types.
                  </h2>
                  <p>
                    Every enabled Add action updates the active local draft.
                    Search the actual registry, inspect purpose and variants,
                    then add a governed widget to the Layout Editor.
                  </p>
                </div>
                <div className="s21-counts">
                  <span>
                    <b>{PREBUILT_WIDGET_TYPE_COUNT}</b> types
                  </span>
                  <span>
                    <b>{WIDGET_VARIANT_COUNT}</b> variants
                  </span>
                </div>
              </header>
              <label className="ss20-widget-search">
                Search widget registry
                <input
                  aria-label="Search widget registry"
                  value={widgetSearch}
                  onChange={(event) => setWidgetSearch(event.target.value)}
                  placeholder="Weather, clock, status…"
                />
              </label>
              <div className="ss20-widget-groups">
                {searchableWidgetFamilies.map(([family, items]) => (
                  <article key={family}>
                    <header>
                      <Sparkles />
                      <h3>{family}</h3>
                      <Badge>{items.length}</Badge>
                    </header>
                    <div>
                      {items.map((item) => {
                        const entry = PUBLIC_WIDGET_REGISTRY.find(
                          (candidate) => candidate.name === item,
                        );
                        return (
                          <div className="ss20-widget-row" key={item}>
                            <span>
                              <Check />
                              {item}
                            </span>
                            {entry && canOpenLayout && (
                              <Btn
                                variant="outline"
                                onClick={() => addToLayout(entry.type)}
                              >
                                Add To Layout
                              </Btn>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
              {canOpenCustom && (
                <section className="ss20-custom-widget">
                  <div>
                    <WandSparkles />
                    <span>
                      <small>CUSTOM WIDGET BUILDER</small>
                      <h3>Compose a new public-safe widget.</h3>
                      <p>
                        Heading, text, image, icon, metric, badge, link, clock,
                        date, public status, divider, spacer and container
                        blocks—without executable code.
                      </p>
                    </span>
                  </div>
                  <div>
                    {[
                      "Content",
                      "Layout",
                      "Style",
                      "Responsive",
                      "Motion",
                      "Data classification",
                    ].map((item) => (
                      <span key={item}>
                        {item}
                        <Check />
                      </span>
                    ))}
                  </div>
                  <Btn onClick={() => openSection("Custom")}>
                    Open Custom Widget Builder
                  </Btn>
                </section>
              )}
            </section>
          )}

          {effectiveSection === "Variants" && <WidgetVariantPickerPanel />}
          {effectiveSection === "Custom" && (
            <CustomWidgetBuilderPanel
              onOpenEditor={
                canOpenLayout ? () => startEditor(selected) : undefined
              }
              onAddToLayout={
                canOpenLayout
                  ? () => addToLayout("customComposition")
                  : undefined
              }
            />
          )}
          {effectiveSection === "Brand" && <BrandStudioPanel />}
          {effectiveSection === "AI" && <AIDesignCopilotPanel />}

          {effectiveSection === "Copy" && (
            <section className="ss20-shortcut ss20-copy">
              <header>
                <PencilRuler />
                <div>
                  <span className="p-kicker">WORDING & COPY CONTROL</span>
                  <h2>Clear language, governed meaning.</h2>
                  <p>
                    Edit headings, taglines, helper text, widget labels,
                    approved button labels, news framing, motivation, AI
                    Inspiration, footer, company and support copy from typed
                    Widget Settings.
                  </p>
                </div>
              </header>
              <div className="ss20-copy-grid">
                {[
                  ["Headings & taglines", "Hero and theme narrative"],
                  ["Authentication helpers", "Product-safe guidance"],
                  ["News & intelligence", "Headings and provider framing"],
                  ["AI Inspiration", "Approved public editorial"],
                  ["Employee motivation", "Admin-managed daily focus"],
                  ["Footer & support", "Company, contact and help copy"],
                ].map(([title, detail]) => (
                  <article key={title}>
                    <small>EDITABLE COPY</small>
                    <b>{title}</b>
                    <span>{detail}</span>
                    <Check />
                  </article>
                ))}
              </div>
              <Callout tone="neutral" title="Mandatory meaning is protected">
                Authentication, legal, privacy and security meaning cannot be
                removed silently. Every editable field is sanitized plain text,
                and each widget exposes Reset To Default.
              </Callout>
              {canOpenLayout && (
                <Btn onClick={() => startEditor(selected)}>
                  Open Live Wording Controls
                  <ChevronRight />
                </Btn>
              )}
            </section>
          )}

          {effectiveSection === "Style" && (
            <section className="ss20-shortcut">
              <header>
                <SlidersHorizontal />
                <div>
                  <span className="p-kicker">VISUAL STYLE STUDIO</span>
                  <h2>Every surface, under Owner control.</h2>
                  <p>
                    Background, focal point, crop, brightness, contrast,
                    saturation, tint, blur, vignette, noise, overlay, gradient,
                    glass, opacity, border, luminous edge, shadow, radius, glow,
                    spacing, typography, inputs and buttons.
                  </p>
                </div>
              </header>
              <div className="ss20-style-samples">
                {STAFFPORTAL_BACKGROUND_LIBRARY.map((asset) => (
                  <button key={asset.assetId} onClick={() => preview(selected)}>
                    <img src={asset.previewSrc || asset.src} alt="" />
                    <span>
                      <b>{asset.name}</b>
                      <small>STAFFPORTAL · Original metadata</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="ss20-semantic-rule">
                <ShieldCheck />
                <span>
                  <b>GREEN_SEMANTIC_ONLY</b> Green is reserved for genuine
                  success, health, availability, connection, completion and
                  validity.
                </span>
              </div>
              {canOpenLayout && (
                <Btn onClick={() => startEditor(selected)}>
                  Open Live Style Controls
                  <ChevronRight />
                </Btn>
              )}
            </section>
          )}

          {effectiveSection === "Motion" && (
            <section className="ss20-shortcut">
              <header>
                <WandSparkles />
                <div>
                  <span className="p-kicker">MOTION STUDIO</span>
                  <h2>Governed energy, never distraction.</h2>
                  <p>
                    Off, Subtle, Standard, Enhanced and Custom profiles with
                    breakpoint-aware duration, delay, intensity, easing, loop,
                    direction, hover-only and idle controls.
                  </p>
                </div>
              </header>
              <div className="ss20-motion-grid">
                {[
                  "Fade",
                  "Slide",
                  "Scale",
                  "Blur Reveal",
                  "Stagger",
                  "Glow Pulse",
                  "Gradient Motion",
                  "Aurora",
                  "Background Drift",
                  "Parallax",
                  "Depth Tilt",
                  "Hover Lift",
                  "Light Sweep",
                  "Border Energy",
                  "Ambient Particles",
                  "AI Orb",
                  "Weather Motion",
                  "Clock Motion",
                  "News Transition",
                  "Auth Transition",
                  "Focus Glow",
                  "Button Response",
                  "Success / Error",
                  "Skeleton",
                ].map((effect, index) => (
                  <article key={effect}>
                    <span className={`ss20-motion-mark mark-${index % 6}`} />
                    <b>{effect}</b>
                    <small>{index % 5 === 0 ? "STANDARD" : "SUBTLE"}</small>
                  </article>
                ))}
              </div>
              <Callout tone="neutral" title="Reduced motion is mandatory">
                The runtime disables decorative movement when the device
                requests reduced motion. Security and success meaning never
                depend on animation alone.
              </Callout>
              {canOpenLayout && (
                <Btn onClick={() => startEditor(selected)}>
                  Open Live Motion Controls
                  <ChevronRight />
                </Btn>
              )}
            </section>
          )}

          {effectiveSection === "History" && (
            <section className="ss20-history">
              <header>
                <div>
                  <span className="p-kicker">VERSION HISTORY</span>
                  <h2>Every saved change remains traceable.</h2>
                  <p>
                    Saved, reviewed, failed, blocked, accepted and published
                    states remain distinct and truthful.
                  </p>
                </div>
                <Btn variant="outline" disabled>
                  <Archive />
                  Archived Themes · No archived records
                </Btn>
              </header>
              <div className="ss20-timeline">
                <article>
                  <span>V29</span>
                  <i />
                  <div>
                    <small>CURRENT SAVED CORRECTION</small>
                    <h3>
                      Responsive safety and truthful version-history correction
                    </h3>
                    <p>
                      V29 corrects the visible saved-version timeline, removes
                      mobile content clipping, and makes the tablet navigation
                      trigger reachable. Runtime acceptance remains subject to
                      exact-final evidence.
                    </p>
                    <b>V28 → V29</b>
                  </div>
                  <Badge>NOT PUBLISHED</Badge>
                </article>
                <article>
                  <span>V28</span>
                  <i />
                  <div>
                    <small>SAVED REVIEW VERSION</small>
                    <h3>Responsive and accessibility correction attempt</h3>
                    <p>
                      V28 is the saved responsive/accessibility correction
                      attempt. Runtime acceptance was blocked and V28 was not
                      published.
                    </p>
                    <b>V27 → V28</b>
                  </div>
                  <Badge>NOT PUBLISHED</Badge>
                </article>
                <article>
                  <span>V27</span>
                  <i />
                  <div>
                    <small>REVIEWED - FAILED ACCEPTANCE</small>
                    <h3>
                      Security isolation, editor and runtime acceptance
                      correction
                    </h3>
                    <p>
                      V27 filters Studio Overview surfaces by canonical
                      capability, repairs direct widget manipulation,
                      prioritizes the editing canvas and records exact
                      responsive and accessibility evidence. It is saved for
                      review only.
                    </p>
                    <b>V26 → V27</b>
                  </div>
                  <Badge>NOT PUBLISHED</Badge>
                </article>
                <article>
                  <span>V26</span>
                  <i />
                  <div>
                    <small>REVIEWED - FAILED ACCEPTANCE</small>
                    <h3>Studio route gate and exact-runtime correction</h3>
                    <p>
                      V26 resolves UI section IDs through the canonical Studio
                      capability on each navigation item, restores assigned
                      route access and remains retained as the saved base for
                      this correction.
                    </p>
                    <b>V25 → V26</b>
                  </div>
                  <Badge>NOT PUBLISHED</Badge>
                </article>
                <article>
                  <span>V25</span>
                  <i />
                  <div>
                    <small>REVIEWED BASE</small>
                    <h3>Navigation, route and granular access correction</h3>
                    <p>
                      V25 is retained as the earlier saved navigation
                      correction. Its UI-ID capability gate defect was addressed
                      by V26.
                    </p>
                    <b>V24 → V25</b>
                  </div>
                  <Badge>BASE</Badge>
                </article>
                <article>
                  <span>V24</span>
                  <i />
                  <div>
                    <small>REVIEWED HISTORY</small>
                    <h3>Adaptive hybrid foundation</h3>
                    <p>
                      V24 is retained as the earlier saved navigation
                      foundation. Its review defects are recorded in the
                      historical evidence package.
                    </p>
                    <b>V23 → V24</b>
                  </div>
                  <Badge>HISTORICAL</Badge>
                </article>
                <article>
                  <span>V22</span>
                  <i />
                  <div>
                    <small>REVIEW CHECKPOINT</small>
                    <h3>Full-Power Sign-In Studio</h3>
                    <p>
                      Deterministic theme rendering, direct manipulation,
                      expanded widgets, Logo &amp; Brand, AI proposals, global
                      12-hour display and complete evidence contracts.
                    </p>
                    <b>V21 → V22</b>
                  </div>
                  <Badge>NOT ACCEPTED</Badge>
                </article>
                <article>
                  <span>V21</span>
                  <i />
                  <div>
                    <small>ACCEPTANCE CORRECTION</small>
                    <h3>Sign-In Studio foundation</h3>
                    <p>
                      Direct manipulation, expanded widgets, Logo &amp; Brand
                      and AI proposal foundations are preserved.
                    </p>
                    <b>V20 → V21</b>
                  </div>
                  <Badge>PRESERVED</Badge>
                </article>
                <article>
                  <span>V20</span>
                  <i />
                  <div>
                    <small>IMPORTED BASELINE</small>
                    <h3>Unified Sign-In Registry</h3>
                    <p>
                      Production Staff Portal Sign-In and ten themes merged with
                      ten preserved Sites themes.
                    </p>
                    <b>839dc56… + 58e1786…</b>
                  </div>
                  <Badge>PRESERVED</Badge>
                </article>
                <article>
                  <span>V16</span>
                  <i />
                  <div>
                    <small>CURRENT PUBLISHED SITE</small>
                    <h3>Live Sites version</h3>
                    <p>
                      V16 is the current published Sites version. V29 is the
                      current saved review version; V28 was saved but runtime
                      acceptance was blocked; V27 and V26 were reviewed without
                      acceptance.
                    </p>
                    <b>0848684…</b>
                  </div>
                  <Badge>PUBLISHED</Badge>
                </article>
              </div>
              <div className="ss20-history-actions">
                {canOpenCompare && (
                  <Btn variant="outline" onClick={() => openSection("Compare")}>
                    <ArrowLeftRight />
                    Compare Selected
                  </Btn>
                )}
                {canOpenLayout && (
                  <Btn variant="outline" onClick={() => startEditor(selected)}>
                    <RotateCcw />
                    Restore As Draft
                  </Btn>
                )}
                <Btn
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(selected, null, 2)], {
                        type: "application/json",
                      }),
                      url = URL.createObjectURL(blob),
                      anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${selected.THEME_ID.replace(/:/g, "-")}.json`;
                    anchor.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <Save />
                  Export Configuration
                </Btn>
                <Btn disabled>
                  <CalendarClock />
                  Production Rollback · Integration Pending
                </Btn>
              </div>
            </section>
          )}

          {effectiveSection === "Compare" && (
            <section className="ss20-compare">
              <header>
                <div>
                  <span className="p-kicker">THEME COMPARE</span>
                  <h2>Structure, provenance and presentation.</h2>
                </div>
                <div>
                  <Pick
                    label="Compare with"
                    value={compared.THEME_ID}
                    onChange={setCompareId}
                    options={records
                      .filter((record) => record.THEME_ID !== selected.THEME_ID)
                      .map((record) => ({
                        value: record.THEME_ID,
                        label: `${record.DISPLAY_NAME} · ${record.SOURCE_PROVENANCE}`,
                      }))}
                  />
                </div>
              </header>
              <div className="ss20-compare-grid">
                <article>
                  <ThemeMiniature record={selected} />
                  <h3>{selected.DISPLAY_NAME}</h3>
                  <p>{selected.THEME_ID}</p>
                </article>
                <span className="ss20-versus">
                  <ArrowLeftRight />
                  <b>{themeRelationship(selected, compared)}</b>
                </span>
                <article>
                  <ThemeMiniature record={compared} />
                  <h3>{compared.DISPLAY_NAME}</h3>
                  <p>{compared.THEME_ID}</p>
                </article>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>{selected.DISPLAY_NAME}</th>
                    <th>{compared.DISPLAY_NAME}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Source",
                      selected.SOURCE_PROVENANCE,
                      compared.SOURCE_PROVENANCE,
                    ],
                    [
                      "Layout family",
                      selected.LAYOUT_FAMILY,
                      compared.LAYOUT_FAMILY,
                    ],
                    [
                      "Background",
                      selected.BACKGROUND.name,
                      compared.BACKGROUND.name,
                    ],
                    [
                      "Motion",
                      String(selected.MOTION_PROFILE.level || "Governed"),
                      String(compared.MOTION_PROFILE.level || "Governed"),
                    ],
                    [
                      "Breakpoints",
                      "Mobile · Tablet · Desktop · 4K",
                      "Mobile · Tablet · Desktop · 4K",
                    ],
                    [
                      "Authentication",
                      selected.AUTH_TREATMENT,
                      compared.AUTH_TREATMENT,
                    ],
                  ].map((row) => (
                    <tr key={row[0]}>
                      <th>{row[0]}</th>
                      <td>{row[1]}</td>
                      <td>{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canOpenPreview && (
                <Btn onClick={() => openSection("Preview")}>
                  <Eye />
                  Preview Selected
                </Btn>
              )}
            </section>
          )}

          {effectiveSection === "Devices" && (
            <section className="ss20-devices">
              <header>
                <div>
                  <span className="p-kicker">
                    DEVICE EXPERIENCE / FICTIONAL DEMO DATA
                  </span>
                  <h2>How the Portal experience is being represented.</h2>
                  <p>
                    This Sites laboratory does not claim production telemetry.
                    Values below are labelled design fixtures for responsive
                    planning only.
                  </p>
                </div>
                <Badge>DEMO DATA</Badge>
              </header>
              <div className="ss20-device-cards">
                <article>
                  <Smartphone />
                  <span>
                    <small>MOBILE</small>
                    <strong>47%</strong>
                    <p>390–430px fixture sessions</p>
                  </span>
                  <i style={{ "--share": "47%" } as CSSProperties} />
                </article>
                <article>
                  <Tablet />
                  <span>
                    <small>TABLET</small>
                    <strong>18%</strong>
                    <p>768–1024px fixture sessions</p>
                  </span>
                  <i style={{ "--share": "18%" } as CSSProperties} />
                </article>
                <article>
                  <Monitor />
                  <span>
                    <small>DESKTOP / WEB</small>
                    <strong>35%</strong>
                    <p>1280px+ fixture sessions</p>
                  </span>
                  <i style={{ "--share": "35%" } as CSSProperties} />
                </article>
              </div>
              <div className="ss20-device-matrix">
                <header>
                  <b>Experience readiness</b>
                  <span>
                    Fictional review sample · Privacy-safe classes only
                  </span>
                </header>
                {[
                  "Authentication comfort",
                  "Context at a glance",
                  "Touch targets",
                  "Typography",
                  "Background focal integrity",
                  "Reduced motion",
                ].map((metric, index) => (
                  <div key={metric}>
                    <b>{metric}</b>
                    <span>
                      Mobile <i />
                      <em>{index === 0 ? "Priority" : "Ready"}</em>
                    </span>
                    <span>
                      Tablet <i />
                      <em>Ready</em>
                    </span>
                    <span>
                      Desktop <i />
                      <em>Ready</em>
                    </span>
                  </div>
                ))}
              </div>
              <Callout
                tone="neutral"
                title="PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION"
              >
                Later mapping may use authorized, privacy-respecting
                session/device classes. No invasive tracking, fingerprinting or
                production telemetry is active here.
              </Callout>
            </section>
          )}

          {effectiveSection === "Contract" && (
            <section className="ss20-contract">
              <header>
                <Code2 />
                <div>
                  <span className="p-kicker">
                    REPOSITORY / CODE-GENERATION CONTRACT
                  </span>
                  <h2>Design decisions become governed artifacts.</h2>
                  <p>
                    The browser edits deterministic declarative configuration.
                    It never mutates arbitrary production source.
                  </p>
                </div>
              </header>
              <div className="ss20-contract-flow">
                {[
                  "Approved Experience Version",
                  "Deterministic Configuration",
                  "Safe Generated Artifacts",
                  "Version Hash",
                  "Future Branch / Commit / PR",
                  "Build + Tests",
                  "Controlled Deployment",
                ].map((item, index) => (
                  <span key={item}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {item}
                    {index < 6 && <ChevronRight />}
                  </span>
                ))}
              </div>
              <div className="ss20-contract-grid">
                <article>
                  <ShieldCheck />
                  <h3>Security envelope</h3>
                  {[
                    "Authentication mandatory",
                    "No arbitrary JavaScript",
                    "No executable HTML",
                    "No API keys or secrets",
                    "No restricted pre-auth data",
                    "Mandatory legal meaning retained",
                  ].map((item) => (
                    <span key={item}>
                      <Check />
                      {item}
                    </span>
                  ))}
                </article>
                <article>
                  <Workflow />
                  <h3>Future production bridge</h3>
                  {[
                    "PRODUCTION INTEGRATION PENDING",
                    "No GitHub write in this sprint",
                    "No Cloudflare / D1 / R2 change",
                    "Explicit review before deployment",
                    "Rollback to a versioned artifact",
                    "RBAC remains authoritative",
                  ].map((item) => (
                    <span key={item}>
                      <Check />
                      {item}
                    </span>
                  ))}
                </article>
              </div>
              <Callout
                tone="neutral"
                title="AFTERSIGNIN-STUDIO-001 · QUEUED_AFTER_SIGNIN_98_GATE"
              >
                After-Sign-In Experience / After-Sign-In Studio is recorded
                only. Current Sites after-login pages remain the future visual
                baseline; the old production post-auth frontend is not imported.
              </Callout>
            </section>
          )}
        </main>
      </div>
    </section>
  );
}
