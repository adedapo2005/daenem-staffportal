import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkforceContext } from './auth';
import { fetchAdminSignInPreferences, fetchAdminSignInDraft } from './signin-preferences';
import './stage1-signin-studio-authority.css';

const STUDIO_PATH = '/admin/experience/sign-in-studio';
const APPROVED = { name: 'StaffPortal Pre-Production — Approved V180', version: 'V180', source: 'Approved Cloudflare runtime · source-locked' } as const;
const PRESETS = [
  { label: 'Mobile · 390 × 844', width: 390, height: 844 },
  { label: 'Tablet · 768 × 1024', width: 768, height: 1024 },
  { label: 'Laptop · 1366 × 768', width: 1366, height: 768 },
  { label: 'Desktop · 1920 × 1080', width: 1920, height: 1080 },
  { label: '32-inch 4K · 3840 × 2160', width: 3840, height: 2160 },
] as const;

type Snapshot = { canManage: boolean; backgroundId: string; themeMode: string; widgets: number; hasDraft: boolean };
type LoadState = 'loading' | 'ready' | 'unavailable';

function sectionFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('studioSection');
  return requested === 'Preview' ? 'Preview' : 'Home';
}
function isStudioPath() {
  return window.location.pathname === STUDIO_PATH || window.location.pathname === STUDIO_PATH + '/';
}
function navigateSection(section: 'Home' | 'Preview') {
  window.history.pushState({}, '', STUDIO_PATH + '?studioSection=' + section);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('daenem-studio-section-change'));
}

export default function Stage1SignInStudioAuthority({ context }: { context: WorkforceContext }) {
  const [section, setSection] = useState<'Home' | 'Preview'>(sectionFromUrl);
  const [active, setActive] = useState(isStudioPath);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [load, setLoad] = useState<LoadState>('loading');
  const [preset, setPreset] = useState(3);

  useEffect(() => {
    const sync = () => { setActive(isStudioPath()); setSection(sectionFromUrl()); };
    window.addEventListener('popstate', sync);
    window.addEventListener('daenem:v115-navigation', sync);
    window.addEventListener('daenem-studio-section-change', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('daenem:v115-navigation', sync);
      window.removeEventListener('daenem-studio-section-change', sync);
    };
  }, []);

  useEffect(() => {
    if (!active || (section !== 'Home' && section !== 'Preview')) { setMount(null); return; }
    const locate = () => {
      const node = document.querySelector<HTMLElement>('[data-approved-postlogin="qa-review-v115"] #main-content');
      setMount(previous => previous === node ? previous : node);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, section]);

  useEffect(() => {
    if (!mount || !active) return;
    mount.dataset.daenemStudioAuthority = section.toLowerCase();
    return () => { delete mount.dataset.daenemStudioAuthority; };
  }, [mount, active, section]);

  useEffect(() => {
    if (!active || !mount) return;
    let cancelled = false;
    setLoad('loading');
    setSnapshot(null);
    Promise.allSettled([fetchAdminSignInPreferences(), fetchAdminSignInDraft()])
      .then(([config, draft]) => {
        if (cancelled) return;
        if (config.status !== 'fulfilled') { setLoad('unavailable'); return; }
        const current = config.value;
        const canManage = current.canManage === true;
        const storedDraft = canManage && draft.status === 'fulfilled' && draft.value.canManage === true && draft.value.draft !== null;
        setSnapshot({
          canManage,
          backgroundId: current.config.backgroundId,
          themeMode: current.config.themeMode,
          widgets: current.config.widgetInstances.filter(widget => widget.visible).length,
          hasDraft: storedDraft,
        });
        setLoad('ready');
      }).catch(() => { if (!cancelled) setLoad('unavailable'); });
    return () => { cancelled = true; };
  }, [active, mount, context.sessionId]);

  if (!active || !mount || (section !== 'Home' && section !== 'Preview')) return null;
  const selected = PRESETS[preset];
  const openPreview = () => {
    // Same-origin public renderer, no iframe: retain CSP frame-ancestors 'none' and X-Frame-Options DENY.
    // With noopener, browsers may return null even when the new tab opened.
    window.open('/staff-portal-signin?studioReview=signin-v180', '_blank', 'noopener,noreferrer');
  };
  return createPortal(
    <section className="stage1-studio-authority" data-approved-studio-source="cloudflare-v180" aria-label="StaffPortal approved Sign-In Studio workbench">
      <header className="stage1-studio-authority-hero">
        <div><span className="stage1-studio-eyebrow">STAFFPORTAL / EXPERIENCE / SIGN-IN STUDIO</span>
          <h2>{APPROVED.name}</h2><p>Current public Pre-Production Sign-In is the approved baseline. Its historical Sites origin does not make Webflow Home the active release.</p>
        </div>
        <div className="stage1-studio-version"><strong>{APPROVED.version}</strong><span>PUBLIC BASELINE · SOURCE LOCKED</span></div>
      </header>
      <div className="stage1-studio-guard" role="status"><strong>No changes to public Sign-In.</strong> Review here is read-only. Publishing, activation, and rollback require separate Owner-authorized release gates.</div>
      <nav className="stage1-studio-tabs" aria-label="Approved Sign-In Studio">
        <button type="button" aria-current={section === 'Home' ? 'page' : undefined} onClick={() => navigateSection('Home')}>Overview</button>
        <button type="button" aria-current={section === 'Preview' ? 'page' : undefined} onClick={() => navigateSection('Preview')}>Approved Live Preview</button>
      </nav>
      {section === 'Home' ? <>
        <div className="stage1-studio-authority-grid">
          <article><small>AUTHORITATIVE PUBLIC DESIGN</small><h3>Approved V180 · Cloudflare</h3><p>Live renderer: the same approved V180 markup and Worker-bound authentication as the Pre-Production root.</p><span className="stage1-studio-state">CURRENT · READ ONLY</span></article>
          <article><small>HISTORICAL COLLECTION</small><h3>Webflow / Sites variants</h3><p>Retained as historical comparisons. Webflow Home is not the current public Sign-In and must not be labeled active.</p><span className="stage1-studio-state">REFERENCE ONLY</span></article>
          <article><small>CURRENT WORKER CONFIGURATION</small><h3>{load === 'loading' ? 'Checking authority…' : load === 'unavailable' ? 'Configuration unavailable' : 'Server-backed settings'}</h3>
            {load === 'ready' && snapshot ? <p>Theme mode: {snapshot.themeMode}. Background: {snapshot.backgroundId}. Visible configured widgets: {snapshot.widgets}. {snapshot.canManage ? (snapshot.hasDraft ? 'An unpublished draft exists.' : 'No stored unpublished draft reported.') : 'You have view-only access.'}</p> : <p>{load === 'unavailable' ? 'Unable to verify the current configuration. No values are assumed.' : 'Reading authorised settings without modifications.'}</p>}
          </article>
        </div>
        <div className="stage1-studio-main-actions">
          <button type="button" className="stage1-studio-primary" onClick={() => navigateSection('Preview')}>Review Approved Sign-In</button>
          <button type="button" onClick={() => window.open('/staff-portal-signin?studioReview=signin-v180', '_blank', 'noopener,noreferrer')}>Open Official V180 Preview</button>
        </div>
      </> : <div className="stage1-studio-preview">
        <div><h3>Preview the actual public renderer</h3><p>Opens the approved Cloudflare Sign-In in a separate same-origin window. The old Sites laboratory preview and static miniatures are not used. Browser window dimensions are requests, not verified viewport measurements.</p></div>
        <label>Review viewport preset <select value={preset} onChange={e => setPreset(Number(e.target.value))}>
          {PRESETS.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}
        </select></label>
        <p className="stage1-studio-review-note">Selected target: {selected.width} × {selected.height}. Adjust the browser viewport using TinyFish or device QA tools for measured acceptance.</p>
        <button type="button" className="stage1-studio-primary" onClick={openPreview}>Open approved Sign-In in new window</button>
        <p className="stage1-studio-review-note">Frame embedding is intentionally disabled by Pre-Production anti-clickjacking policy. Opening the preview does not modify settings or publish drafts.</p>
      </div>}
      <footer>Owner-approved V180 source remains protected. Legacy Studio sections retain their existing implementation; they are not evidence of current public authority until migrated and accepted.</footer>
    </section>, mount
  );
}
