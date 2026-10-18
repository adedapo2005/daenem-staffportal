"use client";

import { type KeyboardEvent, type UIEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Eye,
  FileText,
  Link2,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useDeviceState } from "./device-state";
import { useLab } from "./lab-context";
import { canAct, canRecordAct, money, recordsAreRelated, type ModuleDef, type RecordData } from "./model";
import { Badge, Btn, Empty, Steps, Timeline } from "./ui";

type RecordSort = "Title" | "Status" | "Due Date";
type WorkspaceState = {
  query: string;
  status: string;
  sort: RecordSort;
  selectedId: string;
  scrollTop: number;
};
type RecordTab = "Overview" | "Activity" | "Documents" | "Related Records" | "Approvals" | "Notes";

export type RecordIdentityFact = { label: string; value: string };

function selectionKey(row: RecordData) {
  return `${row.module}:${row.id}`;
}

function relatedRecords(row: RecordData, rows: RecordData[]) {
  return rows.filter((candidate) => recordsAreRelated(row, candidate));
}

export function QuickInspection({ row, onClose, onOpen }: {
  row: RecordData;
  onClose: () => void;
  onOpen: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const facts = Object.entries(row.fields).slice(0, 3);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <aside
      className="ri-quick-inspection"
      aria-labelledby="quick-inspection-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <div><span className="p-kicker">Quick Inspection · {row.id}</span><h3 ref={titleRef} id="quick-inspection-title" tabIndex={-1}>{row.title}</h3></div>
        <button type="button" onClick={onClose} aria-label="Close Quick Inspection"><X size={17} /></button>
      </header>
      <div className="ri-quick-facts">
        <span><Badge>{row.status}</Badge></span>
        <span><UserRound size={14} />{row.owner}</span>
        {row.due && <span><CalendarDays size={14} />{row.due}</span>}
      </div>
      {facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not Recorded"}</dd></div>)}</dl>}
      <Btn variant="quiet" onClick={onOpen}>Open Record Workspace<ArrowUpRight size={15} /></Btn>
    </aside>
  );
}

export default function AdaptiveRecordWorkspace({
  module,
  rows,
  onOpen,
  allowDedicatedPage = true,
  recordNoun = "Record",
  defaultSort = "Due Date",
  sortOptions = ["Due Date", "Title", "Status"],
  identityFacts,
}: {
  module: ModuleDef;
  rows: RecordData[];
  onOpen?: (row: RecordData) => void;
  allowDedicatedPage?: boolean;
  recordNoun?: string;
  defaultSort?: RecordSort;
  sortOptions?: RecordSort[];
  identityFacts?: (row: RecordData) => RecordIdentityFact[];
}) {
  const { session } = useLab();
  const [state, setState] = useDeviceState<WorkspaceState>(
    `record-selection-${session.personId}-${module.id}`,
    { query: "", status: "All", sort: defaultSort, selectedId: "", scrollTop: 0 },
  );
  const listRef = useRef<HTMLDivElement>(null);
  const recordButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const quickButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const mobileReturnFocusRef = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const [quickId, setQuickId] = useState("");
  const [tab, setTab] = useState<RecordTab>("Overview");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const statuses = useMemo(() => ["All", ...new Set(rows.map((row) => row.status))], [rows]);
  const filtered = useMemo(() => {
    const query = state.query.trim().toLowerCase();
    return rows
      .filter((row) =>
        (!query || `${row.title} ${row.subtitle} ${row.id} ${row.owner} ${Object.values(row.fields).join(" ")}`.toLowerCase().includes(query)) &&
        (state.status === "All" || row.status === state.status))
      .sort((left, right) => {
        if (state.sort === "Status") return left.status.localeCompare(right.status);
        if (state.sort === "Title") return left.title.localeCompare(right.title);
        return String(left.due).localeCompare(String(right.due));
      });
  }, [rows, state.query, state.sort, state.status]);
  const selected = filtered.find((row) => selectionKey(row) === state.selectedId) || filtered[0];
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  const quickRow = filtered.find((row) => selectionKey(row) === quickId);
  const related = selected ? relatedRecords(selected, rows) : [];
  const noteEntries = selected
    ? Object.entries(selected.fields).filter(
        ([label, value]) =>
          Boolean(value) && /note|comment|reason|message/i.test(label),
      )
    : [];
  const overviewEntries = selected
    ? Object.entries(selected.fields).filter(
        ([label]) => !noteEntries.some(([noteLabel]) => noteLabel === label),
      )
    : [];
  const tabs: RecordTab[] = selected ? [
    "Overview",
    ...(selected.history.length ? ["Activity" as RecordTab] : []),
    ...(selected.evidence.length ? ["Documents" as RecordTab] : []),
    ...(related.length ? ["Related Records" as RecordTab] : []),
    ...(module.stages.some((stage) => /Appro|Review|Return|Reject/.test(stage)) ? ["Approvals" as RecordTab] : []),
    ...(noteEntries.length ? ["Notes" as RecordTab] : []),
  ] : ["Overview"];
  const activeTab = tabs.includes(tab) ? tab : "Overview";
  const selectedIdentityFacts = selected ? identityFacts?.(selected) || [
    { label: "Responsible Person", value: selected.owner },
    { label: "Due Date", value: selected.due || "Not Recorded" },
    ...(selected.amount > 0 ? [{ label: "Recorded Amount", value: money(selected.amount) }] : []),
  ] : [];
  const filtersActive = Boolean(
    state.query || state.status !== "All" || state.sort !== defaultSort,
  );

  useEffect(() => {
    if (!selected) return;
    const key = selectionKey(selected);
    if (state.selectedId !== key) setState((current) => ({ ...current, selectedId: key }));
  }, [selected, setState, state.selectedId]);

  useLayoutEffect(() => {
    if (mobileDetailOpen || !listRef.current) return;
    listRef.current.scrollTop = state.scrollTop || 0;
  }, [mobileDetailOpen, state.scrollTop]);

  useEffect(() => {
    if (!mobileReturnFocusRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (mobileDetailOpen) {
        mobileBackRef.current?.focus({ preventScroll: true });
        return;
      }
      selectedButtonRef.current?.focus({ preventScroll: true });
      mobileReturnFocusRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileDetailOpen]);

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  function rememberScroll(event: UIEvent<HTMLDivElement>) {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      setState((current) => current.scrollTop === nextScrollTop ? current : { ...current, scrollTop: nextScrollTop });
      scrollFrame.current = null;
    });
  }

  function choose(row: RecordData) {
    mobileReturnFocusRef.current = window.matchMedia("(max-width: 759px)").matches;
    setState((current) => ({ ...current, selectedId: selectionKey(row) }));
    setQuickId("");
    setTab("Overview");
    setMobileDetailOpen(true);
  }

  function closeQuickInspection() {
    const activeQuickId = quickId;
    setQuickId("");
    requestAnimationFrame(() => {
      quickButtonRefs.current.get(activeQuickId)?.focus({ preventScroll: true });
    });
  }

  function openQuickRecord(row: RecordData) {
    choose(row);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 759px)").matches) {
        mobileBackRef.current?.focus({ preventScroll: true });
        return;
      }
      detailTitleRef.current?.focus({ preventScroll: true });
    });
  }

  function move(direction: number) {
    if (!filtered.length || selectedIndex < 0) return;
    choose(filtered[(selectedIndex + direction + filtered.length) % filtered.length]);
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[target]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  function moveListFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home"
      ? 0
      : event.key === "End"
        ? filtered.length - 1
        : Math.min(
            filtered.length - 1,
            Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
          );
    recordButtonRefs.current
      .get(selectionKey(filtered[target]))
      ?.focus({ preventScroll: false });
  }

  function resetFilters() {
    setQuickId("");
    setState((current) => ({
      ...current,
      query: "",
      status: "All",
      sort: defaultSort,
      scrollTop: 0,
    }));
  }

  return (
    <section className={`ri-workspace ${mobileDetailOpen ? "is-mobile-detail" : ""}`} aria-label={`${module.title} Record Workspace`} data-record-interaction="adaptive-master-detail">
      <p className="sr-only" aria-live="polite" data-record-list-status>
        {filtered.length} {recordNoun.toLowerCase()}{filtered.length === 1 ? "" : "s"} available.
        {selected ? ` ${selected.title} selected, ${selectedIndex + 1} of ${filtered.length}.` : " No record selected."}
      </p>
      <section className="ri-master" aria-label={`${recordNoun} List`}>
        <header className="ri-master-header"><div><span className="p-kicker">{module.title}</span><h2>Available {recordNoun}s</h2></div><Badge>{filtered.length} Visible</Badge></header>
        <div className="ri-list-controls">
          <label className="ri-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search {recordNoun}s</span><input type="search" value={state.query} onChange={(event) => setState((current) => ({ ...current, query: event.target.value, scrollTop: 0 }))} placeholder={`Search ${recordNoun}s…`} /></label>
          <label><span>Status</span><select value={state.status} onChange={(event) => setState((current) => ({ ...current, status: event.target.value, scrollTop: 0 }))}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span>Sort</span><select value={state.sort} onChange={(event) => setState((current) => ({ ...current, sort: event.target.value as RecordSort, scrollTop: 0 }))}>{sortOptions.map((sort) => <option key={sort}>{sort}</option>)}</select></label>
          {filtersActive && <button type="button" className="ri-reset-filters" onClick={resetFilters}><X size={15} aria-hidden="true" />Reset Filters</button>}
        </div>
        {quickRow && <QuickInspection row={quickRow} onClose={closeQuickInspection} onOpen={() => openQuickRecord(quickRow)} />}
        {!filtered.length ? <Empty title={`No ${recordNoun}s Found`} message={`No ${recordNoun.toLowerCase()}s match your current filters.`} /> : (
          <div ref={listRef} className="ri-record-list" aria-label={`${module.title} ${recordNoun}s`} onScroll={rememberScroll}>
            {filtered.map((row, index) => {
              const active = selected?.id === row.id && selected.module === row.module;
              return <article key={selectionKey(row)} className={active ? "is-selected" : ""}>
                <button
                  ref={(element) => {
                    const key = selectionKey(row);
                    if (element) recordButtonRefs.current.set(key, element);
                    else recordButtonRefs.current.delete(key);
                    if (active) selectedButtonRef.current = element;
                  }}
                  type="button"
                  className="ri-record-select"
                  onClick={() => choose(row)}
                  onKeyDown={(event) => moveListFocus(event, index)}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="ri-record-copy"><small>{row.id}</small><strong>{row.title}</strong><span>{row.owner}{row.due ? ` · ${row.due}` : ""}</span></span>
                  <span className="ri-record-state"><Badge>{row.status}</Badge><ChevronRight size={16} /></span>
                </button>
                <button ref={(element) => { const key = selectionKey(row); if (element) quickButtonRefs.current.set(key, element); else quickButtonRefs.current.delete(key); }} type="button" className="ri-quick-button" onClick={() => setQuickId(selectionKey(row))} aria-label={`Quick Inspect ${row.title}`}><Eye size={15} />Quick Inspect</button>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="ri-detail" aria-label="Record Workspace">
        {selected ? <>
          <header className="ri-detail-header">
            <button ref={mobileBackRef} type="button" className="ri-mobile-back" onClick={() => setMobileDetailOpen(false)}><ArrowLeft size={16} />Back To {recordNoun} List</button>
            <div className="ri-detail-title"><div><span className="p-kicker">{module.title} · {selected.id}</span><h2 ref={detailTitleRef} tabIndex={-1}>{selected.title}</h2><p>{selected.subtitle}</p></div><Badge>{selected.status}</Badge></div>
            <div className="ri-detail-actions">
              <div className="ri-record-pager" aria-label="Record Navigation"><button type="button" onClick={() => move(-1)} disabled={filtered.length < 2} aria-label={`Previous ${recordNoun}`}><ArrowLeft size={16} /></button><span>{selectedIndex + 1} / {filtered.length}</span><button type="button" onClick={() => move(1)} disabled={filtered.length < 2} aria-label={`Next ${recordNoun}`}><ArrowRight size={16} /></button></div>
              {allowDedicatedPage && onOpen && <Btn onClick={() => onOpen(selected)}>Open Full {recordNoun}<ArrowUpRight size={15} /></Btn>}
            </div>
          </header>
          <nav className="ri-tabs" aria-label="Record Sections" role="tablist">
            {tabs.map((item, index) => { const slug = item.toLowerCase().replace(/\s+/g, "-"); return <button type="button" key={item} id={`record-tab-${slug}`} role="tab" aria-controls={`record-panel-${slug}`} aria-selected={activeTab === item} tabIndex={activeTab === item ? 0 : -1} className={activeTab === item ? "is-active" : ""} onClick={() => setTab(item)} onKeyDown={(event) => moveTab(event, index)}>{item}</button>; })}
          </nav>
          <div className="ri-detail-body" id={`record-panel-${activeTab.toLowerCase().replace(/\s+/g, "-")}`} role="tabpanel" aria-labelledby={`record-tab-${activeTab.toLowerCase().replace(/\s+/g, "-")}`} tabIndex={0}>
            {activeTab === "Overview" && <div className="ri-overview"><div className="ri-identity-strip">{selectedIdentityFacts.map((fact) => <span key={fact.label}>{/(Person|Employee)/.test(fact.label) ? <UserRound size={16} /> : /Date/.test(fact.label) ? <CalendarDays size={16} /> : null}<small>{fact.label}</small><strong>{fact.value || "Not Recorded"}</strong></span>)}</div>{overviewEntries.length > 0 && <dl className="ri-fields">{overviewEntries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not Recorded"}</dd></div>)}</dl>}</div>}
            {activeTab === "Activity" && <div className="ri-section"><div className="ri-section-title"><Activity size={17} /><h3>Activity</h3></div><Timeline items={selected.history} /></div>}
            {activeTab === "Documents" && <div className="ri-section"><div className="ri-section-title"><FileText size={17} /><h3>Documents</h3></div><div className="ri-documents">{selected.evidence.map((name) => <span key={name}><FileText size={17} /><strong>{name}</strong><small>Open the full record to review the attached evidence.</small></span>)}</div></div>}
            {activeTab === "Related Records" && <div className="ri-section"><div className="ri-section-title"><Link2 size={17} /><h3>Related Records</h3></div><div className="ri-related">{related.map((row) => <button type="button" key={selectionKey(row)} onClick={() => onOpen?.(row)}><span><strong>{row.title}</strong><small>{row.id} · {row.owner}</small></span><Badge>{row.status}</Badge><ChevronRight size={16} /></button>)}</div></div>}
            {activeTab === "Approvals" && <div className="ri-section"><div className="ri-section-title"><Activity size={17} /><h3>Approvals</h3></div><Steps steps={module.stages} current={Math.max(0, module.stages.indexOf(selected.status))} /><p className="p-secondary">Available approval actions remain in the full record.</p>{onOpen && canAct(module, session, "approve") && canRecordAct(selected, module, session, "approve") && <Btn variant="outline" onClick={() => onOpen(selected)}>Review Actions<ArrowUpRight size={15} /></Btn>}</div>}
            {activeTab === "Notes" && <div className="ri-section"><div className="ri-section-title"><FileText size={17} /><h3>Notes</h3></div><dl className="ri-fields">{noteEntries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>}
          </div>
        </> : <Empty title={`Select A ${recordNoun}`} message={`Choose a ${recordNoun.toLowerCase()} to open its workspace.`} />}
      </section>
    </section>
  );
}
