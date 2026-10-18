"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  Command,
  Factory,
  FileText,
  LayoutDashboard,
  ListFilter,
  ListTodo,
  MapPin,
  Menu,
  MoreHorizontal,
  Package,
  PanelRight,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Truck,
  UserRound,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  authSurfaceCount,
  canonicalBaselineRoute,
  globalViewCount,
  majorPageCount,
  moduleCount,
  pageUniquenessMatrix,
  routeSurfaceCount,
  type ContractRow,
} from "./contracts";

type IconType = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

type LabPage =
  | "overview"
  | "work"
  | "approvals"
  | "team"
  | "insight"
  | "printing"
  | "bakery"
  | "autos"
  | "logistics"
  | "admin"
  | "contracts";

type ReviewViewport = { width: number; height: number };

const reviewViewports: Record<string, ReviewViewport> = {
  "390x844": { width: 390, height: 844 },
  "1024x1366": { width: 1024, height: 1366 },
  "1672x941": { width: 1672, height: 941 },
  "3840x2160": { width: 3840, height: 2160 },
};

const navItems: Array<{
  id: LabPage;
  label: string;
  short: string;
  icon: IconType;
  route: string;
  group: string;
}> = [
  { id: "overview", label: "Group Overview", short: "Home", icon: LayoutDashboard, route: "view:overview", group: "Global" },
  { id: "work", label: "My Workspace", short: "Work", icon: ListTodo, route: "module:employee", group: "Staff" },
  { id: "approvals", label: "Approval Desk", short: "Decide", icon: ClipboardIcon, route: "module:expense-approvals", group: "Finance" },
  { id: "team", label: "HR Master Records", short: "Team", icon: Users, route: "module:hr-master", group: "People" },
  { id: "insight", label: "Owner Intelligence", short: "Insight", icon: BarChart3, route: "module:owner-intelligence", group: "Controls" },
  { id: "printing", label: "Printing ERP", short: "Print", icon: Factory, route: "module:printing", group: "Printing" },
  { id: "bakery", label: "Bakery ERP", short: "Bakery", icon: Package, route: "module:bakery", group: "Bakery" },
  { id: "autos", label: "Autos Workshop", short: "Autos", icon: Wrench, route: "module:autos", group: "Autos" },
  { id: "logistics", label: "Logistics Dispatch", short: "Routes", icon: Truck, route: "module:logistics", group: "Logistics" },
  { id: "admin", label: "Admin Setup", short: "Admin", icon: Settings2, route: "module:admin", group: "Controls" },
  { id: "contracts", label: "Design Contract", short: "Contract", icon: FileText, route: "lab:page-uniqueness-matrix", group: "Lab" },
];

function ClipboardIcon({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return <span className={className}><ClipboardIconSvg size={size} strokeWidth={strokeWidth} /></span>;
}

function ClipboardIconSvg({ size = 18, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="12" height="15" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M9 5.25V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v.75M9 10h6M9 14h6M9 17.5h3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

const pageMeta: Record<Exclude<LabPage, "contracts">, {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  route: string;
  archetype: string;
  layout: string;
  primary: string;
  signature: string;
}> = {
  overview: {
    index: "01",
    eyebrow: "Group command / frozen visual checkpoint",
    title: "See the work before it asks for you.",
    description: "A calm, high-signal morning view for authorized attention across the Staff Portal. The command surface stays spacious; evidence arrives when a signal is selected.",
    route: "view:overview",
    archetype: "Executive Command",
    layout: "01 Executive Command",
    primary: "Open attention queue",
    signature: "Priority orbit → evidence rail",
  },
  work: {
    index: "02",
    eyebrow: "Employee self-service / focus flow",
    title: "One clear next step.",
    description: "My Workspace turns requests, attendance, documents, and follow-through into a single personal runway without hiding the source modules beneath a dashboard wall.",
    route: "module:employee",
    archetype: "Focus & Flow",
    layout: "08 Focus & Flow",
    primary: "Resume next action",
    signature: "Next-action runway",
  },
  approvals: {
    index: "03",
    eyebrow: "Maker-checker / decision workspace",
    title: "Decisions deserve their evidence.",
    description: "The Approval Desk holds the queue and the selected record in one decision field. A reviewer can understand, ask for context, then act without losing the request.",
    route: "module:expense-approvals",
    archetype: "Master–Detail Approval Desk",
    layout: "05 Master–Detail Workspace",
    primary: "Review selected request",
    signature: "Queue → evidence → decision",
  },
  team: {
    index: "04",
    eyebrow: "People operations / authorized record view",
    title: "A workforce view with a human center.",
    description: "HR Master Records is designed as a scoped people atlas: record context, completeness, and follow-up are visible before any sensitive detail is expanded.",
    route: "module:hr-master",
    archetype: "People Operations Atlas",
    layout: "03 Operational Cockpit",
    primary: "Inspect employee record",
    signature: "Roster horizon → record drawer",
  },
  insight: {
    index: "05",
    eyebrow: "Owner-only intelligence / narrative canvas",
    title: "Read the signal. Trace the source.",
    description: "Owner Intelligence presents group-level operating signals as a short briefing, with the evidence path one click away and disconnected sources called out honestly.",
    route: "module:owner-intelligence",
    archetype: "Insight Magazine",
    layout: "04 Insight Magazine",
    primary: "Open next signal",
    signature: "Briefing story → source path",
  },
  printing: {
    index: "06",
    eyebrow: "Printing & Technology / production family",
    title: "Make the job flow visible.",
    description: "Printing is a stage-led production board, not a recoloured staff dashboard. Jobs move from enquiry through artwork, production, QC, and delivery with evidence gates.",
    route: "module:printing",
    archetype: "Board Pulse Production Desk",
    layout: "10 Board Pulse",
    primary: "Inspect active print job",
    signature: "Stage flow with WIP pulse",
  },
  bakery: {
    index: "07",
    eyebrow: "Bakery / accountability family",
    title: "From batch yield to money, in one line.",
    description: "Bakery gets a reconciliation spine that respects production, waste, dispatch, remittance, and zero-variance close. The visual language is operational and ledger-like.",
    route: "module:bakery",
    archetype: "Reconciliation Desk",
    layout: "06 Horizon Wide",
    primary: "Open accountability ledger",
    signature: "Batch → dispatch → remittance",
  },
  autos: {
    index: "08",
    eyebrow: "Autos / workshop family",
    title: "A workshop floor, not a CRM.",
    description: "Autos is a bay-oriented operating view: vehicles, service jobs, mechanics, parts, and landed cost connect spatially so the next intervention is easy to locate.",
    route: "module:autos",
    archetype: "Workshop Floor",
    layout: "02 Workspace Canvas",
    primary: "Inspect service bay",
    signature: "Bay panorama → work order",
  },
  logistics: {
    index: "09",
    eyebrow: "Logistics / dispatch family",
    title: "Every route has a story.",
    description: "Dispatch is organized around route flow, trip chronology, driver/fleet context, and proof of delivery. The map is a work surface, not a decorative background.",
    route: "module:logistics",
    archetype: "Map + Operations Feed",
    layout: "03 Operational Cockpit",
    primary: "Open active trip",
    signature: "Route node → dispatch feed",
  },
  admin: {
    index: "10",
    eyebrow: "Owner/Admin / policy workbench",
    title: "Make the boundary legible.",
    description: "Admin Setup turns policy precedence, tracking, appearance, and security controls into an inspectable workbench. Every change has an effective scope and rollback story.",
    route: "module:admin",
    archetype: "Enterprise Studio",
    layout: "09 Enterprise Studio",
    primary: "Inspect effective policy",
    signature: "Policy canvas → inspector",
  },
};

const businessSwatches = [
  { name: "Printing & Technology", tone: "azure", mark: "P" },
  { name: "Bakery", tone: "apricot", mark: "B" },
  { name: "Autos", tone: "mint", mark: "A" },
  { name: "Logistics", tone: "cobalt", mark: "L" },
  { name: "Homes & Properties", tone: "lilac", mark: "H" },
];

const sourceTruth = [
  "Server-derived auth + session boundary",
  "Permission-only navigation and module launch",
  "Company / branch / department scope",
  "Existing API, form, table, and action contracts",
  "Offline queue, retry, conflict, and cached states",
];

export default function Home() {
  const [reviewViewport, setReviewViewport] = useState<ReviewViewport | null>(null);
  const [page, setPage] = useState<LabPage>("overview");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [notice, setNotice] = useState("Private preview ready");
  const [matrixQuery, setMatrixQuery] = useState("");

  useEffect(() => {
    const requestedViewport = new URLSearchParams(window.location.search).get("evidence");
    const nextViewport = requestedViewport ? reviewViewports[requestedViewport] : undefined;
    if (!nextViewport) return;
    const timer = window.setTimeout(() => setReviewViewport(nextViewport), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const currentMeta = page === "contracts" ? null : pageMeta[page];
  const filteredNav = useMemo(
    () =>
      navItems.filter((item) => {
        const value = commandQuery.trim().toLowerCase();
        return !value || item.label.toLowerCase().includes(value) || item.route.toLowerCase().includes(value);
      }),
    [commandQuery],
  );
  const filteredMatrix = useMemo(() => {
    const value = matrixQuery.trim().toLowerCase();
    if (!value) return pageUniquenessMatrix;
    return pageUniquenessMatrix.filter((row) =>
      [row.route, row.page, row.scope, row.uniqueDesignArchetype, row.uniqueInteractionSignature]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [matrixQuery]);

  if (reviewViewport) return <ViewportEvidence viewport={reviewViewport} />;

  function announce(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice("Private preview ready"), 2800);
  }

  function navigate(next: LabPage) {
    setPage(next);
    setCommandOpen(false);
    setCommandQuery("");
    announce(next === "contracts" ? "Design contract opened" : "Opened " + pageMeta[next].title);
  }

  function renderPage() {
    switch (page) {
      case "work":
        return <WorkPage onAction={announce} />;
      case "approvals":
        return <ApprovalsPage onAction={announce} />;
      case "team":
        return <TeamPage onAction={announce} />;
      case "insight":
        return <InsightPage onAction={announce} />;
      case "printing":
        return <PrintingPage onAction={announce} />;
      case "bakery":
        return <BakeryPage onAction={announce} />;
      case "autos":
        return <AutosPage onAction={announce} />;
      case "logistics":
        return <LogisticsPage onAction={announce} />;
      case "admin":
        return <AdminPage onAction={announce} />;
      case "contracts":
        return <ContractPage query={matrixQuery} setQuery={setMatrixQuery} rows={filteredMatrix} onAction={announce} />;
      default:
        return <OverviewPage onAction={announce} />;
    }
  }

  return (
    <div className="lab-app">
      <aside className="lab-sidebar" aria-label="Design lab navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-plane brand-plane-a" />
            <span className="brand-plane brand-plane-b" />
            <span className="brand-plane brand-plane-c" />
            <span className="brand-four">4D</span>
          </div>
          <div className="brand-copy"><strong>Daenem</strong><span>Staff Portal</span></div>
        </div>

        <div className="lab-badge"><span className="signal-dot signal-dot-coral" /><span>Experience lab</span><span className="lab-badge-lock">PRIVATE</span></div>

        <nav className="primary-nav">
          <div className="nav-section-label">Authorized surfaces</div>
          {navItems.slice(0, 10).map((item) => <NavButton key={item.id} item={item} active={page === item.id} onSelect={navigate} />)}
          <div className="nav-section-label nav-section-spaced">Design authority</div>
          <NavButton item={navItems[10]} active={page === "contracts"} onSelect={navigate} />
        </nav>

        <div className="sidebar-bottom">
          <div className="scope-card">
            <div className="scope-card-top"><span className="icon-well icon-well-sky"><ShieldCheck size={15} /></span><span className="status-label">Scoped preview</span></div>
            <strong>Owner persona</strong><span>All authorized businesses</span>
            <button className="scope-link" onClick={() => announce("Workspace switcher is a source-owned action")}>Switch workspace <ArrowUpRight size={13} /></button>
          </div>
            <div className="sidebar-meta"><span>Design version 0.2</span><span className="build-dot"><span /> no production link</span></div>
        </div>
      </aside>

      <div className="lab-main">
        <header className="lab-topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Open navigation" onClick={() => announce("Use the compact navigation below on mobile")}><Menu size={18} /></button>
            <div className="context-crumb"><span className="crumb-home"><Sun size={14} /></span><span>Staff Portal</span><ChevronRight size={13} /><span className="crumb-current">{currentMeta?.eyebrow.split(" / ")[0] ?? "Design authority"}</span></div>
          </div>
          <div className="topbar-actions">
            <span className="wat-clock"><Clock3 size={14} /> 09:42 WAT</span>
            <button className="sync-pill" onClick={() => setSyncOpen(true)} aria-label="Open sync activity"><span className="signal-dot signal-dot-green" /> Cached shell <ChevronDown size={13} /></button>
            <button className="topbar-icon" onClick={() => announce("Notifications remain source-owned")} aria-label="Notifications"><Bell size={17} /><span className="notification-mark" /></button>
            <button className="avatar-button" onClick={() => announce("Preview persona: Owner")} aria-label="Open profile menu">AD</button>
          </div>
        </header>

        <div className="lab-context-strip">
          <div className="context-main"><span className="context-label">PRIVATE DESIGN PREVIEW</span><span className="context-separator" /><span>Design fixture only</span><span className="context-separator" /><span>No live business data connected</span></div>
          <div className="context-tools"><button className="context-tool" onClick={() => setCommandOpen(true)}><Command size={14} /> Command <kbd>⌘ K</kbd></button><button className="context-tool" onClick={() => setAiOpen(true)}><Sparkles size={14} /> Ask AI</button></div>
        </div>

        <main className="lab-content">
          {page !== "contracts" && currentMeta ? <PageHeader meta={currentMeta} onAction={announce} /> : null}
          {renderPage()}
        </main>
      </div>

      <div className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 5).map((item) => <NavButton key={item.id} item={item} active={page === item.id} onSelect={navigate} compact />)}
        <button className="mobile-nav-item" onClick={() => setCommandOpen(true)}><Command size={18} /><span>More</span></button>
      </div>

      {commandOpen ? (
        <div className="modal-backdrop" onClick={() => setCommandOpen(false)}>
          <section className="command-modal" role="dialog" aria-modal="true" aria-label="Authorized workspace command">
            <div className="modal-head"><div><span className="eyebrow">Command palette</span><h2>Go to an authorized workspace</h2></div><button className="close-button" onClick={() => setCommandOpen(false)} aria-label="Close command palette"><X size={17} /></button></div>
            <div className="command-input-wrap"><Search size={18} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setCommandOpen(false)} placeholder="Search authorized workspaces…" /><kbd>ESC</kbd></div>
            <div className="command-results">
              {filteredNav.map((item) => { const ItemIcon = item.icon; return <button className="command-result" key={item.id} onClick={() => navigate(item.id)}><span className="command-result-icon"><ItemIcon size={17} /></span><span className="command-result-copy"><strong>{item.label}</strong><small>{item.route} · {item.group}</small></span><ArrowRight size={15} /></button>; })}
              {!filteredNav.length ? <div className="empty-inline"><CircleHelp size={18} /><span>No authorized surface matches that query.</span></div> : null}
            </div>
            <div className="modal-foot"><span><Command size={13} /> Keyboard-first navigation</span><span>Source-owned permissions remain authoritative</span></div>
          </section>
        </div>
      ) : null}

      {syncOpen ? <SyncDrawer onClose={() => setSyncOpen(false)} onAction={announce} /> : null}
      {aiOpen ? <AiDrawer onClose={() => setAiOpen(false)} onAction={announce} /> : null}
      <div className="toast" role="status" aria-live="polite"><span className="signal-dot signal-dot-green" />{notice}</div>
    </div>
  );
}

function ViewportEvidence({ viewport }: { viewport: ReviewViewport }) {
  return <main className="viewport-evidence"><iframe className="viewport-evidence-frame" title={`Overview Operational Cockpit at ${viewport.width} by ${viewport.height}`} src="/" style={{ width: viewport.width, height: viewport.height }} /></main>;
}

function NavButton({ item, active, onSelect, compact = false }: { item: typeof navItems[number]; active: boolean; onSelect: (page: LabPage) => void; compact?: boolean }) {
  const Icon = item.icon;
  return <button className={"nav-item " + (active ? "nav-item-active " : "") + (compact ? "nav-item-compact" : "")} onClick={() => onSelect(item.id)} aria-current={active ? "page" : undefined} title={item.label}><span className="nav-icon"><Icon size={17} strokeWidth={active ? 2.25 : 1.8} /></span><span className="nav-label">{compact ? item.short : item.label}</span>{!compact && active ? <span className="nav-active-line" /> : null}</button>;
}

function PageHeader({ meta, onAction }: { meta: typeof pageMeta[Exclude<LabPage, "contracts">]; onAction: (message: string) => void }) {
  return <section className="page-header"><div className="page-header-top"><div className="breadcrumb-line"><span>Design lab</span><ChevronRight size={13} /><span>{meta.route}</span></div><div className="header-actions"><span className="source-chip"><span className="signal-dot signal-dot-blue" /> Source contract mapped</span><button className="quiet-button" onClick={() => onAction("Page help stays contextual to the selected source workspace")}><CircleHelp size={15} /> Page help</button><button className="icon-button" onClick={() => onAction("More actions remain source-owned")} aria-label="More page actions"><MoreHorizontal size={18} /></button></div></div><div className="page-header-copy"><div className="index-kicker"><span className="section-index">{meta.index}</span><span>{meta.eyebrow}</span></div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="page-header-meta"><div><span className="meta-label">Archetype</span><strong>{meta.archetype}</strong></div><div><span className="meta-label">Canonical layout</span><strong>{meta.layout}</strong></div><div><span className="meta-label">Interaction signature</span><strong>{meta.signature}</strong></div><div className="page-header-cta"><button className="primary-button" onClick={() => onAction(meta.primary + " · design interaction only")}>{meta.primary} <ArrowUpRight size={15} /></button></div></div></section>;
}

function OverviewPage({ onAction }: { onAction: (message: string) => void }) {
  const [selected, setSelected] = useState(0);
  const [reviewMode, setReviewMode] = useState<"cockpit" | "executive">("cockpit");
  const priorities = [
    { label: "Attendance verification", note: "A valid clock-out is still required to close the day.", tone: "coral", icon: Clock3, route: "module:attendance" },
    { label: "Expense decision", note: "Assigned maker-checker request with evidence attached.", tone: "apricot", icon: ClipboardIcon, route: "module:expense-approvals" },
    { label: "Production control", note: "A job is waiting at an existing evidence gate.", tone: "sky", icon: Factory, route: "module:production" },
  ];
  const reviewSwitch = <div className="overview-review-bar"><div className="overview-review-copy"><span className="eyebrow"><Activity size={13} /> Owner review surface</span><strong>Frozen checkpoint + contained cockpit study</strong><small>The accepted Executive Command remains available while this review tests a denser operational reading order.</small></div><div className="overview-review-toggle" role="group" aria-label="Overview design review mode"><button className={reviewMode === "cockpit" ? "overview-review-button overview-review-button-active" : "overview-review-button"} onClick={() => setReviewMode("cockpit")}><Zap size={14} /> Operational Cockpit study</button><button className={reviewMode === "executive" ? "overview-review-button overview-review-button-active" : "overview-review-button"} onClick={() => setReviewMode("executive")}><Sun size={14} /> Frozen Executive Command</button></div></div>;
  if (reviewMode === "cockpit") return <>{reviewSwitch}<OverviewCockpit onAction={onAction} /></>;
  return <>{reviewSwitch}<div className="hero-command-grid"><div className="hero-command-copy"><div className="eyebrow"><span className="signal-dot signal-dot-blue" /> 01 / Command surface</div><h2>Attention, arranged<br /><em>before urgency.</em></h2><p>Owner-first intelligence keeps the decision field quiet until a real source signal asks to be opened. The shell remains ready for every authorized business context.</p><div className="hero-action-row"><button className="primary-button" onClick={() => onAction("Attention queue opened · design interaction only")}><ListTodo size={16} /> Open attention queue</button><button className="secondary-button" onClick={() => onAction("Widget customization remains source-owned")}><SlidersHorizontal size={15} /> Customize view</button></div><div className="hero-footnote"><ShieldCheck size={14} /> Permission-aware surface · 5 business contexts · WAT anchored</div></div><div className="command-orbit" aria-label="Design fixture command orbit"><div className="orbit-sun"><Sun size={24} /><span>09:42</span><small>WAT</small></div><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-node orbit-node-a"><strong>03</strong><span>attention</span></div><div className="orbit-node orbit-node-b"><strong>05</strong><span>workspaces</span></div><div className="orbit-node orbit-node-c"><strong>01</strong><span>sync note</span></div><div className="orbit-caption"><span>FIXTURE</span><strong>Command field</strong><small>select a signal to inspect its source path</small></div></div></div><section className="overview-grid"><div className="priority-panel panel-surface"><PanelHeader eyebrow="Attention stack" title="Open the signal with a reason" action="View all" onAction={() => onAction("Full attention queue · design interaction only")} /><div className="priority-list">{priorities.map((item, index) => { const Icon = item.icon; return <button className={"priority-row " + (selected === index ? "priority-row-selected" : "")} key={item.label} onClick={() => { setSelected(index); onAction(item.label + " selected"); }}><span className={"priority-icon priority-icon-" + item.tone}><Icon size={17} /></span><span className="priority-copy"><strong>{item.label}</strong><small>{item.note}</small></span><span className="priority-index">0{index + 1}</span><ChevronRight size={16} /></button>; })}</div><div className="selection-foot"><span className="signal-dot signal-dot-coral" /> Selected source: {priorities[selected].route} <ArrowRight size={13} /></div></div><div className="rhythm-panel panel-surface"><PanelHeader eyebrow="Work rhythm" title="A week in one glance" action="Explain" onAction={() => onAction("Explain-this-metric opened · no live source connected")} /><div className="chart-intro"><span className="big-number">74<span>%</span></span><span className="delta positive"><ArrowUpRight size={13} /> fixture signal</span></div><Sparkline large tone="blue" points="0,96 44,79 88,82 132,52 176,67 220,38 264,50 308,25 352,40" /><div className="chart-axis"><span>Mon</span><span>Wed</span><span>Fri</span><span>Today</span></div><div className="compare-band"><span><i className="legend-dot legend-blue" /> Active work</span><strong>Design fixture</strong><span className="band-muted">No live metric connected</span></div></div><aside className="overview-rail"><div className="context-card context-card-blue"><div className="card-icon-row"><span className="icon-well icon-well-white"><Wifi size={15} /></span><span className="status-label">Connection health</span><MoreHorizontal size={16} /></div><strong>Cached shell is ready</strong><p>Source-owned sync activity is available when an authorized offline operation exists.</p><button className="text-button" onClick={() => onAction("Sync Activity Center opened")}>Open sync activity <ArrowUpRight size={13} /></button></div><div className="context-card"><div className="card-icon-row"><span className="icon-well icon-well-mint"><Sparkles size={15} /></span><span className="status-label">AI sidecar</span></div><strong>Explain the next signal</strong><p>Guidance can summarize a page, but it cannot invent an authoritative business value.</p><button className="text-button" onClick={() => onAction("AI guidance opened · guidance only")}>Ask for guidance <ArrowUpRight size={13} /></button></div><div className="tiny-provenance"><ShieldCheck size={14} /><span>Source mapping<br /><b>{sourceTruth.length} contracts retained</b></span></div></aside></section><section className="wide-strip"><div className="strip-label"><span className="eyebrow">Workspace constellation</span><strong>Five authorized business contexts</strong></div><div className="business-pills">{businessSwatches.map((business) => <button key={business.name} className="business-pill" onClick={() => onAction(business.name + " context selected · no live switch")}><span className={"business-mark business-mark-" + business.tone}>{business.mark}</span>{business.name}<ArrowUpRight size={13} /></button>)}</div></section></>;
}

function OverviewCockpit({ onAction }: { onAction: (message: string) => void }) {
  const [selected, setSelected] = useState(0);
  const lanes = [
    { code: "01", label: "Attendance verification", route: "module:attendance", state: "Needs review", tone: "coral", note: "Close the day only after the source clock condition is met." },
    { code: "02", label: "Expense decision", route: "module:expense-approvals", state: "Assigned queue", tone: "apricot", note: "Inspect evidence before any maker-checker action." },
    { code: "03", label: "Production control", route: "module:production", state: "Gate waiting", tone: "mint", note: "Follow the existing evidence gate to the authorized workspace." },
  ];
  const stages = [
    { label: "Source", state: "Session scope", icon: ShieldCheck },
    { label: "Evidence", state: "Unavailable", icon: CircleAlert },
    { label: "Decision", state: "Permission-gated", icon: Check },
    { label: "Close", state: "Source-owned", icon: RefreshCw },
  ];
  const selectedLane = lanes[selected];
  return <section className="overview-cockpit"><div className="cockpit-intro panel-surface"><div className="cockpit-intro-copy"><span className="eyebrow"><Zap size={13} /> 03 / Operational cockpit study</span><h2>Operate from the signal,<br /><em>not the noise.</em></h2><p>This contained refinement brings live-work patterns forward: triage the exception, trace its evidence path, then hand off to the existing authorized module.</p><div className="hero-action-row"><button className="primary-button" onClick={() => onAction("Operational attention queue opened · design interaction only")}><ListTodo size={16} /> Open attention queue</button><button className="secondary-button" onClick={() => onAction("Operational cockpit filters remain source-owned")}><SlidersHorizontal size={15} /> Filter scope</button></div><div className="hero-footnote"><ShieldCheck size={14} /> Existing route contracts · source-owned actions · design fixture only</div></div><div className="cockpit-beacon" aria-label="Operational signal beacon"><div className="beacon-core"><Activity size={24} /><strong>READY</strong><small>to inspect</small></div><span className="beacon-ring beacon-ring-one" /><span className="beacon-ring beacon-ring-two" /><span className="beacon-label beacon-label-top">scope</span><span className="beacon-label beacon-label-bottom">handoff</span></div></div><div className="cockpit-control-strip panel-surface"><div className="cockpit-control-title"><span className="eyebrow">Control strip</span><strong>Operational posture</strong><small>Qualitative source states only</small></div><div className="cockpit-control-cell"><span className="control-cell-icon control-cell-icon-blue"><ShieldCheck size={15} /></span><span><small>Access</small><strong>Session-scoped</strong></span></div><div className="cockpit-control-cell"><span className="control-cell-icon control-cell-icon-coral"><CircleAlert size={15} /></span><span><small>Queue</small><strong>Design fixture</strong></span></div><div className="cockpit-control-cell"><span className="control-cell-icon control-cell-icon-apricot"><Wifi size={15} /></span><span><small>Source</small><strong>Not connected</strong></span></div><div className="cockpit-control-cell"><span className="control-cell-icon control-cell-icon-mint"><RefreshCw size={15} /></span><span><small>Sync</small><strong>Cached shell</strong></span></div><button className="icon-button" onClick={() => onAction("Operational posture details opened")} aria-label="Open operational posture details"><MoreHorizontal size={18} /></button></div><div className="cockpit-workbench"><section className="cockpit-lanes panel-surface"><PanelHeader eyebrow="Attention lanes" title="Triage by consequence" action="View all" onAction={() => onAction("Full attention queue · design interaction only")} /><div className="cockpit-lane-list">{lanes.map((lane, index) => <button key={lane.label} className={"cockpit-lane cockpit-lane-" + lane.tone + (selected === index ? " cockpit-lane-selected" : "")} onClick={() => { setSelected(index); onAction(lane.label + " selected"); }}><span className="cockpit-lane-mark"><span>{lane.code}</span></span><span className="cockpit-lane-copy"><small>{lane.route}</small><strong>{lane.label}</strong><em>{lane.note}</em></span><span className="cockpit-lane-state">{lane.state}</span><ArrowUpRight size={15} /></button>)}</div><div className="cockpit-lane-foot"><span className="signal-dot signal-dot-coral" /> One selected signal at a time · evidence remains source-authoritative</div></section><section className="cockpit-flow-panel panel-surface"><PanelHeader eyebrow="Evidence flow" title="Trace before you act" action="Explain path" onAction={() => onAction("Source path explanation opened · guidance only")} /><div className="cockpit-flow" aria-label="Operational flow from source to close"><div className="cockpit-flow-track">{stages.map((stage, index) => { const Icon = stage.icon; return <div className="cockpit-stage" key={stage.label}><span className={"cockpit-stage-node cockpit-stage-node-" + (index === 0 ? "blue" : index === 1 ? "coral" : index === 2 ? "apricot" : "mint")}><Icon size={16} /></span><strong>{stage.label}</strong><small>{stage.state}</small></div>; })}</div><div className="cockpit-flow-pulse"><span /><span /><span /><small>selected path / {selectedLane.route}</small></div></div><div className="cockpit-selected-signal"><div><span className="eyebrow">Selected signal</span><strong>{selectedLane.label}</strong><p>{selectedLane.note}</p></div><span className="source-chip"><span className="signal-dot signal-dot-blue" /> {selectedLane.route}</span></div><div className="cockpit-route-note"><Route size={15} /><span>Next handoff stays in the source module. This page only frames the route.</span></div></section><aside className="cockpit-operator-rail"><div className="cockpit-rail-card cockpit-rail-card-blue"><div className="card-icon-row"><span className="icon-well icon-well-white"><PanelRight size={15} /></span><span className="status-label">Scope rail</span></div><strong>All authorized businesses</strong><p>Business and branch visibility remains session-derived. No hidden switch is introduced by the design.</p><div className="cockpit-business-list">{businessSwatches.map((business) => <span className="cockpit-business" key={business.name}><i className={"business-mark business-mark-" + business.tone}>{business.mark}</i>{business.name}</span>)}</div></div><div className="cockpit-rail-card"><div className="card-icon-row"><span className="icon-well icon-well-mint"><RefreshCw size={15} /></span><span className="status-label">Sync activity</span></div><strong>Cached shell is ready</strong><p>Queued, retrying, conflict, and terminal failure states remain owned by the existing offline contract.</p><button className="text-button" onClick={() => onAction("Sync Activity Center opened")}>Open sync activity <ArrowUpRight size={13} /></button></div><div className="cockpit-rail-foot"><Sparkles size={14} /><span><b>AI guidance only</b><br />Explain the visible path; never invent a business value.</span></div></aside></div><div className="cockpit-footline"><span><CircleAlert size={14} /> Data state: integration unavailable · no live queue connected</span><span><ShieldCheck size={14} /> Permission and business boundaries preserved</span></div></section>;
}

function WorkPage({ onAction }: { onAction: (message: string) => void }) {
  const [activeTask, setActiveTask] = useState(0);
  const tasks = [
    { title: "Complete profile details", meta: "My Profile · 3 fields left", progress: 68, icon: UserRound, tone: "blue" },
    { title: "Review attendance day", meta: "Attendance & GPS · verification", progress: 42, icon: Clock3, tone: "coral" },
    { title: "Resume expense request", meta: "My Expense Requests · saved draft", progress: 26, icon: FileText, tone: "mint" },
  ];
  return <section className="work-layout"><div className="focus-rail panel-surface"><PanelHeader eyebrow="Focus rail" title="Your next three" action="Reorder" onAction={() => onAction("Task ordering is a source-owned preference")} /><div className="focus-list">{tasks.map((task, index) => { const Icon = task.icon; return <button key={task.title} className={"focus-task " + (activeTask === index ? "focus-task-active" : "")} onClick={() => { setActiveTask(index); onAction(task.title + " focused"); }}><span className={"focus-number focus-number-" + task.tone}>0{index + 1}</span><span className="focus-task-copy"><strong>{task.title}</strong><small>{task.meta}</small><span className="micro-progress"><i style={{ width: task.progress + "%" }} /></span></span><Icon size={16} /></button>; })}</div><div className="focus-note"><Sparkles size={14} /><span><b>Guidance:</b> start with the item that has the nearest source-defined deadline.</span></div></div><div className="next-action-canvas"><div className="canvas-topline"><span className="eyebrow">Current focus / source action</span><span className="cached-tag"><span className="signal-dot signal-dot-green" /> ready</span></div><div className="next-action-card"><div className="next-action-decoration"><span>FOCUS</span><span>02 / 08</span></div><span className="icon-well icon-well-large icon-well-blue"><UserRound size={21} /></span><h3>{tasks[activeTask].title}</h3><p>{activeTask === 0 ? "Complete the remaining identity fields so your authorized profile is ready for the next workflow." : activeTask === 1 ? "Review the valid clock-in / clock-out state. Login alone is not attendance." : "Continue the source-approved local draft; attachments remain bounded by the existing offline contract."}</p><div className="next-action-checks"><div className="check-row"><span className="check-circle check-circle-done"><Check size={13} /></span><span>Context loaded from authorized session</span><small>done</small></div><div className="check-row"><span className="check-circle" /><span>{activeTask === 1 ? "Verification conditions available" : "Required fields remain"}</span><small>next</small></div><div className="check-row"><span className="check-circle" /><span>Source action confirmation</span><small>after</small></div></div><button className="primary-button full-button" onClick={() => onAction(tasks[activeTask].title + " opened · design interaction only")}>Continue task <ArrowRight size={15} /></button></div><div className="flow-steps"><span className="flow-step flow-step-active"><b>01</b> orient</span><span className="flow-line" /><span className="flow-step"><b>02</b> work</span><span className="flow-line" /><span className="flow-step"><b>03</b> close</span></div></div><aside className="work-context-rail"><div className="rail-note rail-note-mint"><div className="rail-note-head"><span className="icon-well icon-well-mint"><CircleCheck size={15} /></span><span>Progressive disclosure</span></div><strong>Context stays attached.</strong><p>Secondary modules remain one click away so My Workspace stays personal, not crowded.</p></div><div className="rail-note"><div className="rail-note-head"><span className="icon-well icon-well-sky"><RefreshCw size={15} /></span><span>Offline contract</span></div><strong>Drafts can wait safely.</strong><p>Only source-approved operations appear in the queue. Failed sync is never presented as complete.</p><button className="text-button" onClick={() => onAction("Sync Activity Center opened")}>Inspect sync state <ArrowUpRight size={13} /></button></div></aside></section>;
}

function ApprovalsPage({ onAction }: { onAction: (message: string) => void }) {
  const [selected, setSelected] = useState(0);
  const requests = [
    { id: "EX-204", title: "Material delivery evidence", owner: "Assigned request · Printing", amount: "Design fixture", age: "Awaiting review", tone: "coral" },
    { id: "EX-198", title: "Vehicle service parts", owner: "Assigned request · Autos", amount: "Design fixture", age: "1 day in queue", tone: "blue" },
    { id: "EX-193", title: "Route expense evidence", owner: "Assigned request · Logistics", amount: "Design fixture", age: "2 days in queue", tone: "mint" },
  ];
  return <section className="approval-workspace"><div className="approval-queue panel-surface"><PanelHeader eyebrow="Assigned queue" title="Maker-checker queue" action="Filter" onAction={() => onAction("Approval filters opened")} /><div className="queue-summary"><span><b>03</b> in review</span><span className="queue-summary-muted">source data unavailable</span></div><div className="approval-list">{requests.map((request, index) => <button key={request.id} className={"approval-row " + (selected === index ? "approval-row-selected" : "")} onClick={() => { setSelected(index); onAction(request.id + " selected"); }}><span className={"approval-status approval-status-" + request.tone}><span /></span><span className="approval-row-copy"><strong>{request.title}</strong><small>{request.owner}</small></span><span className="approval-row-age">{request.age}</span><ChevronRight size={15} /></button>)}</div><button className="queue-bottom-action" onClick={() => onAction("Approval queue refreshed · design interaction only")}><RefreshCw size={14} /> Refresh assigned queue</button></div><div className="approval-detail"><div className="detail-topline"><span className="eyebrow">Selected request / evidence first</span><span className="source-chip"><span className="signal-dot signal-dot-apricot" /> {requests[selected].id}</span></div><div className="detail-title-row"><div><span className="detail-kicker">Expense Approval Queue</span><h3>{requests[selected].title}</h3><p>{requests[selected].owner}</p></div><button className="icon-button" onClick={() => onAction("Request detail menu opened")} aria-label="Request detail menu"><MoreHorizontal size={18} /></button></div><div className="evidence-grid"><div className="evidence-card evidence-card-large"><span className="evidence-label">Source evidence</span><strong>Attachment / detail unavailable</strong><p>The prototype keeps the inspection region visible while the source API is disconnected. No amount, vendor, or approval truth is invented.</p><div className="unavailable-row"><CircleAlert size={15} /> Integration unavailable · dependent fields disabled</div></div><div className="evidence-card"><span className="evidence-label">Requested scope</span><strong>Permission Required</strong><p>Effective company, branch, and department scope comes from the session context.</p><span className="scope-lock"><ShieldCheck size={14} /> server-derived</span></div><div className="evidence-card"><span className="evidence-label">Audit posture</span><strong>Decision is traceable</strong><p>Approval, return, and rejection actions keep the source audit trail intact.</p><span className="scope-lock"><Activity size={14} /> audit event expected</span></div></div><div className="decision-history"><div className="history-line"><span className="history-node history-node-done"><Check size={12} /></span><div><strong>Request submitted</strong><small>Source event · timestamp unavailable</small></div></div><div className="history-connector" /><div className="history-line"><span className="history-node history-node-current"><span /></span><div><strong>Assigned for review</strong><small>Current decision checkpoint</small></div></div><div className="history-connector" /><div className="history-line history-line-muted"><span className="history-node" /><div><strong>Approve / return / reject</strong><small>Requires existing permission</small></div></div></div><div className="decision-bar"><div><span className="eyebrow">Decision bar</span><strong>Choose only after evidence inspection</strong></div><div className="decision-actions"><button className="secondary-button" onClick={() => onAction("Request returned for clarification · design interaction only")}>Return</button><button className="secondary-button button-danger" onClick={() => onAction("Request rejected · design interaction only")}>Reject</button><button className="primary-button" onClick={() => onAction("Request approved · design interaction only")}>Approve <Check size={15} /></button></div></div></div><aside className="approval-rail"><div className="rail-note rail-note-apricot"><div className="rail-note-head"><span className="icon-well icon-well-apricot"><Bot size={15} /></span><span>AI sidecar</span></div><strong>Explain the request</strong><p>AI may summarize visible evidence and policy guidance. It cannot create a missing amount or approval rule.</p><button className="text-button" onClick={() => onAction("AI explanation requested · source data unavailable")}>Explain this request <ArrowUpRight size={13} /></button></div><div className="rail-note"><div className="rail-note-head"><span className="icon-well icon-well-blue"><PanelRight size={15} /></span><span>Detail model</span></div><strong>Keep the record in view.</strong><p>Queue selection preserves decision context and supports keyboard movement across assigned requests.</p></div></aside></section>;
}

function TeamPage({ onAction }: { onAction: (message: string) => void }) {
  const roster = [
    { name: "Authorized employee record", role: "Role and department from session scope", state: "available", label: "Ready to inspect" },
    { name: "People record", role: "Emergency / pension / payroll-bank fields", state: "review", label: "Sensitive detail gated" },
    { name: "Team follow-up", role: "HR workflow cross-link", state: "quiet", label: "No live queue" },
    { name: "Attendance context", role: "Valid clock state only", state: "review", label: "Needs verification" },
  ];
  return <section className="team-cockpit"><div className="control-strip"><div className="control-strip-title"><span className="eyebrow">Control strip</span><strong>People operations posture</strong></div><div className="control-readout"><span className="readout-dot readout-dot-green" /><strong>Scope online</strong><small>session-derived</small></div><div className="control-readout"><span className="readout-dot readout-dot-blue" /><strong>Records protected</strong><small>permission-gated</small></div><div className="control-readout"><span className="readout-dot readout-dot-apricot" /><strong>Detail on demand</strong><small>progressive disclosure</small></div><button className="icon-button" onClick={() => onAction("People operations filter opened")} aria-label="Filter people operations"><SlidersHorizontal size={17} /></button></div><div className="team-grid"><div className="team-roster panel-surface"><PanelHeader eyebrow="Scoped people atlas" title="Authorized records" action="Search" onAction={() => onAction("People search opened")} /><div className="roster-head"><span>Record</span><span>Work context</span><span>Status</span></div><div className="roster-list">{roster.map((person, index) => <button key={person.name} className="roster-row" onClick={() => onAction(person.name + " selected · detail drawer")}><span className="roster-avatar">{index === 0 ? "AD" : index === 1 ? "HR" : index === 2 ? "WF" : "AT"}</span><span className="roster-copy"><strong>{person.name}</strong><small>{person.role}</small></span><span className={"roster-state roster-state-" + person.state}><span />{person.label}</span><ChevronRight size={15} /></button>)}</div><div className="roster-foot"><ShieldCheck size={14} /> Only fields authorized for this scope expand in the source implementation.</div></div><div className="team-heatmap panel-surface"><PanelHeader eyebrow="Workload map" title="A week of operating rhythm" action="Explain" onAction={() => onAction("Workload explanation opened · fixture only")} /><div className="heatmap-legend"><span><i className="heat-low" /> light</span><span><i className="heat-mid" /> active</span><span><i className="heat-high" /> focus</span><span className="fixture-label">design fixture</span></div><div className="heatmap">{["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, dayIndex) => <div className="heatmap-column" key={day}><span className="heatmap-day">{day}</span>{Array.from({ length: 7 }).map((_, rowIndex) => <span key={rowIndex} className={"heat-cell heat-" + ((dayIndex * 3 + rowIndex) % 4)} />)}</div>)}</div><div className="heatmap-callout"><span className="callout-number">02</span><span><strong>Attention windows</strong><small>Use real source attendance/work data when connected.</small></span><ArrowUpRight size={14} /></div></div><aside className="team-side-rail"><div className="capacity-ring"><div className="capacity-ring-inner"><strong>64</strong><span>fixture index</span></div></div><span className="eyebrow">Team signal</span><h3>Keep people detail close to the work.</h3><p>The atlas prioritizes scope, completeness, and next action before sensitive identity fields.</p><button className="text-button" onClick={() => onAction("HR workflow link opened · design interaction only")}>Open HR workflows <ArrowUpRight size={13} /></button></aside></div></section>;
}

function InsightPage({ onAction }: { onAction: (message: string) => void }) {
  const [story, setStory] = useState(0);
  const stories = [
    { tag: "Cross-business signal", title: "The quietest risk is the one without a source.", copy: "Owner Intelligence can frame an exception, then hand the reader to the authoritative module. When the source is unavailable, the story says so.", tone: "blue" },
    { tag: "Data availability", title: "Make provenance part of the reading experience.", copy: "Every comparison band is paired with a source status so executive usefulness never depends on decorative certainty.", tone: "mint" },
    { tag: "Next action", title: "A briefing should end in a route.", copy: "The last move in the narrative is always a permission-aware deep link to the existing workspace action.", tone: "apricot" },
  ];
  return <section className="insight-magazine"><div className="magazine-lead"><div className="lead-copy"><span className="eyebrow"><Sparkles size={13} /> Owner-only briefing canvas</span><h3>{stories[story].title}</h3><p>{stories[story].copy}</p><div className="lead-actions"><button className="primary-button" onClick={() => onAction("Source path opened · design interaction only")}>Trace source path <ArrowRight size={15} /></button><button className="secondary-button" onClick={() => onAction("Metric explanation requested · no live data connected")}>Explain metric <CircleHelp size={15} /></button></div></div><div className={"story-visual story-visual-" + stories[story].tone}><div className="story-visual-top"><span>{stories[story].tag}</span><span>DESIGN FIXTURE</span></div><div className="story-bars"><span style={{ height: "46%" }} /><span style={{ height: "67%" }} /><span style={{ height: "40%" }} /><span style={{ height: "82%" }} /><span style={{ height: "57%" }} /><span style={{ height: "93%" }} /><span style={{ height: "71%" }} /><span style={{ height: "52%" }} /></div><div className="story-line"><span /><span /><span /><span /><span /></div><div className="story-visual-caption"><strong>Signal field</strong><small>Comparison shape only · source not connected</small></div></div></div><div className="magazine-body"><div className="story-index"><span className="eyebrow">Briefing index</span>{stories.map((item, index) => <button key={item.title} className={"story-index-row " + (story === index ? "story-index-row-active" : "")} onClick={() => { setStory(index); onAction("Briefing story 0" + (index + 1) + " selected"); }}><span>0{index + 1}</span><strong>{item.tag}</strong><ChevronRight size={15} /></button>)}<div className="story-source-note"><ShieldCheck size={14} /><span>Source status is visible beside every narrative.</span></div></div><div className="insight-table"><PanelHeader eyebrow="Comparison bands" title="Signal / source / next route" action="Save view" onAction={() => onAction("Saved view preference is source-owned")} />{[["Attendance", "Needs authorized data", "Attendance & GPS", "Cobalt"], ["Spend", "Permission Required", "Expense Approval Queue", "Coral"], ["Production", "Unavailable", "Production Control", "Mint"], ["Fleet", "No authorized data", "Logistics ERP", "Apricot"]].map((row) => <button className="signal-band" key={row[0]} onClick={() => onAction(row[0] + " source route selected")}><span className={"band-swatch band-swatch-" + row[3].toLowerCase()} /><strong>{row[0]}</strong><span className="signal-band-state">{row[1]}</span><span className="signal-band-route">{row[2]}</span><ArrowUpRight size={14} /></button>)}</div><aside className="magazine-rail"><div className="magazine-rail-card"><span className="eyebrow">AI reading aid</span><Bot size={22} /><strong>Summarize this page</strong><p>Returns guidance about visible signals only. No authoritative values are created here.</p><button className="text-button" onClick={() => onAction("Page summary requested · guidance only")}>Summarize visible signals <ArrowUpRight size={13} /></button></div><div className="freshness-card"><span className="freshness-line"><span className="signal-dot signal-dot-apricot" /> Source status</span><strong>NOT CONNECTED</strong><small>This story is safe to review as a design fixture.</small></div></aside></div></section>;
}

function PrintingPage({ onAction }: { onAction: (message: string) => void }) {
  const lanes = [
    { label: "Enquiry", count: "02", tone: "sky", jobs: ["PT-104", "PT-101"] },
    { label: "Artwork / Proof", count: "01", tone: "apricot", jobs: ["PT-098"] },
    { label: "Production", count: "03", tone: "cobalt", jobs: ["PT-094", "PT-091", "PT-089"] },
    { label: "QC", count: "01", tone: "mint", jobs: ["PT-086"] },
    { label: "Delivery", count: "02", tone: "coral", jobs: ["PT-083", "PT-079"] },
  ];
  return <section className="production-board"><div className="production-board-head"><div><span className="eyebrow"><Factory size={13} /> Printing & Technology / flow board</span><h3>Jobs move through evidence.</h3><p>Stages mirror the existing Printing workflow. Cards are fixture references, not live jobs.</p></div><div className="board-controls"><button className="secondary-button" onClick={() => onAction("Print job filter opened")}><ListFilter size={15} /> Filter</button><button className="primary-button" onClick={() => onAction("Create Print Job · design interaction only")}>Create Print Job <ArrowUpRight size={15} /></button></div></div><div className="flow-health"><div className="flow-health-label"><span className="signal-dot signal-dot-green" /> WIP flow</div><div className="flow-health-line"><span className="flow-progress" /><i /><i /><i /><i /></div><span className="fixture-label">Design fixture · all job values unavailable</span></div><div className="board-lanes">{lanes.map((lane) => <div className="board-lane" key={lane.label}><div className="lane-head"><span className={"lane-marker lane-marker-" + lane.tone} /><strong>{lane.label}</strong><span className="lane-count">{lane.count}</span><MoreHorizontal size={16} /></div><div className="lane-cards">{lane.jobs.map((job, index) => <button key={job} className="job-card" onClick={() => onAction(job + " opened · production detail drawer")}><div className="job-card-top"><span className="job-id">{job}</span><span className="job-time">{index === 0 ? "today" : "queued"}</span></div><strong>{lane.label === "Production" ? "Production job" : lane.label === "QC" ? "Quality check" : "Print workflow item"}</strong><span className="job-card-meta"><Package size={13} /> materials / proof / handoff</span><span className="job-card-foot"><span className={"job-avatar job-avatar-" + lane.tone}>{index + 1}</span><span>Source stage contract</span><ChevronRight size={14} /></span></button>)}</div><button className="lane-add" onClick={() => onAction("Add item to " + lane.label + " · source action")}><span>+</span> Add stage item</button></div>)}</div><div className="production-foot"><div><ShieldCheck size={14} /><span>Material issue, waste, QC, delivery, files, and notes remain source-owned.</span></div><button className="text-button" onClick={() => onAction("Production Control opened · design interaction only")}>Open Production Control <ArrowUpRight size={13} /></button></div></section>;
}

function BakeryPage({ onAction }: { onAction: (message: string) => void }) {
  const [selected, setSelected] = useState("Batch → yield");
  const steps = [
    { title: "Ingredients", detail: "Issue against recipe / BOM", value: "source", tone: "sky", icon: Package },
    { title: "Batch → yield", detail: "Actual yield and waste", value: "focus", tone: "apricot", icon: Factory },
    { title: "Dispatch", detail: "Custodian / returns", value: "guard", tone: "mint", icon: Truck },
    { title: "Remittance", detail: "Bread & money ledger", value: "source", tone: "cobalt", icon: Zap },
  ];
  return <section className="bakery-reconciliation"><div className="recon-intro"><div><span className="eyebrow"><Package size={13} /> Bakery / accountability spine</span><h3>Production has a balance sheet.</h3><p>Bakery uses a batch-to-money line so yield, waste, dispatch, remittance, and close are investigated as one operating chain.</p></div><div className="close-pulse"><span className="pulse-ring"><CircleCheck size={17} /></span><span><small>Close posture</small><strong>Evidence required</strong></span></div></div><div className="recon-spine">{steps.map((step, index) => { const Icon = step.icon; return <div className="recon-step-wrap" key={step.title}><button className={"recon-step recon-step-" + step.tone + " " + (selected === step.title ? "recon-step-active" : "")} onClick={() => { setSelected(step.title); onAction(step.title + " selected"); }}><span className="recon-step-index">0{index + 1}</span><span className="recon-step-icon"><Icon size={17} /></span><span className="recon-step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span><ArrowUpRight size={14} /></button>{index < steps.length - 1 ? <span className="recon-connector"><i /></span> : null}</div>; })}</div><div className="bakery-detail-grid"><div className="ledger-panel panel-surface"><PanelHeader eyebrow={"Selected ledger / " + selected} title="Accountability view" action="Open reports" onAction={() => onAction("Bakery reports opened · design interaction only")} /><div className="ledger-summary"><div><span className="ledger-label">Today’s sales</span><strong>Not Available</strong><small>API source disconnected</small></div><div><span className="ledger-label">Batch variance</span><strong>Evidence required</strong><small>Zero-variance close guard</small></div><div><span className="ledger-label">Remittance</span><strong>Permission Required</strong><small>Scope-controlled</small></div></div><div className="ledger-table"><div className="ledger-row ledger-row-head"><span>Ledger line</span><span>State</span><span>Evidence</span><span /></div>{["Batch ingredient issue", "Actual yield / waste", "Dispatch custody", "Returns / shortages"].map((line, index) => <button className="ledger-row" key={line} onClick={() => onAction(line + " opened · evidence drawer")}><span><i className={"ledger-dot ledger-dot-" + (index % 2 ? "apricot" : "blue")} />{line}</span><span>{index === 1 ? "Needs review" : "Unavailable"}</span><span>{index === 2 ? "Location + custodian" : "Source evidence"}</span><ChevronRight size={14} /></button>)}</div></div><aside className="bakery-side-rail"><div className="variance-card"><span className="eyebrow">Zero-variance close</span><div className="variance-gauge"><div><strong>—</strong><small>no live value</small></div></div><p>Close remains blocked until the source-defined accountability evidence exists.</p><button className="text-button" onClick={() => onAction("Open investigation workspace · design interaction only")}>Open investigation <ArrowUpRight size={13} /></button></div><div className="bakery-action-card"><div className="card-icon-row"><span className="icon-well icon-well-apricot"><WheatIcon /></span><span className="status-label">Operational controls</span></div><strong>Products, recipes, POS, batches</strong><p>Use the real Bakery tabs and permission gates behind this composition.</p><button className="text-button" onClick={() => onAction("Products & Recipes tab selected")}>Open products & recipes <ArrowUpRight size={13} /></button></div></aside></div></section>;
}

function WheatIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21V5M12 12c-3.6 0-6-2.2-6-5 3.6 0 6 2.2 6 5Zm0 4c3.6 0 6-2.2 6-5-3.6 0-6 2.2-6 5ZM12 9c-3-1-4.6-3.2-4.4-5.6C10.2 3.5 12 5.6 12 9Zm0 3c3 0 4.6-2.2 4.4-5.6C13.8 6.5 12 8.6 12 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AutosPage({ onAction }: { onAction: (message: string) => void }) {
  const [bay, setBay] = useState(1);
  const bays = [
    { id: "BAY 01", label: "Inspection", status: "ready", job: "Vehicle record" },
    { id: "BAY 02", label: "Service", status: "active", job: "Work order" },
    { id: "BAY 03", label: "Bodywork", status: "hold", job: "Parts dependency" },
    { id: "BAY 04", label: "Detailing", status: "quiet", job: "No authorized detail" },
  ];
  return <section className="autos-workshop"><div className="workshop-topline"><div><span className="eyebrow"><Wrench size={13} /> Autos / workshop floor</span><h3>See the bay before the work order.</h3><p>Vehicle inventory, landed cost, workshop status, mechanics, spares, and fleet history sit in one spatial model.</p></div><div className="workshop-filters"><button className="filter-chip filter-chip-active" onClick={() => onAction("Workshop scope: authorized records")}>All bays</button><button className="filter-chip" onClick={() => onAction("Mechanic filter is source-owned")}>Mechanics</button><button className="filter-chip" onClick={() => onAction("Parts filter is source-owned")}>Spares</button></div></div><div className="bay-map"><div className="bay-map-grid" aria-label="Design fixture workshop bay map"><div className="map-axis map-axis-x"><span>service lane</span><span>parts lane</span><span>handoff</span></div><div className="map-axis map-axis-y"><span>north bay</span><span>south bay</span></div><div className="bay-cards">{bays.map((item, index) => <button key={item.id} className={"bay-card bay-card-" + item.status + " " + (bay === index ? "bay-card-selected" : "")} onClick={() => { setBay(index); onAction(item.id + " selected"); }}><div className="bay-card-top"><span>{item.id}</span><span className={"bay-state bay-state-" + item.status}><i />{item.status}</span></div><span className="bay-car"><span className="car-front" /><span className="car-body" /><span className="car-wheel car-wheel-a" /><span className="car-wheel car-wheel-b" /></span><strong>{item.label}</strong><small>{item.job}</small><span className="bay-card-foot"><span>detail drawer</span><ChevronRight size={14} /></span></button>)}</div></div><div className="bay-map-legend"><span><i className="legend-square legend-square-green" /> ready</span><span><i className="legend-square legend-square-blue" /> active</span><span><i className="legend-square legend-square-apricot" /> hold</span><span className="fixture-label">layout concept · no live vehicle positions</span></div></div><div className="autos-detail-grid"><div className="vehicle-detail panel-surface"><div className="detail-topline"><span className="eyebrow">Selected bay / {bays[bay].id}</span><span className="source-chip"><span className="signal-dot signal-dot-blue" /> vehicle detail</span></div><h4>{bays[bay].label} workspace</h4><p>{bays[bay].job} remains visible with the service context attached. VIN, landed cost, mechanic, spares, and history are source-defined fields.</p><div className="vehicle-metrics"><div><span>Vehicle</span><strong>Not Available</strong></div><div><span>Work order</span><strong>Permission Required</strong></div><div><span>Parts</span><strong>Unavailable</strong></div></div><button className="primary-button" onClick={() => onAction("Open work order · design interaction only")}>Open work order <ArrowRight size={15} /></button></div><aside className="service-timeline panel-surface"><PanelHeader eyebrow="Service dependency graph" title="What has to move next?" action="View history" onAction={() => onAction("Vehicle history opened · design interaction only")} /><div className="dependency-list">{["Vehicle inspection", "Mechanic assignment", "Parts availability", "QC / delivery"].map((line, index) => <div className={"dependency-row " + (index === 1 ? "dependency-row-active" : "")} key={line}><span className={"dependency-node dependency-node-" + index} />{index < 3 ? <span className="dependency-link" /> : null}<span><strong>{line}</strong><small>{index === 1 ? "current dependency" : "source status required"}</small></span><ChevronRight size={14} /></div>)}</div></aside></div></section>;
}

function LogisticsPage({ onAction }: { onAction: (message: string) => void }) {
  const [routeNode, setRouteNode] = useState(2);
  const nodes = [
    { label: "Origin", sub: "Pickup", tone: "blue" },
    { label: "En route", sub: "Driver event", tone: "mint" },
    { label: "Handoff", sub: "POD checkpoint", tone: "apricot" },
    { label: "Destination", sub: "Delivery", tone: "coral" },
  ];
  return <section className="logistics-dispatch"><div className="dispatch-toolbar"><div><span className="eyebrow"><Route size={13} /> Logistics / dispatch control</span><h3>Route, flow, proof.</h3><p>Dispatch is a corridor of operational events. Select a node to inspect the source-owned trip feed.</p></div><div className="dispatch-actions"><span className="connection-tag"><span className="signal-dot signal-dot-green" /> route shell ready</span><button className="primary-button" onClick={() => onAction("Create shipment order · design interaction only")}>Create shipment <ArrowUpRight size={15} /></button></div></div><div className="route-canvas"><div className="route-canvas-head"><span className="eyebrow">Trip board / design fixture</span><span className="fixture-label">GPS + POD values unavailable</span></div><div className="route-map"><svg className="route-svg" viewBox="0 0 800 240" preserveAspectRatio="none" aria-hidden="true"><path d="M52 171 C170 55 249 208 358 111 S566 60 745 151" fill="none" stroke="#b8d2e7" strokeWidth="2" strokeDasharray="8 9" /><path d="M52 171 C170 55 249 208 358 111" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" /><circle cx="52" cy="171" r="7" fill="#fff" stroke="#2563eb" strokeWidth="3" /><circle cx="170" cy="96" r="7" fill="#fff" stroke="#48b98a" strokeWidth="3" /><circle cx="358" cy="111" r="8" fill="#fff" stroke="#ef9b4e" strokeWidth="4" /><circle cx="566" cy="84" r="7" fill="#fff" stroke="#b8d2e7" strokeWidth="3" /><circle cx="745" cy="151" r="7" fill="#fff" stroke="#ef7d6c" strokeWidth="3" /></svg><div className="route-node-row">{nodes.map((node, index) => <button key={node.label} className={"route-node route-node-" + node.tone + " " + (routeNode === index ? "route-node-selected" : "")} onClick={() => { setRouteNode(index); onAction(node.label + " node selected"); }}><span className="route-node-dot"><span /></span><span><strong>{node.label}</strong><small>{node.sub}</small></span></button>)}</div><div className="route-distance"><span>TRIP / fixture</span><strong>Route shape only</strong><small>Distance and ETA are not available.</small></div></div></div><div className="dispatch-bottom-grid"><div className="dispatch-feed panel-surface"><PanelHeader eyebrow={"Operational feed / " + nodes[routeNode].label} title="Trip events" action="Filter events" onAction={() => onAction("Trip event filter opened")} /><div className="feed-list">{["Dispatch created", "Driver / fleet assigned", "Route event expected", "Proof of delivery checkpoint"].map((event, index) => <button key={event} className="feed-row" onClick={() => onAction(event + " selected")}><span className={"feed-time feed-time-" + index}>{index === 0 ? "09:10" : "—"}</span><span className="feed-dot"><i /></span><span className="feed-copy"><strong>{event}</strong><small>{index === 0 ? "source event available in contract" : "Not Available"}</small></span><ChevronRight size={14} /></button>)}</div></div><aside className="dispatch-side"><div className="dispatch-card dispatch-card-blue"><span className="eyebrow">Selected trip</span><strong>Trip detail unavailable</strong><p>Fleet, driver, shipment, expense, and POD fields remain in the existing Logistics API contract.</p><button className="text-button" onClick={() => onAction("Open trip detail · design interaction only")}>Open trip detail <ArrowUpRight size={13} /></button></div><div className="dispatch-card"><span className="eyebrow">Exception pulse</span><div className="exception-pulse"><CircleAlert size={16} /><strong>Proof checkpoint</strong><span>Needs source status</span></div><small>Never mark delivery complete before the existing POD rule is satisfied.</small></div></aside></div></section>;
}

function AdminPage({ onAction }: { onAction: (message: string) => void }) {
  const [setting, setSetting] = useState(0);
  const settings = [
    { title: "Attendance geofence", group: "Attendance controls", state: "Source policy", icon: MapPin },
    { title: "Offline-first guardrails", group: "Sync & sessions", state: "Inherited", icon: RefreshCw },
    { title: "Default appearance", group: "Theme policy", state: "Preview only", icon: Sun },
    { title: "Role-data reminders", group: "Accountability", state: "Owner/Admin", icon: Bell },
  ];
  return <section className="admin-studio"><div className="studio-topline"><div><span className="eyebrow"><Settings2 size={13} /> Administration / policy studio</span><h3>Make the boundary legible.</h3><p>Policy changes need a visible effective scope, precedence, and recovery path. This is a design surface for the existing Admin Setup contract.</p></div><div className="studio-top-actions"><span className="source-chip"><span className="signal-dot signal-dot-blue" /> owner/admin gate</span><button className="primary-button" onClick={() => onAction("Save policy draft · design interaction only")}>Save draft <ArrowUpRight size={15} /></button></div></div><div className="studio-grid"><div className="studio-nav panel-surface"><PanelHeader eyebrow="Control families" title="Policy canvas" action="Search" onAction={() => onAction("Admin policy search opened")} /><div className="studio-setting-list">{settings.map((item, index) => { const Icon = item.icon; return <button key={item.title} className={"studio-setting " + (setting === index ? "studio-setting-active" : "")} onClick={() => { setSetting(index); onAction(item.title + " selected"); }}><span className="studio-setting-icon"><Icon size={16} /></span><span><strong>{item.title}</strong><small>{item.group}</small></span><span className="setting-state">{item.state}</span><ChevronRight size={14} /></button>; })}</div><div className="studio-nav-foot"><ShieldCheck size={14} /> Effective permissions are server-derived.</div></div><div className="policy-canvas panel-surface"><div className="policy-canvas-head"><div><span className="eyebrow">Effective policy / selected control</span><h4>{settings[setting].title}</h4></div><button className="icon-button" onClick={() => onAction("Policy history opened")} aria-label="Open policy history"><Activity size={17} /></button></div><div className="precedence-map"><div className="precedence-column"><span className="precedence-label">01 / Owner policy</span><div className="precedence-card precedence-card-blue"><strong>Group default</strong><small>Configured by owner/admin</small><span><Check size={12} /> source precedence</span></div></div><ArrowDownRight className="precedence-arrow" size={20} /><div className="precedence-column"><span className="precedence-label">02 / Business scope</span><div className="precedence-card precedence-card-mint"><strong>Assigned business</strong><small>Printing · Bakery · Autos · Logistics · Properties</small><span><Check size={12} /> scope filter</span></div></div><ArrowDownRight className="precedence-arrow" size={20} /><div className="precedence-column"><span className="precedence-label">03 / Employee override</span><div className="precedence-card precedence-card-apricot"><strong>Individual rule</strong><small>Only where source permission allows</small><span><CircleAlert size={12} /> review required</span></div></div></div><div className="policy-controls"><div className="policy-control-row"><span><strong>Effective value</strong><small>Design fixture · no live policy read</small></span><button className="toggle toggle-on" onClick={() => onAction("Policy toggle staged · design interaction only")}><span /></button></div><div className="policy-control-row"><span><strong>Applies to</strong><small>Authorized scope only</small></span><button className="select-like" onClick={() => onAction("Scope selector opened")}>Assigned business <ChevronDown size={14} /></button></div><div className="policy-control-row"><span><strong>Rollback</strong><small>History remains source-owned</small></span><button className="secondary-button" onClick={() => onAction("Rollback history opened")}>View history <ArrowUpRight size={13} /></button></div></div></div><aside className="studio-inspector"><div className="inspector-card inspector-card-sky"><span className="eyebrow">Inspector</span><strong>What changes?</strong><p>Only the presentation changes in this lab. The underlying policy API, permission checks, and audit behavior remain untouched.</p><div className="inspector-list"><span><CircleCheck size={14} /> effective scope visible</span><span><CircleCheck size={14} /> rollback affordance</span><span><CircleCheck size={14} /> reduced motion ready</span></div></div><div className="inspector-card"><span className="eyebrow">Unavailable truth</span><strong>Live policy value</strong><p>Not Available. This preview never connects production settings or credentials.</p><button className="text-button" onClick={() => onAction("Policy source health opened")}>Inspect source health <ArrowUpRight size={13} /></button></div></aside></div></section>;
}

function ContractPage({ query, setQuery, rows, onAction }: { query: string; setQuery: (value: string) => void; rows: ContractRow[]; onAction: (message: string) => void }) {
  return <section className="contract-page"><div className="contract-hero"><div><div className="eyebrow"><FileText size={13} /> Design authority / mandatory contract</div><h2>Every page has a reason to exist.</h2><p>The matrix below is generated from the audited source surfaces and captures route, authority, behavior, data states, archetype, and responsive intent before implementation.</p></div><div className="contract-stats"><div><strong>{routeSurfaceCount}</strong><span>route surfaces</span></div><div><strong>{majorPageCount}</strong><span>major pages</span></div><div><strong>{moduleCount}</strong><span>module workspaces</span></div></div></div><div className="contract-toolbar panel-surface"><div className="contract-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter route, page, archetype, or interaction…" /><kbd>⌘ F</kbd></div><div className="contract-toolbar-meta"><span><span className="signal-dot signal-dot-blue" /> {rows.length} visible</span><button className="secondary-button" onClick={() => onAction("Matrix export remains a handoff action")}>Export handoff <ArrowUpRight size={14} /></button></div></div><div className="contract-note"><ShieldCheck size={16} /><span><strong>Authority:</strong> existing business logic, routes, RBAC, API contracts, auth, offline/sync, and data truth win over visual preference. This lab contains no production connection.</span></div><div className="contract-list">{rows.map((row) => <article className="contract-row panel-surface" key={row.route}><div className="contract-row-head"><div><span className="contract-route">{row.route}</span><h3>{row.page}</h3><span className="contract-scope">{row.scope}</span></div><span className="archetype-pill">{row.uniqueDesignArchetype}</span></div><div className="contract-grid"><ContractField label="Current purpose" value={row.currentPurpose} /><ContractField label="Primary action" value={row.primaryActions} /><ContractField label="Unique hero / structure" value={row.uniqueHero + " " + row.uniqueInformationStructure} /><ContractField label="Visualization" value={row.uniqueDataVisualization} /><ContractField label="Interaction / techie goodie" value={row.uniqueInteractionSignature + " " + row.techieGoodie} /><ContractField label="Data + authority" value={row.dataRequired + " " + row.functionalRequirements} /><ContractField label="State handling" value={row.emptyState + " " + row.offlineState + " " + row.unavailableIntegrationState} /><ContractField label="Responsive intent" value={row.mobileComposition + " " + row.tabletComposition + " " + row.desktop4kComposition} /></div><div className="contract-row-foot"><span><ShieldCheck size={13} /> {row.authorizedUsers}</span><button className="text-button" onClick={() => onAction(row.page + " contract selected")}>Open design notes <ChevronRight size={13} /></button></div></article>)}</div>{!rows.length ? <div className="empty-contract panel-surface"><CircleHelp size={22} /><strong>No contract rows match</strong><span>Try a route, page, or archetype.</span></div> : null}<div className="contract-footer"><span>Auth surfaces: {authSurfaceCount} · global views: {globalViewCount} · canonical baseline: {canonicalBaselineRoute}</span><span>Matrix status: COMPLETE</span></div></section>;
}

function ContractField({ label, value }: { label: string; value: string }) {
  return <div className="contract-field"><span>{label}</span><p>{value}</p></div>;
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) {
  return <div className="panel-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><button className="text-button" onClick={onAction}>{action} <ArrowUpRight size={13} /></button></div>;
}

function Sparkline({ large = false, tone = "blue", points }: { large?: boolean; tone?: string; points: string }) {
  const firstY = points.split(" ")[0]?.split(",")[1] ?? "90";
  const fillPath = "M0 120 L0," + firstY + " L" + points.replaceAll(" ", " L") + " L352 120 Z";
  return <svg className={"sparkline " + (large ? "sparkline-large " : "") + "sparkline-" + tone} viewBox="0 0 352 120" preserveAspectRatio="none" aria-label="Design fixture sparkline"><defs><linearGradient id={"spark-fill-" + tone} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path d={fillPath} fill={"url(#spark-fill-" + tone + ")"} /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SyncDrawer({ onClose, onAction }: { onClose: () => void; onAction: (message: string) => void }) {
  const items = [
    { label: "Portal shell", state: "cached", tone: "blue" },
    { label: "Form draft", state: "waiting-to-sync", tone: "apricot" },
    { label: "Expense request", state: "needs-review", tone: "coral" },
  ];
  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow"><RefreshCw size={13} /> Sync Activity Center</span><h2>Connection state, made visible.</h2></div><button className="close-button" onClick={onClose} aria-label="Close sync activity"><X size={17} /></button></div><div className="sync-state-banner"><span className="sync-state-icon"><Wifi size={17} /></span><div><strong>Cached shell active</strong><small>Online/offline state is a source-owned runtime value.</small></div></div><div className="sync-items">{items.map((item) => <div className="sync-item" key={item.label}><span className={"sync-item-icon sync-item-icon-" + item.tone}>{item.state === "cached" ? <Check size={15} /> : item.state === "needs-review" ? <CircleAlert size={15} /> : <Clock3 size={15} />}</span><span><strong>{item.label}</strong><small>{item.state}</small></span><button className="icon-button" onClick={() => onAction(item.label + " sync detail opened")} aria-label={"Open " + item.label + " sync detail"}><ChevronRight size={15} /></button></div>)}</div><div className="sync-legend"><span><i className="legend-dot legend-green" /> synced</span><span><i className="legend-dot legend-apricot" /> queued</span><span><i className="legend-dot legend-coral" /> needs review</span></div><div className="drawer-foot"><ShieldCheck size={14} /> Exactly-once and retry rules remain in the existing offline platform.</div></aside></div>;
}

function AiDrawer({ onClose, onAction }: { onClose: () => void; onAction: (message: string) => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="side-drawer ai-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow"><Bot size={13} /> Contextual AI</span><h2>Helpful, with boundaries.</h2></div><button className="close-button" onClick={onClose} aria-label="Close AI guidance"><X size={17} /></button></div><div className="ai-orb"><Sparkles size={25} /><span>GUIDANCE</span></div><div className="ai-answer"><span className="eyebrow">Suggested reading</span><strong>This page is a design fixture.</strong><p>When connected to the existing APIs, I can summarize visible records, explain a metric, or suggest a next action. I cannot fabricate authoritative business data.</p></div><div className="ai-actions"><button className="secondary-button" onClick={() => onAction("AI explanation requested · guidance only")}>Explain visible data <ArrowRight size={14} /></button><button className="secondary-button" onClick={() => onAction("AI next-action suggestion requested · guidance only")}>Suggest next action <ArrowRight size={14} /></button></div><div className="drawer-foot"><ShieldCheck size={14} /> AI is draft/guidance-first; source truth stays authoritative.</div></aside></div>;
}
