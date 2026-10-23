import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  POSTLOGIN_DEFAULT_PALETTE,
  normalizePostLoginPaletteId,
  postLoginPaletteById,
  postLoginPalettes,
  type PostLoginPaletteId,
} from './postlogin-palette-system';
import './stage1-appearance-studio.css';

export interface PostLoginPalettePolicy {
  defaultPalette: PostLoginPaletteId;
  forcedPalette: PostLoginPaletteId | '';
  allowEmployeeChoice: boolean;
  preferredPalette: PostLoginPaletteId | '';
  effectivePalette: PostLoginPaletteId;
  canManage: boolean;
}

type Message = { tone: 'info' | 'success' | 'error'; text: string } | null;

const fallbackPolicy: PostLoginPalettePolicy = {
  defaultPalette: POSTLOGIN_DEFAULT_PALETTE,
  forcedPalette: '',
  allowEmployeeChoice: true,
  preferredPalette: '',
  effectivePalette: POSTLOGIN_DEFAULT_PALETTE,
  canManage: false,
};

async function requestPolicy(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || `Request failed (${response.status})`));
  return normalizePolicy(data);
}

function normalizePolicy(value: Record<string, unknown>): PostLoginPalettePolicy {
  const forced = value.forcedPalette ? normalizePostLoginPaletteId(value.forcedPalette) : '';
  const preferred = value.preferredPalette ? normalizePostLoginPaletteId(value.preferredPalette) : '';
  return {
    defaultPalette: normalizePostLoginPaletteId(value.defaultPalette),
    forcedPalette: forced,
    allowEmployeeChoice: value.allowEmployeeChoice !== false,
    preferredPalette: preferred,
    effectivePalette: normalizePostLoginPaletteId(value.effectivePalette),
    canManage: value.canManage === true,
  };
}

function announcePalette(palette: PostLoginPaletteId, source: 'preview' | 'policy') {
  window.dispatchEvent(new CustomEvent('daenem:postlogin-palette-change', {
    detail: { palette, source },
  }));
}

function useAppearanceHost(enabled: boolean) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let current: HTMLElement | null = null;
    const sync = () => {
      const app = document.querySelector<HTMLElement>('[data-approved-postlogin="qa-review-v115"] .p-app');
      const main = app?.querySelector<HTMLElement>('main.p-content');
      const active = app?.dataset.workspace === 'theme' && Boolean(main);
      if (!active || !main) {
        current?.remove();
        current = null;
        document.querySelectorAll('main.stage1-appearance-active').forEach((node) => node.classList.remove('stage1-appearance-active'));
        setHost(null);
        return;
      }
      if (!current || !current.isConnected || current.parentElement !== main) {
        current?.remove();
        current = document.createElement('section');
        current.dataset.stage1AppearanceRoot = 'true';
        main.appendChild(current);
      }
      main.classList.add('stage1-appearance-active');
      setHost(current);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-workspace'] });
    window.addEventListener('popstate', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', sync);
      current?.remove();
      document.querySelectorAll('main.stage1-appearance-active').forEach((node) => node.classList.remove('stage1-appearance-active'));
    };
  }, [enabled]);
  return host;
}

function PalettePreview({ paletteId }: { paletteId: PostLoginPaletteId }) {
  const palette = postLoginPaletteById(paletteId);
  const style = {
    '--preview-anchor': palette.anchor,
    '--preview-primary': palette.primary,
    '--preview-accent': palette.accent,
    '--preview-highlight': palette.highlight,
    '--preview-tint': palette.tint,
    '--preview-canvas': palette.canvas,
    '--preview-surface': palette.surface,
    '--preview-ink': palette.ink,
    '--preview-on-primary': palette.onPrimary,
    '--preview-on-anchor': palette.onAnchor,
  } as CSSProperties;
  return (
    <div className="stage1-palette-preview" style={style} role="img" aria-label={`${palette.name} illustrative interface preview. Example numbers are not live records.`}>
      <aside>
        <strong>DAENEM</strong><small>STAFFPORTAL</small>
        <span className="is-active">Overview</span><span>People</span><span>Finance</span><span>Forms</span>
      </aside>
      <div className="stage1-palette-preview-main">
        <header><span>Ask DAENEM</span><i>DA</i></header>
        <section>
          <div className="stage1-palette-preview-title"><div><small>WORKSPACE</small><strong>Your group, in focus.</strong></div><span className="stage1-palette-preview-action" aria-hidden="true">New request</span></div>
          <div className="stage1-palette-preview-kpis"><span><small>People</small><b>248</b></span><span><small>To review</small><b>12</b></span><span><small>Projects</small><b>36</b></span></div>
          <div className="stage1-palette-preview-chart"><b>Illustrative activity</b><div>{[28,42,35,54,49,68,61,82].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
        </section>
      </div>
    </div>
  );
}

export default function Stage1AppearanceStudio({ enabled }: { enabled: boolean }) {
  const host = useAppearanceHost(enabled);
  const [policy, setPolicy] = useState<PostLoginPalettePolicy>(fallbackPolicy);
  const [selected, setSelected] = useState<PostLoginPaletteId>(POSTLOGIN_DEFAULT_PALETTE);
  const [saved, setSaved] = useState<PostLoginPaletteId>(POSTLOGIN_DEFAULT_PALETTE);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    setBusy(true);
    requestPolicy('/api/theme/postlogin/policy')
      .then((next) => {
        if (cancelled) return;
        setPolicy(next);
        setSelected(next.effectivePalette);
        setSaved(next.effectivePalette);
        announcePalette(next.effectivePalette, 'policy');
        setMessage(null);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ tone: 'info', text: `${error.message}. The approved default remains available for preview.` });
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => {
      cancelled = true;
      announcePalette(saved, 'policy');
    };
  }, [host]);

  const groups = useMemo(() => {
    const result = new Map<string, typeof postLoginPalettes[number][]>();
    for (const palette of postLoginPalettes) {
      const group = result.get(palette.group) || [];
      group.push(palette);
      result.set(palette.group, group);
    }
    return [...result.entries()];
  }, []);

  const preview = (paletteId: PostLoginPaletteId) => {
    setSelected(paletteId);
    announcePalette(paletteId, 'preview');
    setMessage({ tone: 'info', text: 'Previewing this palette. No preference has been saved yet.' });
  };

  const commitPolicy = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestPolicy('/api/theme/postlogin/policy', { method: 'POST', body: JSON.stringify(body) });
      setPolicy(next);
      setSelected(next.effectivePalette);
      setSaved(next.effectivePalette);
      announcePalette(next.effectivePalette, 'policy');
      setMessage({ tone: 'success', text: success });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const savePersonal = async (palette: PostLoginPaletteId | '') => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await requestPolicy('/api/theme/postlogin/preference', { method: 'POST', body: JSON.stringify({ palette }) });
      setPolicy(next);
      setSelected(next.effectivePalette);
      setSaved(next.effectivePalette);
      announcePalette(next.effectivePalette, 'policy');
      setMessage({ tone: 'success', text: palette ? 'Your StaffPortal palette was saved.' : 'Your personal choice was cleared. The current Group policy now applies.' });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!host) return null;
  const active = postLoginPaletteById(policy.effectivePalette);
  const choice = postLoginPaletteById(selected);
  const personalDisabled = Boolean(policy.forcedPalette) || !policy.allowEmployeeChoice;

  return createPortal(
    <div className="stage1-appearance-studio" aria-busy={busy}>
      <header className="stage1-appearance-header">
        <div><span>AUTHENTICATED STAFFPORTAL</span><h2>Appearance collection</h2><p>Preview and select a coordinated post-login palette. Routes, permissions, records, workflows and Sign-In remain unchanged.</p></div>
        <div className="stage1-appearance-status"><span><b>Approved default</b>Ocean Sapphire - Azure Prestige</span><span><b>Currently active</b>{active.name}</span></div>
      </header>

      {message && <div className="stage1-appearance-message" data-tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div>}

      <section className="stage1-appearance-review" aria-labelledby="stage1-palette-review-title">
        <div><span>LIVE PREVIEW</span><h3 id="stage1-palette-review-title">{choice.name}</h3><p>{choice.note}</p><div className="stage1-palette-swatches" aria-label={`${choice.name} colour roles`}>
          {[choice.anchor, choice.primary, choice.accent, choice.highlight, choice.tint, choice.canvas].map((colour, index) => <span key={`${colour}-${index}`}><i style={{ background: colour }} /><code>{colour}</code></span>)}
        </div></div>
        <PalettePreview paletteId={selected} />
      </section>

      <div className="stage1-appearance-actions" role="group" aria-label="Personal appearance actions">
        <button className="is-primary" disabled={busy || personalDisabled} onClick={() => void savePersonal(selected)}>Apply to my workspace</button>
        <button disabled={busy || personalDisabled || !policy.preferredPalette} onClick={() => void savePersonal('')}>Use Group default</button>
        <button disabled={busy || selected === saved} onClick={() => { setSelected(saved); announcePalette(saved, 'policy'); setMessage(null); }}>Cancel preview</button>
        {personalDisabled && <small>{policy.forcedPalette ? 'A Group-wide palette is currently enforced.' : 'Personal palette choice is disabled by Group policy.'}</small>}
      </div>

      {policy.canManage && (
        <section className="stage1-appearance-admin" aria-labelledby="stage1-appearance-admin-title">
          <div><span>OWNER / ADMIN CONTROLS</span><h3 id="stage1-appearance-admin-title">Group appearance policy</h3><p>These audited controls affect the authenticated post-login palette only. They do not change Sign-In or another portal.</p></div>
          <div className="stage1-appearance-admin-actions">
            <button disabled={busy} onClick={() => void commitPolicy({ defaultPalette: selected }, `${choice.name} is now the Group default.`)}>Set selected as Group default</button>
            <button disabled={busy} onClick={() => void commitPolicy({ forcedPalette: selected }, `${choice.name} is now enforced for the Group.`)}>Force selected for Group</button>
            <button disabled={busy || !policy.forcedPalette} onClick={() => void commitPolicy({ forcedPalette: '' }, 'The forced palette was cleared.')}>Clear forced palette</button>
            <button disabled={busy} onClick={() => void commitPolicy({ defaultPalette: POSTLOGIN_DEFAULT_PALETTE, forcedPalette: '' }, 'The approved Ocean Sapphire - Azure Prestige default was restored.')}>Restore approved default</button>
          </div>
          <label className="stage1-appearance-choice-policy"><input type="checkbox" checked={policy.allowEmployeeChoice} disabled={busy} onChange={(event) => void commitPolicy({ allowEmployeeChoice: event.target.checked }, event.target.checked ? 'Personal palette choice is enabled.' : 'Personal palette choice is disabled.')} /><span><strong>Allow personal palette choice</strong><small>Forced Group policy always takes precedence.</small></span></label>
        </section>
      )}

      <section className="stage1-appearance-gallery" aria-label="Available StaffPortal palettes">
        {groups.map(([group, palettes]) => (
          <div className="stage1-appearance-group" key={group}>
            <div className="stage1-appearance-group-heading"><h3>{group}</h3><span>{palettes.length} {palettes.length === 1 ? 'palette' : 'palettes'}</span></div>
            <div className="stage1-appearance-grid">
              {palettes.map((palette) => {
                const isSelected = palette.id === selected;
                const isDefault = palette.id === POSTLOGIN_DEFAULT_PALETTE;
                const isEffective = palette.id === policy.effectivePalette;
                return (
                  <button className="stage1-palette-card" type="button" key={palette.id} data-selected={isSelected || undefined} aria-pressed={isSelected} onClick={() => preview(palette.id)}>
                    <span className="stage1-palette-card-head"><strong>{palette.name}</strong><span>{isDefault ? 'DEFAULT' : isEffective ? 'ACTIVE' : 'PREVIEW'}</span></span>
                    <span className="stage1-palette-card-swatches" aria-hidden="true">{[palette.anchor, palette.primary, palette.accent, palette.highlight, palette.tint, palette.canvas].map((colour) => <i key={colour} style={{ background: colour }} />)}</span>
                    <small>{palette.note}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>,
    host,
  );
}
