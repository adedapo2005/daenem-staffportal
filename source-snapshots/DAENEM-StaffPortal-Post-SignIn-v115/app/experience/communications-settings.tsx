"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Badge, Btn, Callout, Metric, Panel } from "./ui";
import { sessionScopeKey, type Session } from "./model";
import {
  apiErrorMessage,
  SCOPED_SETTING_DEFINITIONS,
  isScopedSettingsResponse,
  staffPortalApi,
  type RecoveryMethodPolicy,
  type ScopedCompany,
  type ScopedSettingKey,
  type ScopedSettingValue,
  type ScopedSettingsResponse,
} from "./staffportal-api";
import { governedCompanySelection } from "./communications-selection";
import "./communications-settings.css";

const POLICY_LABELS: Record<RecoveryMethodPolicy, string> = {
  email: "Email only",
  whatsapp: "WhatsApp only",
  email_whatsapp: "Email + WhatsApp",
};

function displayValue(key: ScopedSettingKey, value: ScopedSettingValue | undefined) {
  if (value === undefined) return "Not returned";
  if (key === "security.password_recovery_methods") return POLICY_LABELS[value as RecoveryMethodPolicy] || "Not returned";
  if (typeof value === "boolean") return value ? "Eligible" : "Not eligible";
  return value.toLocaleString("en-US");
}

function companyColor(company: ScopedCompany) {
  const colors = ["#377ce6", "#bf6d31", "#7968c6", "#2c8b85", "#7c8c43"];
  const index = [...company.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

function companyMark(company: ScopedCompany) {
  return (company.code || company.name).replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "DA";
}

export default function CommunicationsSettings({ session }: { session: Session }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<ScopedSettingKey>("security.password_recovery_methods");
  const [config, setConfig] = useState<ScopedSettingsResponse | null>(null);
  const [draftValue, setDraftValue] = useState<ScopedSettingValue | undefined>(undefined);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"neutral" | "green" | "red">("neutral");
  const requestRef = useRef(0);
  const writeControllerRef = useRef<AbortController | null>(null);
  const scopeKey = sessionScopeKey(session);

  const activeDefinition = SCOPED_SETTING_DEFINITIONS.find((definition) => definition.key === activeKey)!;
  const projectedCompanies = useMemo(() => config?.companies || [], [config]);
  const filteredCompanies = useMemo(
    () => projectedCompanies.filter((company) => company.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projectedCompanies, query],
  );
  const allVisibleSelected = filteredCompanies.length > 0 && filteredCompanies.every((company) => selected.includes(company.id));
  const selectedForKey = projectedCompanies.filter((company) => selected.includes(company.id) && company.source === "company");
  const canApplySelected = Boolean(config?.canManage && selected.length && selected.every((id) => config?.canManageCompanyIds?.includes(id)));

  const loadSetting = useCallback(async (key: ScopedSettingKey, signal?: AbortSignal) => {
    const requestId = ++requestRef.current;
    setLoadState("loading");
    setConfig(null);
    setDraftValue(undefined);
    setFeedback("");
    try {
      const next = await staffPortalApi<ScopedSettingsResponse>(
        `/api/admin/scoped-settings?settingKey=${encodeURIComponent(key)}`,
        { headers: { Accept: "application/json" }, signal },
      );
      if (!isScopedSettingsResponse(next)) throw new Error("The Staff Portal API returned an invalid scoped settings response.");
      if (requestId !== requestRef.current || signal?.aborted) return;
      setConfig(next);
      setDraftValue(next.global.value);
      setSelected((current) =>
        governedCompanySelection(
          current,
          next.companies,
          next.canManageCompanyIds,
          session.company,
        ),
      );
      setLoadState("ready");
    } catch (error) {
      if (requestId !== requestRef.current || signal?.aborted) return;
      setConfig(null);
      setSelected([]);
      setLoadState("unavailable");
      setFeedbackTone("neutral");
      setFeedback(apiErrorMessage(error));
    }
  }, [session.company]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    writeControllerRef.current?.abort();
    queueMicrotask(() => {
      if (!current) return;
      setSelected([]);
      setQuery("");
      setSaving(false);
      void loadSetting(activeKey, controller.signal);
    });
    return () => {
      current = false;
      controller.abort();
      writeControllerRef.current?.abort();
      requestRef.current += 1;
    };
  }, [activeKey, loadSetting, scopeKey]);

  function toggleCompany(companyId: string) {
    setSelected((current) => current.includes(companyId) ? current.filter((item) => item !== companyId) : [...current, companyId]);
  }

  function toggleVisible() {
    setSelected((current) => allVisibleSelected
      ? current.filter((id) => !filteredCompanies.some((company) => company.id === id))
      : [...new Set([...current, ...filteredCompanies.map((company) => company.id)])]);
  }

  async function writeSetting(body: Record<string, unknown>, successMessage: string) {
    if (saving || !config) return false;
    const controller = new AbortController();
    writeControllerRef.current?.abort();
    writeControllerRef.current = controller;
    setSaving(true);
    setFeedback("");
    try {
      const next = await staffPortalApi<ScopedSettingsResponse>("/api/admin/scoped-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ settingKey: activeKey, value: draftValue, ...body }),
        signal: controller.signal,
      });
      if (!isScopedSettingsResponse(next)) throw new Error("The Staff Portal API returned an invalid scoped settings response.");
      if (controller.signal.aborted) return false;
      setConfig(next);
      setDraftValue(next.global.value);
      setSelected((current) =>
        governedCompanySelection(
          current,
          next.companies,
          next.canManageCompanyIds,
          session.company,
        ),
      );
      setLoadState("ready");
      setFeedbackTone("green");
      setFeedback(successMessage);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      setFeedbackTone("red");
      setFeedback(apiErrorMessage(error));
      return false;
    } finally {
      if (writeControllerRef.current === controller) {
        writeControllerRef.current = null;
        if (!controller.signal.aborted) setSaving(false);
      }
    }
  }

  async function saveGlobal() {
    if (!config?.canSetGlobal) {
      setFeedbackTone("neutral");
      setFeedback("Your authenticated Staff Portal role cannot change the global policy default.");
      return;
    }
    await writeSetting({ scope: "global" }, `${activeDefinition.label} global default saved by the backend policy service.`);
  }

  async function applyToSelected() {
    if (!config?.canManage || !selected.length) {
      setFeedbackTone("neutral");
      setFeedback("Select only company scopes returned with your authenticated manage permission.");
      return;
    }
    await writeSetting({ scope: "companies", companyIds: selected }, `${activeDefinition.label} applied to ${selected.length} authorized compan${selected.length === 1 ? "y" : "ies"}.`);
  }

  async function restoreInherited() {
    if (!config?.canManage || !selected.length) {
      setFeedbackTone("neutral");
      setFeedback("Select only company scopes returned with your authenticated manage permission.");
      return;
    }
    await writeSetting({ scope: "companies", companyIds: selected, inherit: true }, `Inheritance restored for ${selected.length} authorized compan${selected.length === 1 ? "y" : "ies"}.`);
  }

  return (
    <div
      className="v43-communications-settings"
      data-review-surface="communications-control"
      data-review-ready="true"
      data-provider-state="release-gated"
      data-authority="owner-only"
      data-scope-surface="communications-governance"
      data-backend-contract="scoped-settings-v44"
      data-actor-role={session.role}
      data-load-state={loadState}
      aria-busy={loadState === "loading"}
    >
      <section className="v43-settings-hero">
        <div>
          <span className="p-kicker">COMMUNICATIONS · SCOPED CONTROL</span>
          <h2>One policy surface. Every authorized scope.</h2>
          <p>Configure recovery and governed communication eligibility from the Staff Portal policy service. The server resolves permissions, inheritance, audit and safety gates before this surface renders a company value.</p>
        </div>
        <div className="v43-settings-hero-mark" aria-hidden="true"><SlidersHorizontal size={26} /><span>Policy</span></div>
      </section>

      <div className="v43-settings-state" role="status" aria-live="polite">
        <span className={loadState === "ready" ? "v43-state-dot ready" : "v43-state-dot"} />
        <strong>{loadState === "ready" ? "Authoritative policy scope loaded" : loadState === "loading" ? "Loading authoritative policy scope…" : "Policy service unavailable"}</strong>
        <span>{loadState === "unavailable" ? "No preview value is being used." : "Server projection · canonical setting key · audit on save"}</span>
        {loadState === "unavailable" && <Btn variant="quiet" onClick={() => void loadSetting(activeKey)}><RefreshCw size={14} />Retry</Btn>}
      </div>

      <div className="v43-safety-grid">
        <Panel title="Emergency communications kill switch" kicker="GLOBAL SAFETY CONTROL">
          <div className="v43-safety-control" data-safety-boundary="emergency-communications" data-control-state="backend-controlled"><span className="v43-safety-icon danger"><LockKeyhole size={17} /></span><div><strong>Backend-controlled · not changed here</strong><small>Company-scoped settings cannot open or override the global emergency state.</small></div><Badge tone="neutral">Guarded</Badge></div>
        </Panel>
        <Panel title="Live WhatsApp provider release gate" kicker="GLOBAL SAFETY CONTROL">
          <div className="v43-safety-control" data-safety-boundary="whatsapp-provider-release" data-control-state="release-closed"><span className="v43-safety-icon"><ShieldCheck size={17} /></span><div><strong>Separate release control</strong><small>Eligibility does not release live provider sending or change Meta credentials.</small></div><Badge tone="neutral">Separate</Badge></div>
        </Panel>
      </div>

      <div className="v43-settings-grid">
        <Panel title="Authorized company scope" kicker="SERVER PROJECTION">
          <div className="v43-scope-explainer"><Globe2 size={18} /><p>Only companies returned by the authenticated backend projection are listed. An absent company is not a disabled option; it is not rendered.</p></div>
          <label className="v43-search"><Search size={16} /><span className="sr-only">Search authorized companies</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search returned company scopes" disabled={!config} /></label>
          <label className="v43-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Select all visible authorized companies" disabled={!config || !filteredCompanies.length} /><span>Select All</span><strong>{selected.length} selected</strong></label>
          <div className="v43-company-list" role="list" aria-label="Authorized company scopes">
            {filteredCompanies.map((company) => <label className={`v43-company-row ${selected.includes(company.id) ? "selected" : ""}`} key={company.id}>
              <input type="checkbox" checked={selected.includes(company.id)} onChange={() => toggleCompany(company.id)} aria-label={`Select ${company.name}`} />
              <span className="v43-company-symbol" style={{ background: companyColor(company) }}>{companyMark(company)}</span>
              <span className="v43-company-copy"><strong>{company.name}</strong><small>{displayValue(activeKey, company.value)}</small></span>
              <Badge tone={company.source === "company" ? "blue" : "neutral"}>{company.source === "company" ? "Individually Configured" : "Inherited"}</Badge>
              <ChevronDown size={15} aria-hidden="true" />
            </label>)}
            {loadState === "loading" && <p className="v43-empty-scope">Waiting for the authorized company projection…</p>}
            {loadState === "ready" && !filteredCompanies.length && <p className="v43-empty-scope">No authorized company scope matches that search.</p>}
          </div>
          <p className="v43-scope-summary"><strong>Scope summary</strong> {selected.length ? `${selected.length} authorized compan${selected.length === 1 ? "y" : "ies"} selected for ${activeDefinition.label}.` : "The server-resolved global default is shown until a company scope is selected."}</p>
        </Panel>

        <div className="v43-settings-rail">
          <Panel title="Global default" kicker="INHERITANCE ROOT">
            <label className="p-field">Setting
              <select className="v43-native-select" value={activeKey} onChange={(event) => setActiveKey(event.target.value as ScopedSettingKey)} aria-label="Scoped setting to configure">
                {SCOPED_SETTING_DEFINITIONS.map((definition) => <option value={definition.key} key={definition.key}>{definition.label}</option>)}
              </select>
            </label>
            <p className="p-secondary">{activeDefinition.description}</p>
            <div className="v43-effective-value"><span>Current global value</span><strong>{displayValue(activeKey, config?.global.value)}</strong></div>
            {activeDefinition.kind === "choice" && <select className="v43-native-select" value={typeof draftValue === "string" ? draftValue : ""} onChange={(event) => setDraftValue(event.target.value as RecoveryMethodPolicy)} aria-label={`${activeDefinition.label} global value`} disabled={!config}><option value="email">Email only</option><option value="whatsapp">WhatsApp only</option><option value="email_whatsapp">Email + WhatsApp</option></select>}
            {activeDefinition.kind === "boolean" && <label className="v43-toggle"><input type="checkbox" checked={draftValue === true} onChange={(event) => setDraftValue(event.target.checked)} disabled={!config} /><span><strong>{draftValue === true ? "Eligible" : "Not eligible"}</strong><small>Backend policy still checks enrollment, permissions and global release gates.</small></span></label>}
            {activeDefinition.kind === "number" && <label className="p-field">Value<input type="number" min="0" step="1" value={typeof draftValue === "number" ? draftValue : ""} onChange={(event) => setDraftValue(Math.max(0, Number(event.target.value) || 0))} aria-label={`${activeDefinition.label} global value`} disabled={!config} /></label>}
            <div className="v43-action-stack" data-mutation-state={loadState === "ready" ? "permission-composed" : "closed-until-authoritative"}><Btn onClick={() => void saveGlobal()} disabled={saving || !config?.canSetGlobal}>{saving ? "Saving…" : "Save as Global Default"}<Check size={15} /></Btn><Btn variant="outline" onClick={() => void applyToSelected()} disabled={saving || !canApplySelected}>Apply to Selected</Btn><Btn variant="quiet" onClick={() => void restoreInherited()} disabled={saving || !canApplySelected}>Use Inherited Value</Btn></div>
            {selectedForKey.length > 0 && <p className="v43-selection-note">{selectedForKey.length} selected scope{selectedForKey.length === 1 ? " is" : "s are"} individually configured for this setting.</p>}
          </Panel>
          <Panel title="Effective scope states" kicker="SERVER-RESOLVED">
            <div className="v43-state-list"><div><span className="v43-state-icon global"><Globe2 size={15} /></span><span><strong>Global</strong><small>Applies when no override exists</small></span><Badge>Default</Badge></div><div><span className="v43-state-icon inherited"><RefreshCw size={15} /></span><span><strong>Inherited</strong><small>Company follows the global value</small></span><Badge tone="neutral">Inherited</Badge></div><div><span className="v43-state-icon configured"><SlidersHorizontal size={15} /></span><span><strong>Individually Configured</strong><small>Explicit company override</small></span><Badge tone="blue">Override</Badge></div></div>
          </Panel>
          {feedback && <Callout tone={feedbackTone} title={loadState === "ready" ? "Policy update" : "Policy service status"}>{feedback}</Callout>}
          <Metric label="Authorized companies" value={config ? String(projectedCompanies.length) : "—"} detail="Server-projected scope · no hidden destinations" />
        </div>
      </div>
      <Callout tone="neutral" title="Safety boundary">Company overrides configure eligibility only. They cannot open the emergency kill switch, release live WhatsApp sending, bypass RBAC, or reveal whether an account exists.</Callout>
    </div>
  );
}
