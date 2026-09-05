import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, History, LayoutDashboard, RotateCcw, Save, Settings2, Smartphone, Tablet, Monitor, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { api, type WorkforceContext } from './auth';
import {
  DEFAULT_LAYOUT_ID, LAYOUT_IDS, LAYOUT_PROFILES, normalizeDensity, normalizeLayoutId, normalizeMotion,
  type LayoutDensity, type LayoutId, type LayoutPolicy, type LayoutPreference, type MotionPreset,
} from './layout-system';
import './layout-studio.css';

type LayoutPayload = {
  preference: LayoutPreference;
  policy: LayoutPolicy;
  canManage: boolean;
  canChoose: boolean;
  history: Array<{ id: string; layoutId: LayoutId; scope: string; createdAt: string }>;
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

function PreviewWindow({ profile, onClose }: { profile: LayoutId; onClose: () => void }) {
  const definition = LAYOUT_PROFILES[profile];
  return <div className="layout-preview-modal" role="dialog" aria-modal="true" aria-labelledby="layout-preview-title">
    <div className="layout-preview-dialog">
      <header><div><span className="eyebrow">NON-DESTRUCTIVE PREVIEW</span><h3 id="layout-preview-title">{definition.name}</h3></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close preview"><X size={18} /></button></header>
      <div className={'layout-preview-large preview-' + profile}>
        <aside><span /><span /><span /><span /></aside>
        <main><div className="preview-command" /><div className="preview-work"><span /><span /><span /></div><div className="preview-table"><i /><i /><i /><i /><i /></div></main>
        {definition.contextualPanelMode !== 'right drawer only when invoked' && <section className="preview-inspector"><span /><span /><span /></section>}
      </div>
      <p>{definition.description}</p><div className="layout-preview-meta"><span>Desktop</span><span>Tablet reflow</span><span>Mobile ordered flow</span></div>
    </div>
  </div>;
}

function Gallery({ payload, onRefresh }: { payload: LayoutPayload; onRefresh: () => Promise<void> }) {
  const current = payload.preference.layoutId;
  const [preview, setPreview] = useState<LayoutId | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
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
    {preview && <PreviewWindow profile={preview} onClose={() => setPreview(null)} />}
    <header className="layout-studio-header"><div><span className="eyebrow">ADMIN CENTER · EXPERIENCE</span><h2>Layout Studio</h2><p>Choose how the authenticated workspace is composed. Theme remains an independent visual layer; layout changes navigation, regions and information flow.</p></div><div className="layout-studio-header-mark"><LayoutDashboard size={26} /><span>{payload.canChoose ? 'Personal choice enabled' : 'Policy controlled'}</span></div></header>
    <div className="layout-studio-tabs"><button className="active" type="button"><LayoutDashboard size={15} /> Gallery</button><button type="button" onClick={() => document.getElementById('layout-studio-settings')?.scrollIntoView({ behavior: 'smooth' })}><Settings2 size={15} /> Experience settings</button><button type="button" onClick={() => document.getElementById('layout-studio-history')?.scrollIntoView({ behavior: 'smooth' })}><History size={15} /> History</button></div>
    {message && <div className="inline-message">{message}</div>}
    <div className="layout-gallery">{LAYOUT_IDS.map((id) => { const definition = LAYOUT_PROFILES[id]; const selected = current === id; return <article className={'layout-gallery-card' + (selected ? ' current' : '')} key={id}>
      <div className={'layout-preview preview-' + id}><span className="layout-preview-rail" /><span className="layout-preview-body"><i /><i /><i /></span></div>
      <div><div className="layout-card-title"><h3>{definition.name}</h3>{selected && <span className="layout-badge">Current</span>}</div><p>{definition.description}</p><div className="layout-gallery-meta"><span>{definition.navigationMode.replaceAll('-', ' ')}</span><span>{definition.defaultDensity}</span><span><Monitor size={12} /> <Tablet size={12} /> <Smartphone size={12} /></span></div><small>Best for {definition.idealFor.join(' · ')}</small><div className="layout-gallery-actions"><button type="button" className="secondary-button" onClick={() => setPreview(id)}><Eye size={14} /> Preview</button><button type="button" className="primary-button" disabled={!payload.canChoose || selected || busy === id} onClick={() => void apply(id)}>{busy === id ? 'Applying…' : selected ? <><Check size={14} /> Applied</> : <><Save size={14} /> Apply to me</>}</button></div></div>
    </article>; })}</div>
    <SettingsPanel payload={payload} onRefresh={onRefresh} onMessage={setMessage} />
    {payload.canManage && <PolicyPanel payload={payload} onRefresh={onRefresh} onMessage={setMessage} />}
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

const ERP_SCOPE_OPTIONS = ['staff', 'printing', 'bakery', 'autos', 'logistics', 'properties', 'finance', 'controls'];
const ROLE_SCOPE_OPTIONS = ['employee', 'manager', 'group_admin'];

function PolicyPanel({ payload, onRefresh, onMessage }: { payload: LayoutPayload; onRefresh: () => Promise<void>; onMessage: (value: string) => void }) {
  const [organizationDefault, setOrganizationDefault] = useState(payload.policy.organizationDefault);
  const [forcedLayout, setForcedLayout] = useState(payload.policy.forcedLayout || '');
  const [allowPersonalPreference, setAllowPersonalPreference] = useState(payload.policy.allowPersonalPreference);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, LayoutId>>(payload.policy.roleDefaults);
  const [erpDefaults, setErpDefaults] = useState<Record<string, LayoutId>>(payload.policy.erpDefaults);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api('/api/experience/layout/policy', { method: 'POST', body: JSON.stringify({ organizationDefault, forcedLayout: forcedLayout || null, allowPersonalPreference, roleDefaults, erpDefaults }) });
      onMessage('Organization, role and ERP layout policy saved and audited.');
      await onRefresh();
    } catch (error) { onMessage(error instanceof Error ? error.message : 'Layout policy could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className="layout-policy-card layout-policy-panel"><div><span className="eyebrow">OWNER / ADMIN POLICY</span><h3>Defaults & precedence</h3><p>Set organization, role and ERP defaults. A forced layout wins; otherwise permitted personal choice wins before role and ERP defaults.</p></div><div className="layout-policy-row"><label>Organization default<select value={organizationDefault} onChange={(event) => setOrganizationDefault(normalizeLayoutId(event.target.value))}>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label><label>Forced layout<select value={forcedLayout} onChange={(event) => setForcedLayout(event.target.value)}><option value="">No forced layout</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label></div><label className="layout-policy-toggle"><input type="checkbox" checked={allowPersonalPreference} onChange={(event) => setAllowPersonalPreference(event.target.checked)} /><span>Allow permitted employees to choose a personal layout</span></label><div className="layout-policy-subgrid"><div><strong>Role defaults</strong>{ROLE_SCOPE_OPTIONS.map((role) => <label key={role}>{role.replace('_', ' ')}<select value={roleDefaults[role] || ''} onChange={(event) => setRoleDefaults((current) => ({ ...current, [role]: normalizeLayoutId(event.target.value) }))}><option value="">Use organization/ERP default</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label>)}</div><div><strong>ERP defaults</strong>{ERP_SCOPE_OPTIONS.map((erp) => <label key={erp}>{erp.toUpperCase()}<select value={erpDefaults[erp] || ''} onChange={(event) => setErpDefaults((current) => ({ ...current, [erp]: normalizeLayoutId(event.target.value) }))}><option value="">Use organization default</option>{LAYOUT_IDS.map((id) => <option key={id} value={id}>{labelFor(id)}</option>)}</select></label>)}</div></div><button type="button" className="primary-button" disabled={busy || !payload.canManage} onClick={() => void save()}><Save size={14} /> Save policy</button></section>;
}

function HistoryPanel({ payload, onRefresh, onMessage }: { payload: LayoutPayload; onRefresh: () => Promise<void>; onMessage: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function rollback(id: string) {
    setBusy(true);
    try { await api('/api/experience/layout/rollback', { method: 'POST', body: JSON.stringify({ historyId: id }) }); onMessage('The selected experience version was restored.'); await onRefresh(); }
    catch (error) { onMessage(error instanceof Error ? error.message : 'Rollback is unavailable.'); }
    finally { setBusy(false); }
  }
  return <section id="layout-studio-history" className="layout-history-card"><div><span className="eyebrow">AUDITED HISTORY</span><h3>Rollback & history</h3><p>Applied experience changes remain reversible and are recorded separately from theme changes.</p></div>{payload.history.length ? <div className="layout-history-list">{payload.history.map((item) => <div className="layout-history-item" key={item.id}><span><strong>{labelFor(item.layoutId)}</strong><small>{item.scope} · {new Date(item.createdAt).toLocaleString()}</small></span><button type="button" className="text-action" disabled={busy} onClick={() => void rollback(item.id)}><RotateCcw size={14} /> Restore</button></div>)}</div> : <div className="layout-studio-empty">No prior layout changes are recorded for this workspace.</div>}</section>;
}

export function LayoutStudio({ context }: { context: WorkforceContext }) {
  const [payload, setPayload] = useState<LayoutPayload>(() => fallbackPayload());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const query = useMemo(() => context.companies[0]?.id ? '?erpId=controls&companyId=' + encodeURIComponent(context.companies[0].id) : '?erpId=controls', [context.companies]);
  async function refresh() {
    setLoading(true);
    try { const result = await api<LayoutPayload>('/api/experience/layout' + query); setPayload(result); emitLayout(result.preference); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Layout Studio could not load.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [query]);
  if (loading) return <div className="layout-studio-panel"><div className="skeleton-block" /><div className="skeleton-block" /></div>;
  return <Gallery payload={payload} onRefresh={refresh} />;
}

function LayoutStudioHost() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const openStudio = () => setOpen(true);
    window.addEventListener('daenem:open-layout-studio', openStudio);
    return () => window.removeEventListener('daenem:open-layout-studio', openStudio);
  }, []);
  useEffect(() => {
    void api<{ context?: WorkforceContext }>('/api/auth/me').then((result) => setContext(result.context || null)).catch(() => setContext(null));
  }, []);
  if (!open || !context) return null;
  return <div className="layout-studio-backdrop" role="presentation" onClick={() => setOpen(false)}><div className="layout-studio-modal" onClick={(event) => event.stopPropagation()}><button className="layout-studio-close" type="button" onClick={() => setOpen(false)} aria-label="Close Layout Studio"><X size={18} /></button><LayoutStudio context={context} /></div></div>;
}

const host = document.createElement('div');
host.id = 'daenem-layout-studio-root';
document.body.appendChild(host);
createRoot(host).render(<LayoutStudioHost />);
