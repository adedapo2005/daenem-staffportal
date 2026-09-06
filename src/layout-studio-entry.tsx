import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, History, LayoutDashboard, RotateCcw, Save, Settings2, Smartphone, Tablet, Monitor, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { api, type WorkforceContext } from './auth';
import { CANONICAL_ERP_IDS, type ErpId } from './module-hub';
import {
  DEFAULT_LAYOUT_ID, LAYOUT_IDS, LAYOUT_PROFILES, normalizeDensity, normalizeLayoutId, normalizeMotion,
  type LayoutDensity, type LayoutId, type LayoutPolicy, type LayoutPreference, type MotionPreset,
} from './layout-system';
import './layout-studio.css';

type ExperienceHistoryEntry = {
  id: string;
  layoutId?: LayoutId;
  scope: string;
  target?: string;
  before?: unknown;
  after?: unknown;
  actorId?: string;
  reason?: string;
  restorable?: boolean;
  createdAt: string;
};
type LayoutPayload = {
  preference: LayoutPreference;
  policy?: LayoutPolicy;
  canManage: boolean;
  canChoose: boolean;
  canAccess?: boolean;
  ability?: { managePolicy?: boolean; viewHistory?: boolean };
  history?: ExperienceHistoryEntry[];
};

const fallbackPayload = (): LayoutPayload => ({
  preference: { layoutId: DEFAULT_LAYOUT_ID, density: 'standard', motion: 'balanced' },
  policy: { organizationDefault: DEFAULT_LAYOUT_ID, forcedLayout: null, allowPersonalPreference: true, roleDefaults: {}, erpDefaults: {} },
  canManage: false,
  canChoose: true,
  history: [],
});

function labelFor(id: LayoutId) { return LAYOUT_PROFILES[id].name; }

function emitLayout(detail: { layoutId: LayoutId; density: LayoutDensity; motion: MotionPreset; preview?: boolean }) {
  window.dispatchEvent(new CustomEvent(detail.preview ? 'daenem:layout-preview' : 'daenem:layout-change', { detail }));
}

function LayoutPreviewVisual({ profile, large = false }: { profile: LayoutId; large?: boolean }) {
  const definition = LAYOUT_PROFILES[profile];
  const topNavigation = definition.navigationMode === 'top-command';
  const inspector = definition.contextualPanelMode !== 'right drawer only when invoked';
  return <div className={(large ? 'layout-preview-large ' : 'layout-preview ') + 'preview-' + profile} data-preview-navigation={definition.navigationMode} data-preview-shell={definition.shellMode} data-preview-detail={definition.detailMode} data-preview-renderer={definition.structure.rendererId} data-preview-content-mode={definition.structure.contentMode} data-preview-mobile-transform={definition.structure.mobileTransform} data-preview-motion-personality={definition.structure.motionPersonality}>
    {topNavigation
      ? <nav className="layout-preview-top-nav"><i /><i /><i /><b /></nav>
      : <aside className="layout-preview-side-nav"><i /><i /><i /><i /><i /></aside>}
    <main className="layout-preview-main"><div className="preview-command" /><div className="preview-work"><span /><span /><span /></div><div className="preview-table"><i /><i /><i /><i /><i /></div></main>
    {inspector && <section className="preview-inspector"><span /><span /><span /></section>}
    <div className="layout-preview-mobile-flow"><i /><i /><i /></div>
  </div>;
}

function Gallery({ payload, context, onRefresh }: { payload: LayoutPayload; context: WorkforceContext; onRefresh: () => Promise<void> }) {
  const current = payload.preference.layoutId;
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  function startPreview(id: LayoutId) {
    const next = { layoutId: id, density: payload.preference.density, motion: payload.preference.motion };
    emitLayout({ ...next, preview: true });
    window.dispatchEvent(new Event('daenem:close-layout-studio'));
  }
  async function apply(id: LayoutId) {
    if (!payload.canChoose) return;
    setBusy(id);
    try {
      const next = { layoutId: id, density: payload.preference.density, motion: payload.preference.motion };
      await api('/api/experience/layout/preference', { method: 'POST', body: JSON.stringify(next) });
      emitLayout(next);
      setMessage(labelFor(id) + ' applied to your workspace.');
      await onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Layout could not be applied.'); }
    finally { setBusy(''); }
  }
  return <section className="layout-studio-panel">
    <header className="layout-studio-header"><div><span className="eyebrow">ADMIN CENTER · EXPERIENCE</span><h2>Layout Studio</h2><p>Choose how the authenticated workspace is composed. Theme remains an independent visual layer; layout changes navigation, regions and information flow.</p></div><div className="layout-studio-header-mark"><LayoutDashboard size={26} /><span>{payload.canChoose ? 'Personal choice enabled' : 'Policy controlled'}</span></div></header>
    <div className="layout-studio-tabs"><button className="active" type="button"><LayoutDashboard size={15} /> Gallery</button><button type="button" onClick={() => document.getElementById('layout-studio-settings')?.scrollIntoView({ behavior: 'smooth' })}><Settings2 size={15} /> Experience settings</button><button type="button" onClick={() => document.getElementById('layout-studio-history')?.scrollIntoView({ behavior: 'smooth' })}><History size={15} /> History</button></div>
    {message && <div className="inline-message">{message}</div>}
    <div className="layout-gallery">{LAYOUT_IDS.map((id) => { const definition = LAYOUT_PROFILES[id]; const selected = current === id; return <article className={'layout-gallery-card' + (selected ? ' current' : '')} data-layout-id={id} key={id}>
      <LayoutPreviewVisual profile={id} />
      <div><div className="layout-card-title"><h3>{definition.name}</h3>{selected && <span className="layout-badge">Current</span>}</div><p>{definition.description}</p><div className="layout-gallery-meta"><span>{definition.navigationMode.replaceAll('-', ' ')}</span><span>{definition.defaultDensity}</span><span><Monitor size={12} /> <Tablet size={12} /> <Smartphone size={12} /></span></div><small>Best for {definition.idealFor.join(' · ')}</small><div className="layout-gallery-actions"><button type="button" className="secondary-button" onClick={() => startPreview(id)}><Eye size={14} /> Preview</button><button type="button" className="primary-button" disabled={!payload.canChoose || selected || busy === id} onClick={() => void apply(id)}>{busy === id ? 'Applying…' : selected ? <><Check size={14} /> Applied</> : <><Save size={14} /> Apply to me</>}</button></div></div>
    </article>; })}</div>
    <SettingsPanel payload={payload} onRefresh={onRefresh} onMessage={setMessage} />
    {payload.canManage && payload.policy && <PolicyPanel payload={payload} context={context} onRefresh={onRefresh} onMessage={setMessage} />}
    <HistoryPanel payload={payload} onRefresh={onRefresh} onMessage={setMessage} />
  </section>;
}

function SettingsPanel({ payload, onRefresh, onMessage }: { payload: LayoutPayload; onRefresh: () => Promise<void>; onMessage: (value: string) => void }) {
  const [density, setDensity] = useState(payload.preference.density);
  const [motion, setMotion] = useState(payload.preference.motion);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const next = { layoutId: payload.preference.layoutId, density, motion };
      await api('/api/experience/layout/preference', { method: 'POST', body: JSON.stringify(next) });
      emitLayout(next);
      onMessage('Density and motion preferences saved.');
      await onRefresh();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Experience settings could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section id="layout-studio-settings" className="layout-policy-card"><div><span className="eyebrow">MY EXPERIENCE</span><h3>Density & motion</h3><p>Adjust table, panel and navigation rhythm without changing touch-target accessibility.</p></div><div className="layout-policy-row"><label>Density<select value={density} onChange={(event) => setDensity(normalizeDensity(event.target.value))}><option value="comfortable">Comfortable</option><option value="standard">Standard</option><option value="compact">Compact</option></select></label><label>Motion<select value={motion} onChange={(event) => setMotion(normalizeMotion(event.target.value))}><option value="off">Off</option><option value="calm">Calm</option><option value="balanced">Balanced</option><option value="expressive">Expressive</option></select></label></div><button type="button" className="primary-button" disabled={!payload.canChoose || busy} onClick={() => void save()}><Save size={14} /> Save experience</button></section>;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function PolicyPanel({ payload, context, onRefresh, onMessage }: { payload: LayoutPayload; context: WorkforceContext; onRefresh: () => Promise<void>; onMessage: (value: string) => void }) {
  const policy = payload.policy;
  if (!policy) return null;
  const [organizationDefault, setOrganizationDefault] = useState(policy.organizationDefault);
  const [forcedLayout, setForcedLayout] = useState(policy.forcedLayout || '');
  const [allowPersonalPreference, setAllowPersonalPreference] = useState(policy.allowPersonalPreference);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, LayoutId>>(policy.roleDefaults);
  const [erpDefaults, setErpDefaults] = useState<Record<string, LayoutId>>(policy.erpDefaults);
  const [roleOptions, setRoleOptions] = useState<string[]>(() => unique([...Object.keys(policy.roleDefaults), ...context.roles.map((role) => role.code)]));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const companyId = context.companies[0]?.id;
    const query = companyId ? '?companyId=' + encodeURIComponent(companyId) : '';
    void api<{ roles?: Array<{ code?: string; id?: string; name?: string }> }>('/api/admin/roles' + query)
      .then((result) => setRoleOptions((current) => unique([...current, ...(result.roles || []).map((role) => role.code || role.id || role.name || '')])))
      .catch(() => undefined);
  }, [context.companies]);
  function setRoleDefault(role: string, value: string) {
    setRoleDefaults((current) => {
      const next = { ...current };
      if (value) next[role] = normalizeLayoutId(value);
      else delete next[role];
      return next;
    });
  }
  function setErpDefault(erp: string, value: string) {
    setErpDefaults((current) => {
      const next = { ...current };
      if (value) next[erp] = normalizeLayoutId(value);
      else delete next[erp];
      return next;
    });
  }
  async function save() {
    setBusy(true);
    try {
      await api('/api/experience/layout/policy', { method: 'POST', body: JSON.stringify({ organizationDefault, forcedLayout: forcedLayout || null, allowPersonalPreference, roleDefaults, erpDefaults }) });
      onMessage('Organization, role and ERP layout policy saved and audited.');
      await onRefresh();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Layout policy could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="layout-policy-card layout-policy-panel"><div><span className="eyebrow">OWNER / ADMIN POLICY</span><h3>Defaults & precedence</h3><p>Set organization, role and ERP defaults. A forced layout wins; otherwise permitted personal choice wins before role and ERP defaults.</p></div><div className="layout-policy-row"><label>Organization default<select value={organizationDefault} onChange={(event) => setOrganizationDefault(normalizeLayoutId(event.target.value))}>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label><label>Forced layout<select value={forcedLayout} onChange={(event) => setForcedLayout(event.target.value)}><option value="">No forced layout</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label></div><label className="layout-policy-toggle"><input type="checkbox" checked={allowPersonalPreference} onChange={(event) => setAllowPersonalPreference(event.target.checked)} /><span>Allow permitted employees to choose a personal layout</span></label><div className="layout-policy-subgrid"><div><strong>Role defaults</strong><small className="policy-helper">Roles come from access-control data and existing policy keys.</small>{roleOptions.map((role) => <label key={role}>{role.replaceAll('_', ' ')}<select value={roleDefaults[role] || ''} onChange={(event) => setRoleDefault(role, event.target.value)}><option value="">Use organization/ERP default</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label>)}</div><div><strong>ERP defaults</strong><small className="policy-helper">Canonical ERP registry</small>{CANONICAL_ERP_IDS.map((erp) => <label key={erp}>{erp.toUpperCase()}<select value={erpDefaults[erp] || ''} onChange={(event) => setErpDefault(erp, event.target.value)}><option value="">Use organization default</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label>)}</div></div><button type="button" className="primary-button" disabled={busy || !payload.canManage} onClick={() => void save()}><Save size={14} /> Save policy</button></section>;
}

function HistoryPanel({ payload, onRefresh, onMessage }: { payload: LayoutPayload; onRefresh: () => Promise<void>; onMessage: (value: string) => void }) {
  const history = payload.history || [];
  const [busy, setBusy] = useState(false);
  async function rollback(id: string) {
    setBusy(true);
    try { await api('/api/experience/layout/rollback', { method: 'POST', body: JSON.stringify({ historyId: id }) }); onMessage('The selected experience version was restored.'); await onRefresh(); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Rollback is unavailable.'); }
    finally { setBusy(false); }
  }
  return <section id="layout-studio-history" className="layout-history-card"><div><span className="eyebrow">AUDITED HISTORY</span><h3>Rollback & history</h3><p>Applied experience changes remain reversible and are recorded separately from theme changes.</p></div>{history.length ? <div className="layout-history-list">{history.map((item) => <div className="layout-history-item" key={item.id}><span><strong>{item.layoutId ? labelFor(item.layoutId) : 'Experience change'}</strong><small>{item.scope}{item.target ? ' · ' + item.target : ''} · {new Date(item.createdAt).toLocaleString()}</small></span>{item.restorable ? <button type="button" className="text-action" disabled={busy} onClick={() => void rollback(item.id)}><RotateCcw size={14} /> Restore</button> : <span className="history-readonly">Read-only legacy record</span>}</div>)}</div> : <div className="layout-studio-empty">No prior layout changes are recorded for this workspace.</div>}</section>;
}

export function LayoutStudio({ context, erpId = 'staff' }: { context: WorkforceContext; erpId?: ErpId }) {
  const [payload, setPayload] = useState<LayoutPayload>(() => fallbackPayload());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const query = useMemo(() => context.companies[0]?.id ? '?erpId=' + encodeURIComponent(erpId) + '&companyId=' + encodeURIComponent(context.companies[0].id) : '?erpId=' + encodeURIComponent(erpId), [context.companies, erpId]);
  async function refresh() {
    setLoading(true);
    try { const result = await api<LayoutPayload>('/api/experience/layout' + query); setPayload(result); emitLayout(result.preference); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Layout Studio could not load.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [query]);
  if (loading) return <div className="layout-studio-panel"><div className="skeleton-block" /><div className="skeleton-block" /></div>;
  return <Gallery payload={payload} context={context} onRefresh={refresh} />;
}

function LayoutStudioHost() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);
  const [erpId, setErpId] = useState<ErpId>('staff');
  useEffect(() => {
    const openStudio = (event: Event) => {
      const detail = (event as CustomEvent<{ experience?: { erpId?: string }; erpId?: string }>).detail;
      const requested = detail?.experience?.erpId || detail?.erpId;
      setErpId(CANONICAL_ERP_IDS.includes(requested as ErpId) ? requested as ErpId : 'staff');
      setOpen(true);
    };
    window.addEventListener('daenem:open-layout-studio', openStudio);
    const closeStudio = () => setOpen(false);
    window.addEventListener('daenem:close-layout-studio', closeStudio);
    return () => { window.removeEventListener('daenem:open-layout-studio', openStudio); window.removeEventListener('daenem:close-layout-studio', closeStudio); };
  }, []);
  useEffect(() => {
    void api<{ context?: WorkforceContext }>('/api/auth/me').then((result) => setContext(result.context || null)).catch(() => setContext(null));
  }, []);
  if (!open || !context) return null;
  return <div className="layout-studio-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="layout-studio-modal" onClick={(event) => event.stopPropagation()}><button className="layout-studio-close" type="button" onClick={() => setOpen(false)} aria-label="Close Layout Studio"><X size={18} /></button><LayoutStudio context={context} erpId={erpId} /></div></div>;
}

const host = document.createElement('div');
host.id = 'daenem-layout-studio-root';
document.body.appendChild(host);
createRoot(host).render(<LayoutStudioHost />);
