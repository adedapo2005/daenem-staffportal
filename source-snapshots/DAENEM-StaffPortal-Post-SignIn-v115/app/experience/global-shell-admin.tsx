"use client";

import { useState } from "react";
import {
  Bell,
  Bot,
  CloudSun,
  Compass,
  Gauge,
  History,
  KeyRound,
  LayoutPanelLeft,
  MapPinned,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { type Session } from "./model";
import { type Preferences } from "./Portal";
import { Badge, Btn, Callout } from "./ui";

type ShellDraft = {
  navigationDefault: "Expanded" | "Collapsed";
  pinnedHome: boolean;
  aiEnabled: boolean;
  predictions: boolean;
  shortcut: boolean;
  historyPolicy: "Off" | "Session only";
  orbIntensity: "Off" | "Subtle" | "Balanced" | "Enhanced";
  weather: boolean;
  version: boolean;
  help: boolean;
  notifications: boolean;
  temperature: "Fahrenheit" | "Celsius";
  motion: "Off" | "Subtle" | "Balanced" | "Enhanced";
  versionHistory: "Administrators" | "Authorized roles";
  releaseNotes: boolean;
};

const initialDraft: ShellDraft = {
  navigationDefault: "Expanded",
  pinnedHome: true,
  aiEnabled: true,
  predictions: true,
  shortcut: true,
  historyPolicy: "Session only",
  orbIntensity: "Subtle",
  weather: false,
  version: true,
  help: true,
  notifications: true,
  temperature: "Fahrenheit",
  motion: "Balanced",
  versionHistory: "Authorized roles",
  releaseNotes: true,
};

function PreviewToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="gs-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function SettingSelect({
  label,
  detail,
  value,
  options,
  onChange,
}: {
  label: string;
  detail: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="gs-select-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function GlobalShellAdmin({
  session,
  preferences,
  organizationTemperatureUnit,
  onBack,
}: {
  session: Session;
  preferences: Preferences;
  organizationTemperatureUnit: "F" | "C";
  onBack: () => void;
}) {
  const organizationTemperature =
    organizationTemperatureUnit === "F" ? "Fahrenheit" : "Celsius";
  const [draft, setDraft] = useState<ShellDraft>(() => ({
    ...initialDraft,
    temperature: organizationTemperature,
  }));
  const [dirty, setDirty] = useState(false);
  const update = <K extends keyof ShellDraft>(key: K, value: ShellDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };
  const reset = () => {
    setDraft({ ...initialDraft, temperature: organizationTemperature });
    setDirty(false);
  };

  return (
    <section className="gs-admin" aria-labelledby="global-shell-admin-title" data-review-surface="global-shell" data-review-ready="true">
      <header className="gs-hero">
        <div>
          <span className="p-kicker">ADMIN / EXPERIENCE / GLOBAL SHELL</span>
          <h2 id="global-shell-admin-title">Global Shell configuration</h2>
          <p>
            Preview one organization-wide navigation and command architecture. These
            controls are permission-projected and remain unsaved until an authoritative
            configuration contract is available.
          </p>
        </div>
        <div className="gs-hero-actions">
          <Badge>LOCAL PREVIEW</Badge>
          <Btn variant="outline" onClick={onBack}>Back to Experience</Btn>
        </div>
      </header>

      <div className="gs-status" role="status" aria-live="polite">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          <strong>{session.role} authority verified</strong>
          <small>{dirty ? "Unsaved preview changes on this page" : "Effective shell contract loaded for review"}</small>
        </span>
        <Badge>{preferences.motion === "Off" ? "MOTION OFF" : "REDUCED MOTION OVERRIDES"}</Badge>
      </div>

      <div className="gs-grid">
        <section className="gs-card" aria-labelledby="gs-navigation-title">
          <header><LayoutPanelLeft aria-hidden="true" /><div><h3 id="gs-navigation-title">Navigation</h3><p>One permanent information architecture across every layout.</p></div></header>
          <SettingSelect
            label="Default desktop state"
            detail="Users can still collapse to the icon rail."
            value={draft.navigationDefault}
            options={["Expanded", "Collapsed"]}
            onChange={(value) => update("navigationDefault", value as ShellDraft["navigationDefault"])}
          />
          <PreviewToggle
            label="Pin Home by default"
            detail="Only authorized destinations can be pinned or projected."
            checked={draft.pinnedHome}
            onChange={(value) => update("pinnedHome", value)}
          />
          <div className="gs-locked-row"><span><strong>Order, grouping and labels</strong><small>Uses the approved nine-area task-oriented contract.</small></span><Badge>CONTRACT LOCKED</Badge></div>
          <div className="gs-locked-row"><span><strong>Module exposure</strong><small>Permission composition occurs before menu, search, breadcrumb, pinned or recent rendering.</small></span><Badge>ZERO DISCLOSURE</Badge></div>
        </section>

        <section className="gs-card" aria-labelledby="gs-ai-title">
          <header><Bot aria-hidden="true" /><div><h3 id="gs-ai-title">AI Search</h3><p>Authorized suggestions, predictions and command behavior.</p></div></header>
          <PreviewToggle label="AI-assisted search" detail="Falls back to authorized navigation when AI is unavailable." checked={draft.aiEnabled} onChange={(value) => update("aiEnabled", value)} />
          <PreviewToggle label="Ghost-text predictions" detail="Tab or an explicit action is always required to accept." checked={draft.predictions} onChange={(value) => update("predictions", value)} />
          <PreviewToggle label="Ctrl/Cmd+K shortcut" detail="Opens the same permission-filtered command surface." checked={draft.shortcut} onChange={(value) => update("shortcut", value)} />
          <SettingSelect label="History policy" detail="History never crosses a role or company scope change." value={draft.historyPolicy} options={["Off", "Session only"]} onChange={(value) => update("historyPolicy", value as ShellDraft["historyPolicy"])} />
          <SettingSelect label="AI orb intensity" detail="Reduced Motion converts movement to static state changes." value={draft.orbIntensity} options={["Off", "Subtle", "Balanced", "Enhanced"]} onChange={(value) => update("orbIntensity", value as ShellDraft["orbIntensity"])} />
        </section>

        <section className="gs-card" aria-labelledby="gs-topbar-title">
          <header><Bell aria-hidden="true" /><div><h3 id="gs-topbar-title">Top Bar</h3><p>Compact utilities with independent permission gates.</p></div></header>
          <PreviewToggle label="Help & Support" detail="Shows supported guidance only; missing sources remain unavailable." checked={draft.help} onChange={(value) => update("help", value)} />
          <PreviewToggle label="Notifications" detail="No count or pulse without authoritative freshness." checked={draft.notifications} onChange={(value) => update("notifications", value)} />
          <PreviewToggle label="Current Version" detail="Sensitive source metadata stays restricted." checked={draft.version} onChange={(value) => update("version", value)} />
          <PreviewToggle label="Weather" detail="Remains unavailable until a provider, location policy and freshness contract exist." checked={draft.weather} onChange={(value) => update("weather", value)} />
          <div className="gs-locked-row"><span><strong>Widget order</strong><small>Ask DAENEM remains the primary focus; utility order is contract-defined.</small></span><Badge>SAFE ORDER</Badge></div>
        </section>

        <section className="gs-card" aria-labelledby="gs-weather-title">
          <header><CloudSun aria-hidden="true" /><div><h3 id="gs-weather-title">Weather</h3><p>Truthful provider and freshness behavior.</p></div></header>
          <SettingSelect label="Default temperature unit" detail="Organization default; users may toggle when permitted." value={draft.temperature} options={["Fahrenheit", "Celsius"]} onChange={(value) => update("temperature", value as ShellDraft["temperature"])} />
          <div className="gs-weather-provider" data-weather-provider="google" data-provider-state="configuration-required">
            <div className="gs-provider-heading">
              <span className="gs-provider-icon" aria-hidden="true"><CloudSun /></span>
              <span><strong>Google Weather API</strong><small>Approved primary provider</small></span>
              <Badge>CONFIGURATION REQUIRED</Badge>
            </div>
            <dl className="gs-provider-facts">
              <div><dt>Runtime</dt><dd>Not connected</dd></div>
              <div><dt>Credential</dt><dd>Protected backend vault required</dd></div>
              <div><dt>Freshness</dt><dd>No observation available</dd></div>
              <div><dt>Quota</dt><dd>No authoritative quota data</dd></div>
            </dl>
            <div className="gs-provider-actions" aria-label="Google Weather provider actions">
              <Btn disabled aria-disabled="true" title="Protected backend credential contract required"><KeyRound size={15} />Configure or replace credential</Btn>
              <Btn variant="outline" disabled aria-disabled="true" title="Provider connection-test contract required"><PlugZap size={15} />Test connection</Btn>
            </div>
            <p className="gs-provider-privacy"><ShieldCheck size={15} aria-hidden="true" />API keys are never requested, displayed or stored in frontend source, browser storage or logs.</p>
          </div>
          <div className="gs-locked-row"><span><strong><MapPinned size={15} aria-hidden="true" />Location policy</strong><small>Organization, company/site and user-approved location rules require an authoritative read/write contract.</small></span><Badge>BACKEND REQUIRED</Badge></div>
          <div className="gs-locked-row"><span><strong><RefreshCw size={15} aria-hidden="true" />Refresh policy</strong><small>No polling interval is asserted until provider runtime and quota policy are authoritative.</small></span><Badge>BACKEND REQUIRED</Badge></div>
          <div className="gs-locked-row"><span><strong><Gauge size={15} aria-hidden="true" />Freshness & quota</strong><small>No weather values, location, observation time, freshness or quota state will be fabricated.</small></span><Badge>UNAVAILABLE</Badge></div>
          <Callout tone="neutral" title="Protected weather backend required">
            Credential vault intake, connection testing, Google Weather runtime, scoped location policy, refresh policy, freshness telemetry and quota telemetry must be provided by authoritative backend contracts before these actions can be enabled.
          </Callout>
        </section>

        <section className="gs-card" aria-labelledby="gs-motion-title">
          <header><Sparkles aria-hidden="true" /><div><h3 id="gs-motion-title">Motion & Effects</h3><p>Refined emphasis with accessibility taking precedence.</p></div></header>
          <SettingSelect label="Organization motion level" detail="Reduced Motion always overrides non-essential animation." value={draft.motion} options={["Off", "Subtle", "Balanced", "Enhanced"]} onChange={(value) => update("motion", value as ShellDraft["motion"])} />
          <div className="gs-motion-preview" data-motion={draft.motion.toLowerCase()}><span aria-hidden="true" /><div><strong>Effect hierarchy preview</strong><small>AI Search strongest · controls subtle · alerts temporary · weather contained.</small></div></div>
        </section>

        <section className="gs-card" aria-labelledby="gs-version-title">
          <header><History aria-hidden="true" /><div><h3 id="gs-version-title">Version</h3><p>Authorized release visibility without source disclosure.</p></div></header>
          <PreviewToggle label="Version widget" detail="Shimmer is reserved for a genuinely newer authoritative version." checked={draft.version} onChange={(value) => update("version", value)} />
          <SettingSelect label="Version history visibility" detail="Every entry remains permission-projected." value={draft.versionHistory} options={["Administrators", "Authorized roles"]} onChange={(value) => update("versionHistory", value as ShellDraft["versionHistory"])} />
          <PreviewToggle label="Release-note visibility" detail="Shows detailed changes only where authoritative metadata exists." checked={draft.releaseNotes} onChange={(value) => update("releaseNotes", value)} />
        </section>
      </div>

      <Callout tone="neutral" title="Configuration persistence required">
        Organization-scoped Global Shell read/write, validation, versioning, audit and rollback contracts are not yet authoritative. This page intentionally supports local review only and sends no mutation.
      </Callout>
      <footer className="gs-footer">
        <span><Compass size={16} aria-hidden="true" /> Preview changes are not saved or applied to another session.</span>
        <div>
          <Btn variant="outline" onClick={reset} disabled={!dirty}><RotateCcw size={15} />Reset local preview</Btn>
          <Btn disabled aria-disabled="true" title="Authoritative persistence contract required"><Save size={15} />Apply organization settings</Btn>
        </div>
      </footer>
    </section>
  );
}
