import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { BarChart3, ChevronRight, FileBarChart2, LockKeyhole, ShieldAlert, X } from 'lucide-react';
import './generic-report-builder.css';

// The registered-dataset, report execution and persistence contract is backend-owned.
// This component deliberately never requests data, manufactures rows or persists drafts.
const sections = [
  { id: 'source', title: 'Data Source', eyebrow: '01 / Authorized data', description: 'Choose only registered datasets that the current company and role may access.', requirements: ['Backend-published dataset registry', 'Company, site, row and field permissions', 'Sensitivity and bounded-query policy'] },
  { id: 'columns', title: 'Columns', eyebrow: '02 / Report structure', description: 'Choose permitted columns and arrange them with pointer or keyboard controls.', requirements: ['Authorized field catalogue', 'Move up and Move down keyboard alternatives', 'Hidden-field exclusion before rendering'] },
  { id: 'filters', title: 'Filters', eyebrow: '03 / Scope precisely', description: 'Add approved operators, dates and saved filter presets without exposing protected values.', requirements: ['Field-specific safe operators', 'Date range and sorting rules', 'Permission-safe filter suggestions'] },
  { id: 'grouping', title: 'Grouping', eyebrow: '04 / Meaningful patterns', description: 'Group and subtotal permitted records, subject to minimum-group disclosure controls.', requirements: ['Allowed grouping keys', 'Small-group suppression', 'Scoped row counts and totals'] },
  { id: 'calculations', title: 'Calculations', eyebrow: '05 / Governed maths', description: 'Use server-approved calculations, never arbitrary formulas or executable code.', requirements: ['Registered expressions', 'Strictest-source-field sensitivity', 'Approved aggregate permissions'] },
  { id: 'visualization', title: 'Visualization', eyebrow: '06 / Clear presentation', description: 'Choose an accessible visual preference. Nothing is charted until the server authorizes results.', requirements: ['Authorized report data', 'Table and appropriate chart rendering', 'No misleading counts or sample records'] },
  { id: 'sharing', title: 'Sharing', eyebrow: '07 / Private by default', description: 'Reports stay private until a server-authorized audience is explicitly selected.', requirements: ['Allowed recipient and audience grants', 'Permission checks at open time', 'Audited sharing and revocation'] },
  { id: 'export', title: 'Export', eyebrow: '08 / Controlled output', description: 'CSV, XLSX and PDF are available only when each underlying field permits export.', requirements: ['Server-authorized export grants', 'Bounded and audited export jobs', 'Safe filenames and sensitive-field removal'] },
  { id: 'schedule', title: 'Schedule', eyebrow: '09 / Governed delivery', description: 'Scheduled delivery needs an approved channel and renewed recipient authorization on every run.', requirements: ['Approved delivery-channel contract', 'Per-run company and recipient recheck', 'Audit and delivery failure truth'] },
  { id: 'governance', title: 'Governance', eyebrow: '10 / Release controls', description: 'Review ownership, report version, execution evidence and audit policy before release.', requirements: ['Versioned definitions and immutable audit', 'Duplicate, rename and archive API', 'Permission-checked execution and preview'] },
] as const;
type SectionId = typeof sections[number]['id'];
type ViewPreference = 'table' | 'bar' | 'line';

export function GenericReportBuilderLauncher({ companyId }: { companyId: string | null }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<SectionId>('source');
  const [viewPreference, setViewPreference] = useState<ViewPreference>('table');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const selected = sections.find(section => section.id === current) || sections[0];

  // An authority/company switch cannot carry even an unsaved layout choice forward.
  useEffect(() => {
    setOpen(false);
    setCurrent('source');
    setViewPreference('table');
  }, [companyId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  const selectByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % sections.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + sections.length) % sections.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = sections.length - 1;
    else return;
    event.preventDefault();
    setCurrent(sections[next].id);
    railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <>
    <button ref={triggerRef} className="grb-workspace-action" type="button" aria-haspopup="dialog"
      aria-label="Open Generic Report Builder" onClick={() => setOpen(true)}>
      <FileBarChart2 aria-hidden="true" size={21} /><span>Report Builder</span><ChevronRight aria-hidden="true" size={16} />
    </button>
    {open && <div className="grb-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="grb-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="grb-title" aria-describedby="grb-overview">
        <header className="grb-header">
          <div className="grb-brand"><FileBarChart2 aria-hidden="true" size={22} /><span>DAENEM <strong>INTELLIGENCE</strong></span></div>
          <button ref={closeRef} className="grb-close" type="button" onClick={() => setOpen(false)} aria-label="Close Generic Report Builder"><X size={21} aria-hidden="true" /></button>
        </header>
        <div className="grb-intro">
          <div><p className="grb-eyebrow">CONTROLLED WORKSPACE / FIRST-RELEASE FOUNDATION</p>
            <h2 id="grb-title">Generic Report Builder<span className="grb-title-mark">.</span></h2>
            <p id="grb-overview">Design reports from permission-scoped datasets. The reporting server contract is not connected; no records are fetched, previewed or saved.</p>
          </div>
          <div className="grb-status"><ShieldAlert size={18} aria-hidden="true" /><span>Backend required</span></div>
        </div>
        <div className="grb-layout">
          <nav className="grb-rail" ref={railRef} role="tablist" aria-label="Report design sections" aria-orientation="vertical">
            {sections.map((section, index) => <button key={section.id} id={`grb-tab-${section.id}`} type="button" role="tab" aria-controls="grb-panel"
              aria-selected={current === section.id} tabIndex={current === section.id ? 0 : -1} onKeyDown={event => selectByKeyboard(event, index)}
              onClick={() => setCurrent(section.id)} className={current === section.id ? 'grb-tab grb-tab-active' : 'grb-tab'}>
              <span className="grb-tab-number">{String(index + 1).padStart(2, '0')}</span><span>{section.title}</span>
            </button>)}
          </nav>
          <section id="grb-panel" className="grb-panel" role="tabpanel" aria-labelledby={`grb-tab-${current}`} tabIndex={0}>
            <p className="grb-eyebrow">{selected.eyebrow}</p><h3>{selected.title}</h3><p className="grb-description">{selected.description}</p>
            {current === 'source' && <div className="grb-empty" role="status"><ShieldAlert size={27} aria-hidden="true" />
              <strong>No authorized datasets connected</strong><span>Backend registration and current permission checks are required. No dataset names, row counts or field values are exposed.</span>
            </div>}
            {current === 'sharing' && <p className="grb-private"><LockKeyhole size={19} aria-hidden="true" /> Visibility: <strong>Private only</strong> <span>Sharing disabled until current recipient grants are verified.</span></p>}
            {current === 'columns' && <div className="grb-reorder"><span>No permitted columns to reorder.</span><button type="button" disabled>Move up</button><button type="button" disabled>Move down</button></div>}
            {current === 'visualization' && <fieldset className="grb-visuals"><legend>Local layout preference (not saved)</legend>
              {(['table','bar','line'] as const).map(preference => <button type="button" key={preference} aria-pressed={viewPreference === preference}
                className={viewPreference === preference ? 'grb-visual grb-visual-selected' : 'grb-visual'} onClick={() => setViewPreference(preference)}>
                {preference === 'table' ? <FileBarChart2 size={18} aria-hidden="true" /> : <BarChart3 size={18} aria-hidden="true" />}{preference === 'table' ? 'Table' : preference === 'bar' ? 'Bar chart' : 'Line chart'}
              </button>)}
            </fieldset>}
            <div className="grb-requirements"><h4>Required for activation</h4><ul>{selected.requirements.map(item => <li key={item}>{item}</li>)}</ul></div>
            <div className="grb-panel-foot"><LockKeyhole size={16} aria-hidden="true" /> No SQL, report execution, exports or provider requests are available from this shell.</div>
          </section>
        </div>
        <footer className="grb-footer">
          <div><strong>PRIVATE BY DEFAULT</strong><span>No preview, save, share, export or schedule until backend authorization is ready.</span></div>
          <div className="grb-actions"><button type="button" disabled>Preview</button><button type="button" disabled>Save report</button><button type="button" onClick={() => setOpen(false)}>Close</button></div>
        </footer>
      </div>
    </div>}
  </>;
}
