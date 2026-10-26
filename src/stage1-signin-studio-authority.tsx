import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { hasWorkforcePermission, type WorkforceContext } from './auth';
import { readStudioReviewWithoutSideEffects, studioDraftDifferences, StudioPermissionDenied, type StudioDraftDifference } from './stage1-signin-studio-review';
import './stage1-signin-studio-authority.css';

const STUDIO_PATH = '/admin/experience/sign-in-studio';
export function isSignInStudioRoutePathname(pathname: string): boolean {
  return pathname === STUDIO_PATH || pathname === STUDIO_PATH + '/';
}
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

type Snapshot = { sessionId: string; backgroundId: string; themeMode: string; widgets: number; hasDraft: boolean; changes: StudioDraftDifference[] };
type LoadState = 'loading' | 'ready' | 'denied' | 'unavailable';
type AuthoritySection = 'Home' | 'Themes' | 'Draft' | 'Preview' | null;

function sectionFromUrl(): AuthoritySection {
  const requested = new URLSearchParams(window.location.search).get('studioSection');
  if (requested === null || requested === 'Home') return 'Home';
  if (requested === 'Preview') return 'Preview';
  if (requested === 'Themes') return 'Themes';
  if (requested === 'Draft') return 'Draft';
  // Every other legacy Studio section keeps its original component/navigation.
  return null;
}
function isStudioPath() {
  return isSignInStudioRoutePathname(window.location.pathname);
}
function navigateSection(section: 'Home' | 'Themes' | 'Draft' | 'Preview') {
  window.history.pushState({}, '', STUDIO_PATH + '?studioSection=' + section);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('daenem-studio-section-change'));
}

export default function Stage1SignInStudioAuthority({ context, standalone = false }: { context: WorkforceContext; standalone?: boolean }) {
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
    const refresh = () => {
      // Discard the previous privileged projection before an async grant recheck.
      setSnapshot(null);
      setLoad('loading');
      setAuthRefresh(value => value + 1);
    };
    const onVisibilityChange = () => { if (!document.hidden) refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (standalone || !active || section === null) { setMount(null); return; }
    const locate = () => {
      const node = document.querySelector<HTMLElement>('[data-approved-postlogin="qa-review-v115"] #main-content');
      setMount(previous => previous === node ? previous : node);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, section, standalone]);

  useEffect(() => {
    if (standalone || !mount || !active || section === null) return;
    mount.dataset.daenemStudioAuthority = section.toLowerCase();
    return () => { delete mount.dataset.daenemStudioAuthority; };
  }, [mount, active, section, standalone]);

  useEffect(() => {
    if (!active || section === null || (!standalone && !mount)) return;
    let cancelled = false;
    const controller = new AbortController();
    setSnapshot(null);
    if (!localGrant) {
      // The demo Owner/Manager projection is NEVER a substitute for the grant.
      setLoad('denied');
      return () => { cancelled = true; controller.abort(); };
    }
    setLoad('loading');
    void readStudioReviewWithoutSideEffects(controller.signal)
      .then(({ published, draft }) => {
        if (cancelled || controller.signal.aborted) return;
        setSnapshot({
          sessionId: context.sessionId,
          backgroundId: published.backgroundId,
          themeMode: published.themeMode,
          widgets: published.widgetInstances.filter(widget => widget.visible).length,
          hasDraft: draft !== null,
          changes: studioDraftDifferences(published, draft),
        });
        setLoad('ready');
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setLoad(error instanceof StudioPermissionDenied ? 'denied' : 'unavailable');
      });
    return () => { cancelled = true; controller.abort(); };
  }, [active, mount, section, context.sessionId, localGrant, authRefresh, standalone]);

  if (!active || (!standalone && !mount)) return null;
  const present = (content: ReactNode) => standalone ? content : createPortal(content, mount!);
  if (!localGrant || load === 'denied') {
    return present(
      <section className="stage1-studio-authority" data-studio-access="denied" aria-label="Studio access unavailable">
        <div className="stage1-studio-guard" role="alert">
          <strong>This destination is unavailable.</strong>
          <p>Sign-In Studio requires an active Owner/Admin grant and Manage Settings permission. Your workspace permissions do not allow this section.</p>
        </div>
      </section>
    );
  }
  if (section === null) {
    if (!standalone) return null;
    return present(
      <section className="stage1-studio-authority" data-studio-access="legacy-hold" aria-label="Unmigrated Studio section">
        <div className="stage1-studio-guard" role="status">
          <strong>This historical editor has not been connected to the approved V180 design.</strong>
          <p>Old Webflow and Sites controls cannot publish changes to the protected Cloudflare Sign-In. Use the approved Studio sections until the editor has been migrated and independently accepted.</p>
        </div>
        <button type="button" className="stage1-studio-primary" onClick={() => navigateSection('Home')}>Return to Approved Studio Overview</button>
      </section>
    );
  }
  if (load !== 'ready' || !snapshot || snapshot.sessionId !== context.sessionId) {
    return present(
      <section className="stage1-studio-authority" data-studio-access="checking" aria-label="Verifying Studio access">
        <div className="stage1-studio-guard" role="status">
          <strong>{load === 'unavailable' ? 'Cannot verify Studio access.' : 'Verifying Studio access…'}</strong>
          <p>{load === 'unavailable' ? 'The current permission and configuration check failed closed. Refresh to retry.' : 'Checking current Worker permissions before showing the Studio.'}</p>
        </div>
      </section>
    );
  }
  const selected = PRESETS[preset] || PRESETS[3];
  return present(
    <section className="stage1-studio-authority" data-approved-studio-source="cloudflare-v180" aria-label="StaffPortal approved Sign-In Studio workbench">
      <header className="stage1-studio-authority-hero">
        <div><span className="stage1-studio-eyebrow">STAFFPORTAL / EXPERIENCE / SIGN-IN STUDIO</span>
          <h2>{APPROVED.name}</h2><p>Current public Pre-Production Sign-In is the approved baseline. Its historical Sites origin does not make Webflow Home the active release. Worker theme preferences are separate from the protected page source.</p>
        </div>
        <div className="stage1-studio-version"><strong>{APPROVED.version}</strong><span>PUBLIC BASELINE · SOURCE LOCKED</span></div>
      </header>
      <div className="stage1-studio-guard" role="status"><strong>No changes to public Sign-In.</strong> This approved-baseline workbench is read-only. Legacy Studio editors are separate and are not approved to publish the public Sign-In.</div>
      <nav className="stage1-studio-tabs" aria-label="Approved Sign-In Studio">
        <button type="button" aria-current={section === 'Home' ? 'page' : undefined} onClick={() => navigateSection('Home')}>Overview</button>
        <button type="button" aria-current={section === 'Themes' ? 'page' : undefined} onClick={() => navigateSection('Themes')}>Approved Theme</button>
        <button type="button" aria-current={section === 'Draft' ? 'page' : undefined} onClick={() => navigateSection('Draft')}>Review Unpublished Draft</button>
        <button type="button" aria-current={section === 'Preview' ? 'page' : undefined} onClick={() => navigateSection('Preview')}>Approved Live Preview</button>
      </nav>
      {section === 'Home' ? <>
        <div className="stage1-studio-authority-grid">
          <article><small>AUTHORITATIVE PUBLIC DESIGN</small><h3>Approved V180 · Cloudflare</h3><p>Live renderer: the same approved V180 markup and Worker-bound authentication as the Pre-Production root.</p><span className="stage1-studio-state">CURRENT · READ ONLY</span></article>
          <article><small>HISTORICAL COLLECTION</small><h3>Webflow / Sites variants</h3><p>Retained as historical comparisons. Webflow Home is not the current public Sign-In and must not be labeled active.</p><span className="stage1-studio-state">REFERENCE ONLY</span></article>
          <article><small>SERVER SETTINGS · DISTINCT FROM LOCKED DESIGN</small><h3>Worker-backed preferences</h3>
            <p>Stored theme mode: {snapshot.themeMode}. Stored background ID: {snapshot.backgroundId}. Stored visible widgets: {snapshot.widgets}. {snapshot.hasDraft ? 'An unpublished draft exists.' : 'No unpublished draft is recorded.'}</p>
            <p className="stage1-studio-review-note">These values are server records, not proof that the source-locked V180 hero, layouts or widgets are editable through the legacy design library.</p>
          </article>
        </div>
        <div className="stage1-studio-main-actions">
          <button type="button" className="stage1-studio-primary" onClick={() => navigateSection('Preview')}>Review Approved Sign-In</button>
          <a href={APPROVED_PREVIEW_PATH} target="_blank" rel="noopener noreferrer">Open Official V180 Preview</a>
        </div>
      </> : section === 'Themes' ? <div className="stage1-studio-themes">
        <div className="stage1-studio-theme-grid">
          <article className="stage1-studio-theme-current">
            <small>PUBLIC DESIGN · SOURCE LOCKED</small>
            <h3>{APPROVED.name}</h3>
            <p>The official published Sign-In continues to render the protected V180 markup and the current Cloudflare Worker authentication. This is the source of truth, not a Webflow Home theme preset.</p>
            <div className="stage1-studio-theme-facts">
              <span><strong>Version</strong> {APPROVED.version}</span>
              <span><strong>Source</strong> {APPROVED.source}</span>
              <span><strong>Rendering</strong> Current Worker public endpoint</span>
            </div>
            <a href={APPROVED_PREVIEW_PATH} target="_blank" rel="noopener noreferrer" className="stage1-studio-primary">Inspect real approved V180</a>
          </article>
          <article>
            <small>WORKER PREFERENCES · NOT PAGE SOURCE</small>
            <h3>Current stored configuration</h3>
            <dl className="stage1-studio-theme-facts">
              <div><dt>Theme mode</dt><dd>{snapshot.themeMode}</dd></div>
              <div><dt>Background setting</dt><dd>{snapshot.backgroundId}</dd></div>
              <div><dt>Configured visible widgets</dt><dd>{snapshot.widgets}</dd></div>
              <div><dt>Unpublished Worker draft</dt><dd>{snapshot.hasDraft ? 'Present' : 'None recorded'}</dd></div>
            </dl>
            <p>These settings are readable but are not proof of editable controls for the protected V180 page. No activation or publish action is offered here.</p>
          </article>
          <article>
            <small>HISTORICAL REFERENCE · NOT ACTIVE</small>
            <h3>Earlier Webflow and Sites themes</h3>
            <p>The old Webflow Home default and Sites laboratory are retained by the historical V115 source. Their miniatures and activation buttons do not control the approved Cloudflare V180 public Sign-In.</p>
            <span className="stage1-studio-state">ARCHIVED REFERENCE ONLY</span>
          </article>
        </div>
      </div> : section === 'Draft' ? <div className="stage1-studio-draft-review">
        <header className="stage1-studio-draft-heading">
          <div>
            <small>LIVE WORKER RECORDS · READ ONLY</small>
            <h3>Unpublished draft compared with stored settings</h3>
            <p>These differences come from the authenticated Cloudflare Worker. This comparison does not claim that every stored field currently controls the source-locked V180 design.</p>
          </div>
          <span className="stage1-studio-state">{snapshot.hasDraft ? snapshot.changes.length + ' settings different' : 'NO UNPUBLISHED DRAFT'}</span>
        </header>
        {!snapshot.hasDraft ? (
          <div className="stage1-studio-draft-empty" role="status">
            <strong>No unpublished Sign-In settings draft was returned.</strong>
            <p>The public approved V180 source remains unchanged. No draft or example values were invented.</p>
          </div>
        ) : snapshot.changes.length === 0 ? (
          <div className="stage1-studio-draft-empty" role="status">
            <strong>A saved draft exists with no changes from the stored settings.</strong>
            <p>No publish or overwrite operation has been performed.</p>
          </div>
        ) : (
          <>
            <div className="stage1-studio-draft-list" role="list" aria-label="Stored Sign-In settings changes">
              {snapshot.changes.slice(0, 32).map(item => (
                <article role="listitem" key={item.path} className="stage1-studio-draft-row">
                  <div><small>{item.section}</small><h4>{item.path}</h4></div>
                  <dl>
                    <div><dt>Currently stored</dt><dd>{item.before}</dd></div>
                    <div><dt>Draft value</dt><dd>{item.after}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            {snapshot.changes.length > 32 && <p className="stage1-studio-review-note">Showing the first 32 of {snapshot.changes.length} changed fields. The full count includes remaining settings; this is not an approval or publication report.</p>}
          </>
        )}
        <p className="stage1-studio-review-note">Reviewing these settings does not modify them, populate browser preferences, send an approval, or publish public Sign-In changes.</p>
        <button type="button" className="stage1-studio-primary" onClick={() => navigateSection('Preview')}>Inspect protected V180 public baseline</button>
      </div> : <div className="stage1-studio-preview">
        <div><h3>Preview the actual public renderer</h3><p>Opens the approved Cloudflare Sign-In in a separate same-origin window. The old Sites laboratory preview and static miniatures are not used. Review presets document target dimensions; opening a new tab does not resize the browser.</p></div>
        <label>Review viewport preset <select value={preset} onChange={e => setPreset(Number(e.target.value))}>
          {PRESETS.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}
        </select></label>
        <p className="stage1-studio-review-note">Target to check: {selected.width} × {selected.height}. Set the actual browser size in TinyFish or device QA tools; this selection alone does not resize or validate a viewport.</p>
        <a href={APPROVED_PREVIEW_PATH} target="_blank" rel="noopener noreferrer" className="stage1-studio-primary">Open approved Sign-In in new window</a>
        <p className="stage1-studio-review-note">Frame embedding is intentionally disabled by Pre-Production anti-clickjacking policy. Opening the preview does not modify settings or publish drafts.</p>
      </div>}
      <footer>Owner-approved V180 source remains protected. Other legacy Studio sections are retained but are not verified controls for the public V180 renderer. Source binding and Owner approval remain release gates.</footer>
    </section>
  );
}
