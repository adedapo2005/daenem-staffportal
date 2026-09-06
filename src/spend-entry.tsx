import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, Building2, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Filter, Landmark, LoaderCircle, LockKeyhole, Plus, Receipt, Save, Send, ShieldCheck,
  UploadCloud, WalletCards, X,
} from 'lucide-react';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import { SmartContextPanel } from './post-auth-experience';
import { getSmartContext } from './smart-context';
import {
  readCachedSpendMasterData, saveOfflineAttachment, saveCachedSpendMasterData, sha256Bytes,
  type ExpenseDraftInput, type OfflineOperation,
} from './offline-platform';
import { OfflinePlatformProvider, useOfflinePlatform } from './offline-sync';
import './spend.css';

type Tab = 'requests' | 'create' | 'approvals' | 'intelligence' | 'admin';
type MasterData = {
  company?: { id: string; code: string; name: string };
  masterData?: {
    categories: Array<Record<string, unknown>>;
    costCenters: Array<Record<string, unknown>>;
    suppliers: Array<Record<string, unknown>>;
    allocationTemplates: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
  };
  permissions?: Record<string, boolean>;
  businessTimezone?: string;
};
type RequestRow = Record<string, unknown>;
type OwnerTimeMode = 'business' | 'viewer' | 'utc' | 'both';
type ErpModuleId = 'printing' | 'bakery' | 'autos' | 'logistics' | 'properties' | 'finance';

const ERP_CONTEXTS: Array<{ id: ErpModuleId; label: string; detail: string }> = [
  { id: 'printing', label: 'Printing & Technology', detail: 'Materials, production, delivery and subcontracting costs' },
  { id: 'bakery', label: 'Bakery', detail: 'Ingredients, packaging, fuel, transport and equipment costs' },
  { id: 'autos', label: 'Autos', detail: 'Vehicle acquisition, import, preparation, licensing and existing Workshop costs' },
  { id: 'logistics', label: 'Logistics', detail: 'Fuel, tolls, drivers, loading, parking, insurance and maintenance' },
  { id: 'properties', label: 'Homes & Properties', detail: 'Maintenance, security, utilities, cleaning, legal and contractor costs' },
  { id: 'finance', label: 'Finance / Group', detail: 'Shared services, professional services and group-controlled spend' },
];

const text = (value: unknown) => String(value ?? '');
const money = (kobo: unknown) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(kobo || 0) / 100);
function parseTimestamp(value: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}
const dateTime = (value: unknown, timeZone?: string) => {
  const date = parseTimestamp(value);
  if (!date) return 'Not recorded';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(date); } catch { return 'Not recorded'; }
};
function viewerTimezone(context: WorkforceContext) {
  const configured = text(context.employee.timezone).trim();
  if (configured) return configured;
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
function detailedTime(value: unknown, timeZone: string) {
  const date = parseTimestamp(value);
  if (!date) return 'Not recorded';
  try {
    const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone, timeZoneName: 'short' }).format(date);
    return timeZone === 'Africa/Lagos' && !formatted.endsWith('WAT') ? `${formatted} WAT` : formatted;
  } catch { return 'Not recorded'; }
}
function OwnerTimestamp({ value, context, mode = 'both', label }: { value: unknown; context: WorkforceContext; mode?: OwnerTimeMode; label?: string }) {
  const business = detailedTime(value, 'Africa/Lagos');
  const viewer = detailedTime(value, viewerTimezone(context));
  const utc = detailedTime(value, 'UTC');
  const content = mode === 'business' ? business : mode === 'viewer' ? viewer : mode === 'utc' ? utc : `${business} · ${viewer}`;
  return <small className="spend-owner-time" data-time-mode={mode}><span>{label ? `${label}: ` : ''}</span><time dateTime={parseTimestamp(value)?.toISOString()}>{content}</time>{mode === 'both' && <span className="spend-time-utc">UTC {utc}</span>}</small>;
}
const idFor = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function isOwner(context: WorkforceContext) { return context.roles.some((role) => role.code === 'owner'); }
function can(context: WorkforceContext, permission: string, level: 'view' | 'create' | 'edit' | 'approve' | 'manage', companyId?: string) {
  return isOwner(context) || hasWorkforcePermission(context, permission, level, companyId);
}

function Launcher() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('requests');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api<{ context?: WorkforceContext }>('/api/auth/me');
        if (active) setContext(result.context || null);
      } catch {
        const cached = await import('./offline-platform').then((module) => module.readCachedAuthContext()).catch(() => null);
        if (active && cached && typeof cached === 'object') setContext(cached as WorkforceContext);
      }
    };
    void refresh();
    const openSpend = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: Tab; erpModule?: ErpModuleId }>).detail;
      const requested = detail?.tab;
      if (requested) setTab(requested);
      setOpen(true);
    };
    window.addEventListener('daenem:open-spend', openSpend as EventListener);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('daenem:open-spend', openSpend as EventListener); window.removeEventListener('focus', refresh); };
  }, []);
  if (!context) return null;
  const visible = isOwner(context) || context.companies.some((company) => can(context, 'expense.requests', 'create', company.id) || can(context, 'expense.own', 'view', company.id) || can(context, 'expense.approve', 'view', company.id) || can(context, 'expense.master', 'manage', company.id));
  if (!visible) return null;
  return <OfflinePlatformProvider context={context}>
    <>
      <button type="button" className="spend-launcher" onClick={() => { setTab('requests'); setOpen(true); }}><WalletCards size={18} /><span>Spend & costs</span></button>
      {open && <SpendCenter context={context} initialTab={tab} onClose={() => setOpen(false)} />}
    </>
  </OfflinePlatformProvider>;
}

function AccessNotice({ children }: { children: string }) {
  return <div className="spend-empty"><LockKeyhole size={24} /><strong>Access restricted</strong><span>{children}</span></div>;
}

function StatusPill({ status }: { status: unknown }) {
  const label = text(status).replaceAll('_', ' ').replaceAll('-', ' ');
  return <span className={'spend-status spend-status-' + text(status)}>{label || 'unknown'}</span>;
}

function SpendCenter({ context, initialTab, onClose }: { context: WorkforceContext; initialTab: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedCompany, setSelectedCompany] = useState(context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || '');
  const [erpModule, setErpModule] = useState<ErpModuleId>('finance');
  const [master, setMaster] = useState<MasterData | null>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { status, waitingCount, needsAttentionCount } = useOfflinePlatform();
  const company = context.companies.find((item) => item.id === selectedCompany) || context.companies[0];
  const canCreate = Boolean(company && can(context, 'expense.requests', 'create', company.id));
  const canApprove = Boolean(company && can(context, 'expense.approve', 'view', company.id));
  const canAdmin = Boolean(company && can(context, 'expense.master', 'manage', company.id));
  const ownerAccess = isOwner(context);
  const erpOptions = ERP_CONTEXTS.filter((item) => item.id === 'finance'
    ? Boolean(ownerAccess || (company && (can(context, 'expense.requests', 'view', company.id) || can(context, 'expense.own', 'view', company.id))))
    : Boolean(ownerAccess || (company && hasWorkforcePermission(context, `${item.id}.access`, 'view', company.id))));

  useEffect(() => {
    if (erpOptions.length && !erpOptions.some((item) => item.id === erpModule)) setErpModule(erpOptions[0].id);
  }, [erpOptions.map((item) => item.id).join('|'), erpModule]);

  useEffect(() => {
    let active = true;
    if (!company) return undefined;
    setLoadingMaster(true);
    api<MasterData>('/api/spend/bootstrap?companyId=' + encodeURIComponent(company.id)).then(async (value) => {
      if (!active) return;
      setMaster(value);
      await saveCachedSpendMasterData({ employeeId: context.employee.id, companyId: company.id }, value).catch(() => undefined);
    }).catch(async () => {
      const cached = await readCachedSpendMasterData({ employeeId: context.employee.id, companyId: company.id });
      if (active && cached?.value && typeof cached.value === 'object') setMaster(cached.value as MasterData);
      else if (active) setErrorMessage('Master data is not available offline for this company yet. Reconnect once to prepare controlled expense work.');
    }).finally(() => { if (active) setLoadingMaster(false); });
    return () => { active = false; };
  }, [company?.id, context.employee.id]);

  const tabs = [
    ...(canCreate ? [{ id: 'requests' as Tab, label: 'My requests' }, { id: 'create' as Tab, label: 'Create request' }] : []),
    ...(canApprove ? [{ id: 'approvals' as Tab, label: 'Approval queue' }] : []),
    ...(ownerAccess ? [{ id: 'intelligence' as Tab, label: 'Spend & profit' }] : []),
    ...(canAdmin ? [{ id: 'admin' as Tab, label: 'Administration' }] : []),
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : (tabs[0]?.id || 'requests');
  const smartContextKey = activeTab === 'intelligence' ? 'spend-intelligence' : activeTab === 'admin' ? 'spend-admin' : activeTab === 'approvals' ? 'expense-approvals' : activeTab === 'create' ? 'expense-requests' : 'expense-requests';
  return <div className="spend-backdrop" role="presentation" onClick={onClose}>
    <section className="spend-shell" role="dialog" aria-modal="true" aria-labelledby="spend-title" onClick={(event) => event.stopPropagation()}>
      <header className="spend-header">
        <div><span className="eyebrow">DAENEM GROUP · SHARED SPEND ENGINE</span><h1 id="spend-title">Spend, Cost & Profit Intelligence</h1><p>Requests, evidence and controlled allocation in one accountable workflow.</p></div>
        <button type="button" className="spend-close" onClick={onClose} aria-label="Close Spend and Cost workspace"><X size={20} /></button>
      </header>
      <div className="spend-toolbar">
        <label className="spend-company"><Building2 size={16} /><span>Working company</span><select value={selectedCompany} onChange={(event) => setSelectedCompany(event.target.value)} aria-label="Working company">{context.companies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        {erpOptions.length > 0 && <label className="spend-company"><Landmark size={16} /><span>ERP context</span><select value={erpModule} onChange={(event) => setErpModule(event.target.value as ErpModuleId)} aria-label="ERP context">{erpOptions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>}
        <span className="spend-sync-status" data-spend-sync-status={status}><span aria-hidden="true">●</span>{status === 'offline' ? (waitingCount ? `Offline · ${waitingCount} waiting` : 'Offline') : status === 'waiting' ? `${waitingCount} waiting to sync` : status === 'needs-attention' ? `${needsAttentionCount} needs attention` : status === 'synced' ? 'All work synced' : status === 'syncing' ? `Syncing ${waitingCount} item${waitingCount === 1 ? '' : 's'}…` : 'Online'}</span>
      </div>
      <nav className="spend-tabs" aria-label="Spend workspace navigation">{tabs.map((item) => <button key={item.id} type="button" className={activeTab === item.id ? 'active' : ''} onClick={() => { setErrorMessage(''); setTab(item.id); }}>{item.label}</button>)}</nav>
      {errorMessage && <div className="spend-alert" role="alert"><AlertTriangle size={17} />{errorMessage}</div>}
      {loadingMaster && <div className="spend-loading"><LoaderCircle className="spend-spin" size={18} />Loading controlled master data…</div>}
      <main className="spend-main">
        {activeTab === 'requests' && <RequestsView context={context} companyId={selectedCompany} onCreate={() => setTab('create')} />}
        {activeTab === 'create' && master && <CreateView context={context} companyId={selectedCompany} master={master} erpModule={erpModule} />}
        {activeTab === 'create' && !master && !loadingMaster && <AccessNotice>Reconnect to load controlled company, category and cost-centre options.</AccessNotice>}
        {activeTab === 'approvals' && <ApprovalsView context={context} companyId={selectedCompany} />}
        {activeTab === 'intelligence' && <OwnerIntelligenceView context={context} />}
        {activeTab === 'admin' && <AdminView context={context} companyId={selectedCompany} />}
      </main>
      <div className="spend-context-slot"><SmartContextPanel definition={getSmartContext(smartContextKey)} context={context} compact /></div>
    </section>
  </div>;
}

function RequestsView({ context, companyId, onCreate }: { context: WorkforceContext; companyId: string; onCreate: () => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => { setLoading(true); void api<{ requests: RequestRow[] }>('/api/spend/requests?companyId=' + encodeURIComponent(companyId)).then((value) => setRows(value.requests || [])).catch(() => setRows([])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [companyId]);
  if (!can(context, 'expense.own', 'view', companyId) && !can(context, 'expense.requests', 'create', companyId)) return <AccessNotice>You can only see requests in companies assigned to your account.</AccessNotice>;
  if (selected) return <RequestDetail context={context} requestId={selected} onBack={() => { setSelected(null); load(); }} />;
  return <section className="spend-view"><div className="spend-view-heading"><div><span className="eyebrow">PERSONAL WORKFLOW</span><h2>My Expense Requests</h2><p>Draft locally, submit with evidence, and follow every accountable state.</p></div><button type="button" className="spend-primary" onClick={onCreate}><Plus size={17} />New request</button></div>
    {loading ? <div className="spend-loading"><LoaderCircle className="spend-spin" size={18} />Loading requests…</div> : rows.length === 0 ? <div className="spend-empty"><Receipt size={27} /><strong>No expense requests yet</strong><span>Start with a controlled category and business reason.</span><button type="button" className="spend-secondary" onClick={onCreate}>Create first request</button></div> : <div className="spend-card-list">{rows.map((row) => <button type="button" className="spend-request-card" key={text(row.id)} onClick={() => setSelected(text(row.id))}><div className="spend-request-card-top"><span className="spend-request-no">{text(row.requestNo)}</span><StatusPill status={row.status} /></div><strong>{text(row.categoryName) || 'Expense request'}</strong><span>{text(row.companyName)} · {text(row.supplierName) || 'Supplier not selected'}</span><div><b>{money(row.totalKobo)}</b><small>{Number(row.evidenceCount || 0)} evidence · {dateTime(row.updatedAt)}</small></div><ChevronRight size={18} aria-hidden="true" /></button>)}</div>}
  </section>;
}

function CreateView({ context, companyId, master, erpModule }: { context: WorkforceContext; companyId: string; master: MasterData; erpModule: ErpModuleId }) {
  const { queueExpenseDraft, queueExpenseSubmission, retryNow } = useOfflinePlatform();
  const data = master.masterData || { categories: [], costCenters: [], suppliers: [], allocationTemplates: [], projects: [] };
  const availableCategories = useMemo(() => data.categories.filter((item) => {
    try {
      const allowed = JSON.parse(text(item.allowedErpJson || '[]'));
      return !Array.isArray(allowed) || allowed.length === 0 || allowed.map(String).includes(erpModule);
    } catch { return true; }
  }), [data.categories, erpModule]);
  const [step, setStep] = useState(1);
  const [requestId] = useState(() => idFor('expense-draft'));
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [businessReason, setBusinessReason] = useState('');
  const [categoryId, setCategoryId] = useState(text(availableCategories[0]?.id));
  const [costCenterId, setCostCenterId] = useState(text(data.costCenters[0]?.id));
  const [supplierId, setSupplierId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [directShared, setDirectShared] = useState<'direct' | 'shared'>('direct');
  const [allocationMethod, setAllocationMethod] = useState<'percentage' | 'fixed_amount' | 'equal_split'>('percentage');
  const [beneficiaries, setBeneficiaries] = useState<Record<string, string>>({ [companyId]: '100' });
  const [files, setFiles] = useState<File[]>([]);
  const [missingEvidenceReason, setMissingEvidenceReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const clientTimezone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }, []);
  const category = availableCategories.find((item) => text(item.id) === categoryId);
  const allowedBeneficiaries = context.companies;
  useEffect(() => {
    if (!availableCategories.some((item) => text(item.id) === categoryId)) setCategoryId(text(availableCategories[0]?.id));
  }, [availableCategories, categoryId]);
  const draft = (): ExpenseDraftInput => ({
    requestId, companyId, categoryId, costCenterId, supplierId: supplierId || undefined, projectId: projectId || undefined,
    purpose, businessReason, amountNaira: Number(amount), directShared, allocationMethod, erpModule,
    allocations: Object.entries(beneficiaries).filter(([, value]) => Number(value) > 0).map(([beneficiaryCompanyId, value]) => ({ companyId: beneficiaryCompanyId, percentage: allocationMethod === 'percentage' ? Number(value) : undefined, fixedAmountKobo: allocationMethod === 'fixed_amount' ? Math.round(Number(value) * 100) : undefined, costCenterId: beneficiaryCompanyId === companyId ? costCenterId : undefined })),
    lines: [{ description: purpose || 'Business expense', amountNaira: Number(amount), categoryId, directShared: directShared === 'direct' ? 'direct' : 'shared' }],
    evidenceCount: files.length, missingEvidenceReason: missingEvidenceReason.trim() || undefined, capturedAt: new Date().toISOString(), clientTimezone,
  });
  async function saveDraft() {
    setBusy(true); setMessage('');
    try { await queueExpenseDraft(draft(), companyId); setMessage('Draft saved securely on this device.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'The draft could not be saved.'); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setMessage('');
    try {
      if (!purpose.trim() || !businessReason.trim() || Number(amount) <= 0 || !categoryId || !costCenterId) throw new Error('Complete the required purpose, amount, category and cost centre fields.');
      if (!files.length && Number(category?.evidenceRequired ?? 1) !== 0 && !missingEvidenceReason.trim()) throw new Error('Attach evidence or explain why it is unavailable.');
      const input = { ...draft(), missingEvidenceReason: files.length ? 'Evidence is encrypted and queued for upload after the request is created.' : missingEvidenceReason.trim() };
      const draftOperation = await queueExpenseDraft(input, companyId);
      const attachments: string[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = await sha256Bytes(bytes);
        const attachment = await saveOfflineAttachment({ employeeId: context.employee.id, companyId }, { operationId: draftOperation.id, originalName: file.name, mimeType: file.type, bytes, sha256: digest, evidenceType: 'receipt', capturedAt: input.capturedAt, clientTimezone });
        attachments.push(attachment.id);
      }
      await queueExpenseSubmission({ ...input, attachmentRefs: attachments, evidenceCount: files.length, operationId: draftOperation.id }, companyId);
      setMessage(navigator.onLine ? 'Request queued. The server will revalidate master data and sync it now.' : 'Offline: request safely queued. It will sync after live authorization returns.');
      if (navigator.onLine) void retryNow();
      setStep(4);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be queued.'); } finally { setBusy(false); }
  }
  async function propose(kind: 'supplier' | 'category') {
    const proposedName = window.prompt(`Name the ${kind} you could not find:`)?.trim();
    if (!proposedName) return;
    try {
      await api('/api/spend/master/proposals', { method: 'POST', body: JSON.stringify({ kind, companyId, proposedName, erpModule }) });
      setMessage(`${kind === 'supplier' ? 'Supplier' : 'Category'} proposal sent for Admin review. It is not available until approved.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The proposal could not be sent.'); }
  }
  const toggleBeneficiary = (id: string) => setBeneficiaries((current) => current[id] ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)) : { ...current, [id]: '0' });
  return <section className="spend-view spend-create-view"><div className="spend-view-heading"><div><span className="eyebrow">MOBILE-FIRST CAPTURE</span><h2>Create expense request</h2><p>Step {step} of 4 · {step === 1 ? 'Purpose and amount' : step === 2 ? 'Controlled classification' : step === 3 ? 'Evidence and beneficiaries' : 'Review and queue'}</p></div><span className="spend-draft-badge"><Save size={14} />Draft safe</span></div>
    <div className="spend-stepper" aria-label={`Expense request step ${step} of 4`}>{[1, 2, 3, 4].map((item) => <span className={item <= step ? 'active' : ''} key={item}>{item}</span>)}</div>
    <div className="spend-form-card">
      {step === 1 && <div className="spend-form-grid"><label><span>What is this expense for? *</span><input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Generator fuel for Daenem Complex" autoFocus /></label><label><span>Amount (NGN) *</span><input type="number" min="1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /></label><label className="span-two"><span>Business reason *</span><textarea value={businessReason} onChange={(event) => setBusinessReason(event.target.value)} placeholder="Explain the business need and expected outcome." rows={4} /></label></div>}
      {step === 2 && <div className="spend-form-grid"><label><span>Expense category *</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{availableCategories.map((item) => <option value={text(item.id)} key={text(item.id)}>{text(item.name)}</option>)}</select><small>Controlled values for {ERP_CONTEXTS.find((item) => item.id === erpModule)?.label || erpModule}. {text(category?.directSharedPolicy || 'either')} treatment.</small><button type="button" className="spend-text-action" onClick={() => void propose('category')}>Not listed? Request new option</button></label><label><span>Cost centre *</span><select value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>{data.costCenters.map((item) => <option value={text(item.id)} key={text(item.id)}>{text(item.name)}</option>)}</select></label><label><span>Supplier / payee</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Select later / not known</option>{data.suppliers.map((item) => <option value={text(item.id)} key={text(item.id)}>{text(item.name)}</option>)}</select><small>Choose a controlled supplier; proposals never become authoritative automatically.</small><button type="button" className="spend-text-action" onClick={() => void propose('supplier')}>Not listed? Request new option</button></label><label><span>Project reference</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{data.projects.map((item) => <option value={text(item.id)} key={text(item.id)}>{text(item.name)}</option>)}</select></label></div>}
      {step === 3 && <div className="spend-form-grid"><label><span>Direct or shared expense *</span><select value={directShared} onChange={(event) => { const value = event.target.value as 'direct' | 'shared'; setDirectShared(value); if (value === 'direct') setBeneficiaries({ [companyId]: '100' }); }}><option value="direct">Direct · one company</option><option value="shared">Shared · allocate beneficiaries</option></select></label>{directShared === 'shared' && <div className="spend-allocation-box span-two"><div className="spend-field-heading"><span>Beneficiary companies</span><select value={allocationMethod} onChange={(event) => setAllocationMethod(event.target.value as typeof allocationMethod)}><option value="percentage">Percentage</option><option value="equal_split">Equal split</option><option value="fixed_amount">Fixed amount</option></select></div>{allowedBeneficiaries.map((item) => <label className="spend-beneficiary" key={item.id}><input type="checkbox" checked={Boolean(beneficiaries[item.id])} onChange={() => toggleBeneficiary(item.id)} /><span>{item.name}</span>{allocationMethod !== 'equal_split' && beneficiaries[item.id] !== undefined && <input aria-label={`${item.name} allocation`} value={beneficiaries[item.id]} onChange={(event) => setBeneficiaries((current) => ({ ...current, [item.id]: event.target.value }))} inputMode="decimal" />}<small>{allocationMethod === 'percentage' ? '%' : allocationMethod === 'fixed_amount' ? 'NGN' : 'equal'}</small></label>)}<p className="spend-hint">Server reconciliation is exact to the kobo. Invalid totals become Needs Attention and are never silently rounded.</p></div>}
        <label className="spend-evidence-picker span-two"><span>Receipt / invoice evidence</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><span className="spend-upload-action"><UploadCloud size={19} />Choose photo, camera image or PDF</span><small>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready · encrypted until reconnect` : 'Required by the selected policy before submission.'}</small></label>{!files.length && Number(category?.evidenceRequired ?? 1) !== 0 && <label className="span-two"><span>Why is evidence unavailable? *</span><textarea value={missingEvidenceReason} onChange={(event) => setMissingEvidenceReason(event.target.value)} placeholder="Explain the exception for the reviewer." rows={3} /></label>}</div>}
      {step === 4 && <div className="spend-review"><div className="spend-review-hero"><div><span className="eyebrow">READY FOR SERVER VALIDATION</span><h3>{purpose || 'Expense request'}</h3><p>{businessReason || 'Business reason not entered'}</p></div><strong>{money(Number(amount || 0) * 100)}</strong></div><dl><div><dt>Category</dt><dd>{text(category?.name) || 'Not selected'}</dd></div><div><dt>Cost centre</dt><dd>{text(data.costCenters.find((item) => text(item.id) === costCenterId)?.name) || 'Not selected'}</dd></div><div><dt>Supplier</dt><dd>{text(data.suppliers.find((item) => text(item.id) === supplierId)?.name) || 'Not known yet'}</dd></div><div><dt>Evidence</dt><dd>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'Missing — server will request a reason'}</dd></div><div><dt>Accounting</dt><dd>{text(category?.accountingTreatmentId).includes('capex') ? 'Capital expenditure · not automatic OpEx' : 'Classification follows category treatment'}</dd></div></dl><div className="spend-review-note"><ShieldCheck size={18} />Final approval, payment and Finance posting always remain live/server-authoritative.</div></div>}
      {message && <div className="spend-inline-status" role="status"><CheckCircle2 size={17} />{message}</div>}
      <footer className="spend-form-actions">{step > 1 && <button type="button" className="spend-secondary" onClick={() => setStep((value) => value - 1)}><ChevronLeft size={17} />Back</button>}{step < 4 && <button type="button" className="spend-secondary" onClick={() => void saveDraft()} disabled={busy}><Save size={16} />Save draft</button>}{step < 4 && <button type="button" className="spend-primary" onClick={() => setStep((value) => value + 1)} disabled={busy}>{step === 3 ? 'Review request' : 'Continue'}<ChevronRight size={17} /></button>}{step === 4 && <button type="button" className="spend-primary" onClick={() => void submit()} disabled={busy}><Send size={16} />{busy ? 'Queueing…' : 'Submit request'}</button>}</footer>
    </div>
  </section>;
}

function RequestDetail({ context, requestId, onBack }: { context: WorkforceContext; requestId: string; onBack: () => void }) {
  const [data, setData] = useState<RequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const load = () => { setLoading(true); void api<{ request: RequestRow }>('/api/spend/requests/' + encodeURIComponent(requestId)).then((value) => setData(value.request)).catch(() => setData(null)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [requestId]);
  async function action(actionName: string) { setMessage(''); try { await api(`/api/spend/requests/${encodeURIComponent(requestId)}/action`, { method: 'POST', body: JSON.stringify({ action: actionName }) }); setMessage('Request updated.'); load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The request could not be updated.'); } }
  if (loading) return <div className="spend-loading"><LoaderCircle className="spend-spin" size={18} />Loading request…</div>;
  if (!data) return <AccessNotice>This request is unavailable or outside your permitted scope.</AccessNotice>;
  const events = Array.isArray(data.events) ? data.events as RequestRow[] : [];
  return <section className="spend-view"><button type="button" className="spend-back-link" onClick={onBack}><ChevronLeft size={16} />Back to requests</button><div className="spend-detail-heading"><div><span className="eyebrow">{text(data.requestNo)}</span><h2>{text(data.categoryName) || 'Expense request'}</h2><p>{text(data.businessReason)}</p></div><StatusPill status={data.status} /></div><div className="spend-detail-grid"><article className="spend-detail-card"><span className="eyebrow">REQUEST</span><dl><div><dt>Amount</dt><dd>{money(data.totalKobo)}</dd></div><div><dt>Company</dt><dd>{text(data.companyName)}</dd></div><div><dt>Supplier</dt><dd>{text(data.supplierName) || 'Not known'}</dd></div><div><dt>Accounting</dt><dd>{text(data.accountingTreatmentName)}</dd></div><div><dt>Evidence</dt><dd>{Array.isArray(data.evidence) ? data.evidence.length : 0} attached</dd></div></dl></article><article className="spend-detail-card"><span className="eyebrow">ALLOCATIONS</span>{Array.isArray(data.allocations) && data.allocations.length ? <div className="spend-mini-list">{(data.allocations as RequestRow[]).map((row) => <div key={text(row.id)}><strong>{text(row.companyName)}</strong><span>{money(row.allocatedAmountKobo)} · {text(row.costCenterName)}</span></div>)}</div> : <p className="spend-muted">Direct to {text(data.companyName)}.</p>}</article></div>{message && <div className="spend-inline-status" role="status">{message}</div>}<div className="spend-detail-actions">{data.status === 'draft' || data.status === 'returned' ? <button type="button" className="spend-primary" onClick={() => void action('submit')}><Send size={16} />Submit</button> : null}{can(context, 'expense.approve', 'approve', text(data.companyId)) && data.status === 'submitted' && text(data.requesterEmployeeId) !== context.employee.id ? <button type="button" className="spend-primary" onClick={() => void action('approve')}><CheckCircle2 size={16} />Approve</button> : null}</div><article className="spend-timeline"><div className="spend-section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h3>What happened</h3></div><Clock3 size={18} /></div>{events.length ? events.map((item) => <div className="spend-timeline-row" key={text(item.id)}><span className="spend-timeline-dot" /><div><strong>{text(item.action).replaceAll('_', ' ')}</strong><small>Server received · {dateTime(item.serverReceivedAt, 'Africa/Lagos')}</small>{item.capturedAt ? <small>Captured on device · {dateTime(item.capturedAt)}</small> : null}</div></div>) : <p className="spend-muted">No transition events recorded yet.</p>}</article></section>;
}

function ApprovalsView({ context, companyId }: { context: WorkforceContext; companyId: string }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [message, setMessage] = useState('');
  const load = () => void api<{ approvals: RequestRow[] }>('/api/spend/approvals?companyId=' + encodeURIComponent(companyId)).then((value) => setRows(value.approvals || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, [companyId]);
  if (!can(context, 'expense.approve', 'view', companyId)) return <AccessNotice>Approval queue access is limited to assigned reviewers.</AccessNotice>;
  async function decide(id: string, action: string) { const reason = action === 'approve' ? undefined : window.prompt(action === 'return' ? 'Reason for correction:' : 'Reason for rejection:'); if (action !== 'approve' && !reason) return; try { await api(`/api/spend/requests/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ action, reason }) }); setMessage('Approval decision recorded in the audit trail.'); load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Decision failed.'); } }
  return <section className="spend-view"><div className="spend-view-heading"><div><span className="eyebrow">MAKER-CHECKER</span><h2>Approval queue</h2><p>Review evidence and allocation before a controlled approval. Payment and posting remain separate.</p></div><Landmark size={28} /></div>{message && <div className="spend-inline-status" role="status">{message}</div>}{rows.length === 0 ? <div className="spend-empty"><CheckCircle2 size={26} /><strong>No pending approvals</strong><span>New submitted requests will appear here when a rule assigns them to you.</span></div> : <div className="spend-approval-list">{rows.map((row) => <article className="spend-approval-card" key={text(row.approvalId)}><div className="spend-request-card-top"><span className="spend-request-no">{text(row.requestNo)}</span><b>{money(row.totalKobo)}</b></div><h3>{text(row.categoryName)}</h3><p>{text(row.businessReason)}</p><div className="spend-meta-row"><span>{text(row.requesterName)}</span><span>{text(row.companyName)}</span><span>{Number(row.evidenceCount || 0)} evidence</span></div><div className="spend-detail-actions"><button type="button" className="spend-primary" onClick={() => void decide(text(row.id), 'approve')}><CheckCircle2 size={15} />Approve</button><button type="button" className="spend-secondary" onClick={() => void decide(text(row.id), 'return')}>Return</button><button type="button" className="spend-danger" onClick={() => void decide(text(row.id), 'reject')}>Reject</button></div></article>)}</div>}</section>;
}

function OwnerIntelligenceView({ context }: { context: WorkforceContext }) {
  const [overview, setOverview] = useState<RequestRow | null>(null);
  const [detail, setDetail] = useState<RequestRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeMode, setTimeMode] = useState<OwnerTimeMode>('both');
  const [filters, setFilters] = useState({ employeeId: '', companyId: '', status: '', categoryId: '', supplierId: '', erpModule: '', directShared: '', eventAction: '', from: '', to: '' });
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return params.toString();
  }, [filters]);
  const load = () => { void api<RequestRow>('/api/spend/owner/overview').then(setOverview).catch(() => setOverview(null)); void api<RequestRow>('/api/spend/owner/detail' + (query ? `?${query}` : '')).then(setDetail).catch(() => setDetail(null)); };
  useEffect(() => { if (isOwner(context)) load(); }, [context, query]);
  if (!isOwner(context)) return <AccessNotice>Spend intelligence is an Owner-only surface.</AccessNotice>;
  const metrics = (overview?.metrics || {}) as RequestRow;
  const cards = [['Requested', metrics.requestedKobo], ['Approved exposure', metrics.approvedKobo], ['Committed exposure', metrics.committedKobo], ['Paid', metrics.paidKobo], ['Posted OpEx', metrics.postedOperatingExpenseKobo], ['Shared source spend', metrics.sharedExpenseKobo], ['Missing evidence', metrics.missingEvidence], ['Pending approvals', metrics.pendingApprovals]];
  const requests = Array.isArray(detail?.requests) ? detail.requests as RequestRow[] : [];
  const selected = requests.find((row) => text(row.id) === selectedId) || null;
  return <section className="spend-view"><div className="spend-view-heading"><div><span className="eyebrow">OWNER-ONLY COMMAND CENTER</span><h2>Spend & Profit Intelligence</h2><p>Real request exposure and posted treatment. Approved is not actual expense; incomplete profit sources stay unavailable.</p></div><ShieldCheck size={28} /></div><div className="spend-metric-grid">{cards.map(([label, value]) => <article key={text(label)}><span>{text(label)}</span><strong>{label === 'Missing evidence' || label === 'Pending approvals' ? text(value || 0) : money(value)}</strong></article>)}</div><div className="spend-profit-note"><AlertTriangle size={17} /><span><strong>Actual profit unavailable in this foundation.</strong> Revenue, canonical COGS and canonical payroll are not complete enough in the existing sources for a truthful group profit figure. Non-P&L postings do not reduce operating profit.</span></div><div className="spend-filter-bar"><Filter size={16} /><input value={filters.employeeId} onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))} placeholder="Employee ID" aria-label="Filter by employee ID" /><input value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))} placeholder="Category ID" aria-label="Filter by category ID" /><select value={filters.companyId} onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}><option value="">All companies</option>{context.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All states</option>{['draft','submitted','approved','returned','finance_posted'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select><select value={filters.directShared} onChange={(event) => setFilters((current) => ({ ...current, directShared: event.target.value }))}><option value="">Direct + shared</option><option value="direct">Direct</option><option value="shared">Shared</option><option value="mixed">Mixed</option></select><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} aria-label="Filter from date" /><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} aria-label="Filter to date" /><label className="spend-time-mode"><span>Time display</span><select value={timeMode} onChange={(event) => setTimeMode(event.target.value as OwnerTimeMode)}><option value="both">Show Both</option><option value="business">Business Time · WAT</option><option value="viewer">My Time</option><option value="utc">UTC</option></select></label></div><div className="spend-time-note">Business time remains Africa/Lagos. My Time uses the Owner profile timezone when configured, otherwise this viewer’s browser timezone ({viewerTimezone(context)}). UTC remains canonical server truth. Device captured time is evidence, not authority.</div><div className="spend-owner-detail"><div><div className="spend-section-heading"><div><span className="eyebrow">REQUEST DRILL-DOWN</span><h3>Evidence and allocation exceptions</h3></div></div>{requests.length ? <div className="spend-card-list">{requests.map((row) => <button type="button" className={'spend-request-card' + (selectedId === text(row.id) ? ' selected' : '')} aria-pressed={selectedId === text(row.id)} key={text(row.id)} onClick={() => setSelectedId(text(row.id))}><div className="spend-request-card-top"><span className="spend-request-no">{text(row.requestNo)}</span><StatusPill status={row.status} /></div><strong>{text(row.categoryName)}</strong><span>{text(row.requesterName)} · {text(row.companyName)}</span><div><b>{money(row.totalKobo)}</b><small>{text(row.directShared)} · {Number(row.evidenceCount || 0)} evidence</small></div><OwnerTimestamp value={row.updatedAt} context={context} mode={timeMode} label="Updated" /><ChevronRight size={18} aria-hidden="true" /></button>)}</div> : <p className="spend-muted">No matching spend records.</p>}</div><div className="spend-detail-card"><span className="eyebrow">SOURCE TRUTH</span><h3>Posted treatment</h3><p>Group reporting counts a shared source request once. Beneficiary companies receive only their reconciled allocation.</p><dl><div><dt>Posted OpEx</dt><dd>{money(metrics.postedOperatingExpenseKobo)}</dd></div><div><dt>Posted COGS</dt><dd>{money(metrics.postedCogsKobo)}</dd></div><div><dt>Non-P&L posted</dt><dd>{money(metrics.nonPnlPostedKobo)}</dd></div><div><dt>Unallocated shared</dt><dd>{money(metrics.unallocatedSharedExpenseKobo)}</dd></div></dl></div></div>{selected && <OwnerExpenseInspector context={context} request={selected} timeMode={timeMode} onClose={() => setSelectedId(null)} />}</section>;
}

function ownerEventLabel(action: unknown) {
  const labels: Record<string, string> = {
    request_created: 'Draft saved / request created',
    request_updated: 'Request details updated',
    request_submitted: 'Request submitted',
    request_approved: 'Approval recorded',
    request_returned: 'Returned for correction',
    request_rejected: 'Request rejected',
    finance_posted: 'Finance posting recorded',
  };
  const key = text(action);
  return labels[key] || key.replaceAll('_', ' ') || 'Recorded event';
}

function OwnerExpenseInspector({ context, request, timeMode, onClose }: { context: WorkforceContext; request: RequestRow; timeMode: OwnerTimeMode; onClose: () => void }) {
  const allocations = Array.isArray(request.allocations) ? request.allocations as RequestRow[] : [];
  const evidence = Array.isArray(request.evidence) ? request.evidence as RequestRow[] : [];
  const approvals = Array.isArray(request.approvals) ? request.approvals as RequestRow[] : [];
  const auditEvidence = Array.isArray(request.auditEvidence) ? request.auditEvidence as RequestRow[] : [];
  const events = Array.isArray(request.events) ? [...request.events as RequestRow[]].sort((a, b) => String(a.serverReceivedAt || a.capturedAt || '').localeCompare(String(b.serverReceivedAt || b.capturedAt || ''))) : [];
  const allocated = allocations.reduce((sum, item) => sum + Number(item.allocatedAmountKobo || 0), 0);
  return <aside className="spend-owner-inspector" aria-label="Expense operational detail"><div className="spend-inspector-heading"><div><span className="eyebrow">OPERATIONAL DETAIL</span><h3>{text(request.requestNo)}</h3><p>{text(request.categoryName)} · {text(request.companyName)}</p></div><button type="button" className="spend-close spend-close-light" onClick={onClose} aria-label="Close expense detail"><X size={18} /></button></div><div className="spend-inspector-grid"><article className="spend-detail-card"><span className="eyebrow">WHO / WHAT</span><dl><div><dt>Employee</dt><dd>{text(request.requesterName)} · {text(request.requesterEmployeeId)}</dd></div><div><dt>Employee number</dt><dd>{text(request.requesterNo) || 'Not recorded'}</dd></div><div><dt>Department / branch</dt><dd>{text(request.requesterDepartment || request.department) || 'Not recorded'} · {text(request.branchName) || 'Not recorded'}</dd></div><div><dt>ERP / context</dt><dd>{text(request.erpModule) || 'Finance'}{request.contextEntityType ? ` · ${text(request.contextEntityType)} ${text(request.contextEntityId)}` : ''}</dd></div><div><dt>Supplier</dt><dd>{text(request.supplierName) || 'Not selected'}</dd></div><div><dt>Accounting</dt><dd>{text(request.accountingTreatmentName)} · {text(request.profitEffect) === 'non_pnl' ? 'Non-P&L' : 'P&L treatment'}</dd></div></dl></article><article className="spend-detail-card"><span className="eyebrow">AMOUNT / ALLOCATION</span><dl><div><dt>Source amount</dt><dd>{money(request.totalKobo)}</dd></div><div><dt>Allocated total</dt><dd>{money(allocated)} {allocated === Number(request.totalKobo || 0) ? '· reconciled' : '· needs review'}</dd></div><div><dt>Direct / shared</dt><dd>{text(request.directShared)}</dd></div><div><dt>Status</dt><dd><StatusPill status={request.status} /></dd></div><div><dt>Cost centre</dt><dd>{text(request.costCenterName) || 'See beneficiary allocations'}</dd></div><div><dt>Recognized</dt><dd>{money(request.recognizedKobo)} · {text(request.profitEffect) === 'non_pnl' ? 'excluded from operating profit' : 'posted treatment'}</dd></div></dl></article></div><div className="spend-inspector-time"><span className="eyebrow">TIME EVIDENCE</span><OwnerTimestamp value={request.capturedAt} context={context} mode={timeMode} label="Device captured" /><OwnerTimestamp value={request.createdAt} context={context} mode={timeMode} label="Server record created" /><span className="spend-time-disclaimer">Client time is evidence; server time controls processing. Network location is not GPS.</span></div><div className="spend-inspector-columns"><article className="spend-detail-card"><span className="eyebrow">BENEFICIARIES</span>{allocations.length ? <div className="spend-mini-list">{allocations.map((item) => <div key={text(item.id)}><strong>{text(item.companyName)}</strong><span>{money(item.allocatedAmountKobo)} · {text(item.costCenterName)}</span></div>)}</div> : <p className="spend-muted">No allocation rows recorded.</p>}</article><article className="spend-detail-card"><span className="eyebrow">EVIDENCE</span>{evidence.length ? <div className="spend-mini-list">{evidence.map((item) => <div key={text(item.id)}><strong>{text(item.originalName)}</strong><span>{text(item.evidenceType)} · {text(item.mimeType)} · {Math.round(Number(item.sizeBytes || 0) / 1024)} KB · {text(item.status)}</span><small>SHA-256 {text(item.sha256).slice(0, 16)}…</small></div>)}</div> : <p className="spend-muted">No evidence metadata is recorded.</p>}</article><article className="spend-detail-card"><span className="eyebrow">NETWORK / AUDIT EVIDENCE</span><p className="spend-time-disclaimer">Server-observed network context is shown for audit. It is not GPS and no silent geolocation is collected.</p>{auditEvidence.length ? <div className="spend-mini-list">{auditEvidence.slice(-8).map((item) => { const details = item.details && typeof item.details === 'object' ? item.details as RequestRow : {}; return <div key={text(item.id)}><strong>{text(item.action).replaceAll('_', ' ')}</strong><span>Server-observed IP: {text(details.ipAddress) || 'Not recorded'}</span><span>Network location: {text(details.networkLocation) || 'Not recorded'}</span><small>Device {text(details.deviceId) || 'Not recorded'} · Session {text(details.sessionId) || 'Not recorded'} · Correlation {text(item.requestId || details.requestId) || 'Not recorded'}</small></div>; })}</div> : <p className="spend-muted">No spend audit metadata is recorded for this request.</p>}</article></div><article className="spend-timeline spend-owner-timeline"><div className="spend-section-heading"><div><span className="eyebrow">APPEND-ONLY EVENT HISTORY</span><h3>Operational timeline</h3></div><Clock3 size={18} /></div>{events.length ? events.map((item) => <div className="spend-timeline-row" key={text(item.id)}><span className="spend-timeline-dot" /><div><strong>{ownerEventLabel(item.action)}</strong><OwnerTimestamp value={item.serverReceivedAt} context={context} mode={timeMode} label="Server" />{item.capturedAt ? <OwnerTimestamp value={item.capturedAt} context={context} mode={timeMode} label="Captured" /> : null}{item.reason ? <small>Reason: {text(item.reason)}</small> : null}{item.requestId ? <small>Correlation: {text(item.requestId)}</small> : null}</div></div>) : <p className="spend-muted">No transition events were recorded; no stages are inferred.</p>}</article><article className="spend-detail-card"><span className="eyebrow">APPROVAL EVIDENCE</span>{approvals.length ? <div className="spend-mini-list">{approvals.map((item) => <div key={text(item.id)}><strong>Step {text(item.stepNo)} · {text(item.approverRoleCode)}</strong><span>{text(item.status)}{item.approverName ? ` · ${text(item.approverName)}` : ''}</span>{item.actedAt ? <OwnerTimestamp value={item.actedAt} context={context} mode={timeMode} label="Decision" /> : null}</div>)}</div> : <p className="spend-muted">No approval steps recorded.</p>}</article></aside>;
}

function AdminView({ context, companyId }: { context: WorkforceContext; companyId: string }) {
  const [data, setData] = useState<RequestRow | null>(null);
  const [kind, setKind] = useState<'category' | 'supplier' | 'cost_center' | 'template' | 'approval_rule' | 'evidence_policy'>('supplier');
  const [name, setName] = useState('');
  const [treatmentId, setTreatmentId] = useState('spend-treatment-opex');
  const [directSharedPolicy, setDirectSharedPolicy] = useState('either');
  const [evidenceRequired, setEvidenceRequired] = useState(true);
  const [method, setMethod] = useState('equal_split');
  const [approverRoleCode, setApproverRoleCode] = useState('manager');
  const [minAmountNaira, setMinAmountNaira] = useState('');
  const [maxAmountNaira, setMaxAmountNaira] = useState('');
  const [evidenceType, setEvidenceType] = useState('receipt');
  const [templateParticipants, setTemplateParticipants] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const load = () => void api<RequestRow>('/api/spend/admin/master?companyId=' + encodeURIComponent(companyId)).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [companyId]);
  if (!can(context, 'expense.master', 'manage', companyId)) return <AccessNotice>Only assigned Finance/Admin operators can manage controlled master data.</AccessNotice>;
  async function create() {
    if (['category', 'supplier', 'cost_center', 'template'].includes(kind) && !name.trim()) return;
    const body: Record<string, unknown> = { kind, action: 'create', companyId, name: name.trim(), accountingTreatmentId: treatmentId, defaultTreatmentId: treatmentId, directSharedPolicy, evidenceRequired, method, approverRoleCode, minAmountKobo: Math.round(Number(minAmountNaira || 0) * 100), maxAmountKobo: maxAmountNaira ? Math.round(Number(maxAmountNaira) * 100) : undefined, evidenceType, items: Object.entries(templateParticipants).filter(([, value]) => Number(value) > 0).map(([beneficiaryCompanyId, value]) => ({ companyId: beneficiaryCompanyId, percentage: method === 'percentage' ? Number(value) : undefined, fixedAmountKobo: method === 'fixed_amount' ? Math.round(Number(value) * 100) : undefined })) };
    try { await api('/api/spend/admin/master', { method: 'POST', body: JSON.stringify(body) }); setName(''); setMessage('Controlled value or rule added. Historical references remain intact.'); load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The value was not added.'); }
  }
  async function reviewProposal(id: string, action: 'approve' | 'reject') {
    const reason = action === 'approve' ? undefined : window.prompt('Reason for rejecting this proposal:');
    if (action === 'reject' && !reason) return;
    try { await api(`/api/spend/admin/proposals/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action, reason }) }); setMessage(`Proposal ${action}d and recorded in the audit trail.`); load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Proposal review failed.'); }
  }
  const toggleTemplateParticipant = (id: string) => setTemplateParticipants((current) => current[id] !== undefined ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)) : { ...current, [id]: method === 'percentage' ? '0' : '' });
  const categories = Array.isArray(data?.categories) ? data?.categories as RequestRow[] : [];
  const costCenters = Array.isArray(data?.costCenters) ? data?.costCenters as RequestRow[] : [];
  const suppliers = Array.isArray(data?.suppliers) ? data?.suppliers as RequestRow[] : [];
  const treatments = Array.isArray(data?.treatments) ? data?.treatments as RequestRow[] : [];
  const templates = Array.isArray(data?.allocationTemplates) ? data?.allocationTemplates as RequestRow[] : [];
  const rules = Array.isArray(data?.approvalRules) ? data?.approvalRules as RequestRow[] : [];
  const policies = Array.isArray(data?.evidencePolicies) ? data?.evidencePolicies as RequestRow[] : [];
  const proposals = Array.isArray(data?.proposals) ? data?.proposals as RequestRow[] : [];
  return <section className="spend-view"><div className="spend-view-heading"><div><span className="eyebrow">CONTROLLED MASTER DATA</span><h2>Cost Intelligence Administration</h2><p>System values remain authoritative; Admin values are governed; proposals never become options automatically.</p></div><ShieldCheck size={28} /></div><div className="spend-admin-form"><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Master data type"><option value="supplier">Supplier / payee</option><option value="category">Expense category</option><option value="cost_center">Cost centre</option><option value="template">Allocation template</option><option value="approval_rule">Approval rule</option><option value="evidence_policy">Evidence policy</option></select>{['category', 'supplier', 'cost_center', 'template'].includes(kind) && <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Approved master value" aria-label="Master value name" />}{kind === 'category' && <><select value={treatmentId} onChange={(event) => setTreatmentId(event.target.value)} aria-label="Accounting treatment">{treatments.map((item) => <option key={text(item.id)} value={text(item.id)}>{text(item.name)}</option>)}</select><select value={directSharedPolicy} onChange={(event) => setDirectSharedPolicy(event.target.value)} aria-label="Direct or shared policy"><option value="either">Direct or shared</option><option value="direct">Direct only</option><option value="shared">Shared only</option></select><label className="spend-checkbox"><input type="checkbox" checked={evidenceRequired} onChange={(event) => setEvidenceRequired(event.target.checked)} /> Evidence required</label></>}{kind === 'template' && <><select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Allocation method"><option value="equal_split">Equal split</option><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount</option></select><div className="spend-template-participants" aria-label="Allocation template beneficiaries"><span>Template beneficiaries</span>{context.companies.map((company) => <label className="spend-checkbox" key={company.id}><input type="checkbox" checked={templateParticipants[company.id] !== undefined} onChange={() => toggleTemplateParticipant(company.id)} /><span>{company.name}</span>{templateParticipants[company.id] !== undefined && method !== 'equal_split' && <input aria-label={`${company.name} allocation`} inputMode="decimal" value={templateParticipants[company.id]} onChange={(event) => setTemplateParticipants((current) => ({ ...current, [company.id]: event.target.value }))} placeholder={method === 'percentage' ? '%' : 'NGN'} />}</label>)}</div></>}{kind === 'approval_rule' && <><input value={approverRoleCode} onChange={(event) => setApproverRoleCode(event.target.value)} placeholder="Approver role code" aria-label="Approver role code" /><input inputMode="decimal" value={minAmountNaira} onChange={(event) => setMinAmountNaira(event.target.value)} placeholder="Minimum NGN" aria-label="Minimum amount in Naira" /><input inputMode="decimal" value={maxAmountNaira} onChange={(event) => setMaxAmountNaira(event.target.value)} placeholder="Maximum NGN (optional)" aria-label="Maximum amount in Naira" /></>}{kind === 'evidence_policy' && <><select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} aria-label="Evidence type"><option value="receipt">Receipt</option><option value="invoice">Invoice</option><option value="quote">Quote</option><option value="delivery_note">Delivery note</option></select><input inputMode="decimal" value={minAmountNaira} onChange={(event) => setMinAmountNaira(event.target.value)} placeholder="Minimum NGN" aria-label="Evidence minimum amount in Naira" /></>}<button type="button" className="spend-primary" onClick={() => void create()}><Plus size={16} />Save controlled rule</button></div>{message && <div className="spend-inline-status" role="status">{message}</div>}<div className="spend-admin-grid"><article className="spend-detail-card"><span className="eyebrow">CATEGORIES</span>{categories.slice(0, 12).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.name)}</span><small>{text(item.directSharedPolicy)} · {text(item.source)}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">COST CENTRES</span>{costCenters.slice(0, 12).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.name)}</span><small>{text(item.code)} · {text(item.source)}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">SUPPLIERS</span>{suppliers.slice(0, 12).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.name)}</span><small>{text(item.source)}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">ACCOUNTING TREATMENTS</span>{treatments.map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.name)}</span><small>{text(item.profitEffect)} · {Number(item.isPandl) ? 'P&L' : 'non-P&L'}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">ALLOCATION TEMPLATES</span>{templates.slice(0, 12).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.name)}</span><small>{text(item.method)} · {text(item.active) === '1' ? 'active' : 'inactive'}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">APPROVAL RULES / EVIDENCE POLICIES</span>{rules.slice(0, 8).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.approverRoleCode)} · step {text(item.stepNo)}</span><small>{money(item.minAmountKobo)}+</small></div>)}{policies.slice(0, 8).map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.evidenceType)} policy</span><small>{Number(item.required) ? 'required' : 'optional'}</small></div>)}</article><article className="spend-detail-card"><span className="eyebrow">PROPOSALS · REVIEW BEFORE MASTER</span>{proposals.length ? proposals.map((item) => <div className="spend-admin-row" key={text(item.id)}><span>{text(item.proposedName)}<small>{text(item.kind)} · {text(item.status)}</small></span>{text(item.status) === 'proposed' ? <span className="spend-admin-actions"><button type="button" className="spend-secondary" onClick={() => void reviewProposal(text(item.id), 'approve')}>Approve</button><button type="button" className="spend-danger" onClick={() => void reviewProposal(text(item.id), 'reject')}>Reject</button></span> : null}</div>) : <p className="spend-muted">No proposed values require review.</p>}</article></div></section>;
}

const host = document.createElement('div');
host.id = 'spend-launcher';
document.body.appendChild(host);
createRoot(host).render(<Launcher />);
