import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasWorkforcePermission, type WorkforceContext } from './auth';
import { fetchAdminSignInPreferences, fetchAdminSignInDraft } from './signin-preferences';
import './stage1-signin-studio-authority.css';

const STUDIO_PATH = '/admin/experience/sign-in-studio';
const APPROVED_PREVIEW_PATH = '/staff-portal-signin?studioReview=signin-v180';

export function hasStudioManagementGrant(context: WorkforceContext): boolean {
  const administrativeRole = context.roles.some(role =>
    ['owner', 'group_admin'].includes(role.code.toLowerCase()));
  return administrativeRole && hasWorkforcePermission(context, 'settings.access', 'manage');
}
const APPROVED = { name: 'StaffPortal Pre-Production — Approved V180', version: 'V180', source: 'Approved Cloudflare runtime · source-locked' } as const;
const PRESETS = [
  { label: 'Mobile · 390 × 844', width: 390, height: 844 },
  { label: 'Tablet · 768 × 1024', width: 768, height: 1024 },
  { label: 'Laptop · 1366 × 768', width: 1366, height: 768 },
  { label: 'Desktop · 1920 × 1080', width: 1920, height: 1080 },
  { label: '32-inch 4K · 3840 × 2160', width: 3840, height: 2160 },
] as const;

type Snapshot = { sessionId: string; backgroundId: string; themeMode: string; widgets: number; hasDraft: boolean | null };
type LoadState = 'loading' | 'ready' | 'denied' | 'unavailable';
type AuthoritySection = 'Home' | 'Preview' | null;

function sectionFromUrl(): AuthoritySection {
  const requested = new URLSearchParams(window.location.search).get('studioSection');
  if (requested === null || requested === 'Home') return 'Home';
  if (requested === 'Preview') return 'Preview';
  // Every other legacy Studio section keeps its original component/navigation.
  return null;
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
  const [section, setSection] = useState<AuthoritySection>(sectionFromUrl);
  const [active, setActive] = useState(isStudioPath);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [load, setLoad] = useState<LoadState>('loading');
  const [preset, setPreset] = useState(3);
  const [authRefresh, setAuthRefresh] = useState(0);
  const localGrant = hasStudioManagementGrant(context);

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
    const refresh = () => setAuthRefresh(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => {
    if (!active || section === null) { setMount(null); return; }
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
    if (!active || !mount || section === null) return;
    let cancelled = false;
    setSnapshot(null);
    if (!localGrant) {
      // Deny before any settings or draft request; the old demo role is NOT an authority.
      setLoad('denied');
      return () => { cancelled = true; };
    }
    setLoad('loading');
    void (async () => {
      try {
        const current = await fetchAdminSignInPreferences();
        if (cancelled) return;
        if (current.canManage !== true) {
          setLoad('denied');
          return;
        }
        // Draft data is privileged. Never request it unless the Worker first
        // confirms Manage Settings, and never claim no draft on a failed read.
        let hasDraft: boolean | null = null;
        try {
          const result = await fetchAdminSignInDraft();
          if (result.canManage === true) hasDraft = result.draft !== null;
        } catch {
          // The draft is unknown, NOT absent.
        }
        if (cancelled) return;
        setSnapshot({
          sessionId: context.sessionId,
          backgroundId: current.config.backgroundId,
          themeMode: current.config.themeMode,
          widgets: current.config.widgetInstances.filter(widget => widget.visible).length,
          hasDraft,
        });
        setLoad('ready');
      } catch {
        if (!cancelled) setLoad('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [active, mount, section, context.sessionId, localGrant, authRefresh]);

  if (!active || !mount || section === null) return null;
  if (!localGrant || load === 'denied') {
    return createPortal(
      <section className="stage1-studio-authority" data-studio-access="denied" aria-label="Studio access unavailable">
        <div className="stage1-studio-guard" role="alert">
          <strong>This destination is unavailable.</strong>
          <p>Sign-In Studio requires an active Owner/Admin grant and Manage Settings permission.</p>
        </div>
      </section>, mount
    );
  }
  if (load !== 'ready' || !snapshot || snapshot.sessionId !== context.sessionId) {
    return createPortal(
      <section className="stage1-studio-authority" data-studio-access="checking" aria-label="Verifying Studio access">
        <div className="stage1-studio-guard" role="status">
          <strong>{load === 'unavailable' ? 'Cannot verify Studio access.' : 'Verifying Studio access…'}</strong>
          <p>{load === 'unavailable' ? 'The current permission and configuration check failed closed. Refresh to retry.' : 'Checking current Worker permissions before showing the Studio.'}</p>
        </div>
      </section>, mount
    );
  }
  const selected = PRESETS[preset] || PRESETS[3];
  return createPortal(
    <section className="stage1-studio-authority" data-approved-studio-source="cloudflare-v180" aria-label="StaffPortal approved Sign-In Studio workbench">
      <header className="stage1-studio-authority-hero">
        <div><span className="stage1-studio-eyebrow">STAFFPORTAL / EXPERIENCE / SIGN-IN STUDIO</span>
          <h2>{APPROVED.name}</h2><p>Current public Pre-Production Sign-In is the approved baseline. Its historical Sites origin does not make Webflow Home the active release.</p>
        </div>
        <div className="stage1-studio-version"><strong>{APPROVED.version}</strong><span>PUBLIC BASELINE · SOURCE LOCKED</span></div>
      </header>
      <div className="stage1-studio-guard" role="status"><strong>No changes to public Sign-In.</strong> This approved-baseline workbench is read-only. Legacy Studio editors are separate and are not approved to publish the public Sign-In.</div>
      <nav className="stage1-studio-tabs" aria-label="Approved Sign-In Studio">
        <button type="button" aria-current={section === 'Home' ? 'page' : undefined} onClick={() => navigateSection('Home')}>Overview</button>
        <button type="button" aria-current={section === 'Preview' ? 'page' : undefined} onClick={() => navigateSection('Preview')}>Approved Live Preview</button>
      </nav>
      {section === 'Home' ? <>
        <div className="stage1-studio-authority-grid">
          <article><small>AUTHORITATIVE PUBLIC DESIGN</small><h3>Approved V180 · Cloudflare</h3><p>Live renderer: the same approved V180 markup and Worker-bound authentication as the Pre-Production root.</p><span className="stage1-studio-state">CURRENT · READ ONLY</span></article>
          <article><small>HISTORICAL COLLECTION</small><h3>Webflow / Sites variants</h3><p>Retained as historical comparisons. Webflow Home is not the current public Sign-In and must not be labeled active.</p><span className="stage1-studio-state">REFERENCE ONLY</span></article>
          <article><small>CURRENT WORKER CONFIGURATION</small><h3>{load === 'loading' ? 'Checking authority…' : load === 'unavailable' ? 'Configuration unavailable' : 'Server-backed settings'}</h3>
            {load === 'ready' && snapshot ? <p>Theme mode: {snapshot.themeMode}. Background: {snapshot.backgroundId}. Visible configured widgets: {snapshot.widgets}. {snapshot.hasDraft === null ? 'Draft availability could not be verified.' : snapshot.hasDraft ? 'An unpublished draft exists.' : 'No stored unpublished draft reported.'}</p> : <p>{load === 'unavailable' ? 'Unable to verify the current configuration. No values are assumed.' : 'Reading authorised settings without modifications.'}</p>}
          </article>
        </div>
        <div className="stage1-studio-main-actions">
          <button type="button" className="stage1-studio-primary" onClick={() => navigateSection('Preview')}>Review Approved Sign-In</button>
          <a href={APPROVED_PREVIEW_PATH} target="_blank" rel="noopener noreferrer">Open Official V180 Preview</a>
        </div>
      </> : <div className="stage1-studio-preview">
        <div><h3>Preview the actual public renderer</h3><p>Opens the approved Cloudflare Sign-In in a separate same-origin window. The old Sites laboratory preview and static miniatures are not used. Browser window dimensions are requests, not verified viewport measurements.</p></div>
        <label>Review viewport preset <select value={preset} onChange={e => setPreset(Number(e.target.value))}>
          {PRESETS.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}
        </select></label>
        <p className="stage1-studio-review-note">Selected target: {selected.width} × {selected.height}. Adjust the browser viewport using TinyFish or device QA tools for measured acceptance.</p>
        <a href={APPROVED_PREVIEW_PATH} target="_blank" rel="noopener noreferrer" className="stage1-studio-primary">Open approved Sign-In in new window</a>
        <p className="stage1-studio-review-note">Frame embedding is intentionally disabled by Pre-Production anti-clickjacking policy. Opening the preview does not modify settings or publish drafts.</p>
      </div>}
      <footer>Owner-approved V180 source remains protected. Legacy Studio sections retain their existing implementation; they are not evidence of current public authority until migrated and accepted.</footer>
    </section>, mount
  );
}
