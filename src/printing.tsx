import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BarChart3, Boxes, BriefcaseBusiness, CheckCircle2, Clock3,
  Factory, FileText, PackageCheck, Plus, RefreshCw, Search, TrendingUp, UserPlus, X,
} from 'lucide-react';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import './printing.css';

type PrintDashboard = {
  date: string;
  month: string;
  metrics: {
    openJobs: number; overdueJobs: number; readyJobs: number; customers: number; lowStockItems: number;
    revenueKobo: number; costKobo: number; grossProfitKobo: number; marginBasisPoints: number;
  };
  pipeline: Array<{ status: string; count: number }>;
  recentJobs: PrintJob[];
};

type PrintJob = {
  id: string; jobNo: string; title: string; description?: string; status: string; artworkStatus?: string; proofStatus?: string;
  priority: string; quantity?: number; unit?: string; sizeSpec?: string; finishingSpec?: string; dueAt?: string;
  quotedKobo?: number; invoicedKobo?: number; materialCostKobo?: number; grossProfitKobo?: number; marginBasisPoints?: number;
  customerId?: string; customerName?: string; customerBusiness?: string; serviceId?: string; serviceName?: string;
  designerName?: string; operatorName?: string; createdAt?: string;
};

type Service = { id: string; code: string; name: string; category: string; pricingUnit: string; basePriceKobo: number; requiresArtwork: number; requiresProof: number };
type Customer = { id: string; customerNo?: string; name: string; businessName?: string; phone?: string; email?: string; balanceKobo?: number };

type JobForm = {
  customerId: string; serviceId: string; title: string; description: string; quantity: number; unit: string;
  sizeSpec: string; colorSpec: string; finishingSpec: string; priority: string; dueAt: string; quotedNaira: string;
};

const statuses = ['enquiry','quoted','customer_approved','design','proof','queued','printing','finishing','quality_control','packaging','ready','delivered','completed','on_hold','cancelled'];
const transitionOptions: Record<string, string[]> = {
  enquiry: ['quoted','on_hold','cancelled'], quoted: ['customer_approved','on_hold','cancelled'], customer_approved: ['design','queued','on_hold','cancelled'],
  design: ['proof','queued','on_hold'], proof: ['queued','design','on_hold'], queued: ['printing','on_hold'], printing: ['finishing','quality_control','on_hold'],
  finishing: ['quality_control','on_hold'], quality_control: ['packaging','printing','finishing','on_hold'], packaging: ['ready','quality_control','on_hold'],
  ready: ['delivered','on_hold'], delivered: ['completed'], completed: [], cancelled: [], on_hold: ['queued','printing','cancelled'],
};

function money(kobo?: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(kobo || 0) / 100);
}

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const printingCompanyId = 'company-printing';

function can(context: WorkforceContext, minimum: 'view' | 'create' | 'edit' | 'approve' | 'manage' = 'view') {
  return hasWorkforcePermission(context, 'printing.access', minimum, printingCompanyId);
}

function canViewFinancials(context: WorkforceContext) {
  return can(context, 'approve') || hasWorkforcePermission(context, 'finance.access', 'view', printingCompanyId);
}

const emptyJob: JobForm = { customerId: '', serviceId: '', title: '', description: '', quantity: 1, unit: 'job', sizeSpec: '', colorSpec: '', finishingSpec: '', priority: 'normal', dueAt: '', quotedNaira: '' };

export function PrintingWorkspace({ context, onClose }: { context: WorkforceContext; onClose: () => void }) {
  const [tab, setTab] = useState<'dashboard' | 'jobs' | 'customers'>('dashboard');
  const [dashboard, setDashboard] = useState<PrintDashboard | null>(null);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [jobForm, setJobForm] = useState<JobForm>(emptyJob);
  const [customerForm, setCustomerForm] = useState({ name: '', businessName: '', phone: '', whatsapp: '', email: '', address: '', customerType: 'retail' });
  const showFinancials = canViewFinancials(context);

  async function loadAll() {
    setBusy(true);
    try {
      const [dashboardResult, serviceResult, customerResult] = await Promise.all([
        api<PrintDashboard>('/api/printing/dashboard'),
        api<{ services: Service[] }>('/api/printing/services'),
        api<{ customers: Customer[] }>('/api/printing/customers'),
      ]);
      setDashboard(dashboardResult);
      setServices(serviceResult.services || []);
      setCustomers(customerResult.customers || []);
      await loadJobs();
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }

  async function loadJobs() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (status) params.set('status', status);
    try {
      const result = await api<{ jobs: PrintJob[] }>(`/api/printing/jobs${params.toString() ? `?${params}` : ''}`);
      setJobs(result.jobs || []);
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { const timer = window.setTimeout(loadJobs, 250); return () => window.clearTimeout(timer); }, [search, status]);

  async function createJob(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ job: { jobNo: string } }>('/api/printing/jobs', { method: 'POST', body: JSON.stringify({ ...jobForm, quotedNaira: Number(jobForm.quotedNaira || 0) }) });
      setMessage({ type: 'success', text: `${result.job.jobNo} created successfully.` });
      setJobForm(emptyJob); setShowJobForm(false); setTab('jobs'); await loadAll();
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }

  async function createCustomer(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await api<{ customer: Customer }>('/api/printing/customers', { method: 'POST', body: JSON.stringify(customerForm) });
      setCustomers((current) => [...current, result.customer].sort((a,b) => a.name.localeCompare(b.name)));
      setJobForm((current) => ({ ...current, customerId: result.customer.id }));
      setCustomerForm({ name: '', businessName: '', phone: '', whatsapp: '', email: '', address: '', customerType: 'retail' });
      setShowCustomerForm(false); setMessage({ type: 'success', text: 'Printing customer created.' });
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }

  async function moveJob(job: PrintJob, toStatus: string) {
    setBusy(true); setMessage(null);
    try {
      await api('/api/printing/jobs/status', { method: 'POST', body: JSON.stringify({ jobId: job.id, toStatus }) });
      setMessage({ type: 'success', text: `${job.jobNo} moved to ${label(toStatus)}.` });
      await loadAll();
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(false); }
  }

  const pipelineMax = useMemo(() => Math.max(1, ...(dashboard?.pipeline || []).map((item) => Number(item.count))), [dashboard]);

  return <div className="printing-backdrop" onClick={onClose}>
    <section className="printing-shell" onClick={(event) => event.stopPropagation()}>
      <header className="printing-header">
        <div className="printing-brand"><div className="printing-mark"><Factory size={22} /></div><div><span>DAENEM PRINTING & TECHNOLOGY</span><h2>Print Operations ERP</h2><p>Jobs, customers, production, materials, quality control and profitability in one workflow.</p></div></div>
        <div className="printing-header-actions"><button onClick={loadAll} disabled={busy}><RefreshCw size={17} /></button><button onClick={onClose}><X size={19} /></button></div>
      </header>

      <div className="printing-nav">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><BarChart3 size={16} /> Dashboard</button>
        <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}><BriefcaseBusiness size={16} /> Print Jobs</button>
        <button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')}><UserPlus size={16} /> Customers</button>
        <div className="printing-nav-spacer" />
        {can(context, 'create') && <button className="printing-new" onClick={() => setShowJobForm(true)}><Plus size={16} /> New Print Job</button>}
      </div>

      {message && <div className={`printing-message ${message.type}`}>{message.text}</div>}

      {tab === 'dashboard' && <div className="printing-body">
        <div className="printing-metrics">
          <article><BriefcaseBusiness size={18} /><span><small>Open jobs</small><strong>{dashboard?.metrics.openJobs ?? '—'}</strong></span></article>
          <article className={dashboard?.metrics.overdueJobs ? 'attention' : ''}><AlertTriangle size={18} /><span><small>Overdue</small><strong>{dashboard?.metrics.overdueJobs ?? '—'}</strong></span></article>
          <article><PackageCheck size={18} /><span><small>Ready jobs</small><strong>{dashboard?.metrics.readyJobs ?? '—'}</strong></span></article>
          {showFinancials && <article><TrendingUp size={18} /><span><small>Month invoiced</small><strong>{money(dashboard?.metrics.revenueKobo)}</strong></span></article>}
          {showFinancials && <article><TrendingUp size={18} /><span><small>Recorded margin</small><strong>{money(dashboard?.metrics.grossProfitKobo)}</strong></span></article>}
          <article className={dashboard?.metrics.lowStockItems ? 'attention' : ''}><Boxes size={18} /><span><small>Low stock</small><strong>{dashboard?.metrics.lowStockItems ?? '—'}</strong></span></article>
        </div>
        <div className={`printing-dashboard-grid${showFinancials ? '' : ' single'}`}>
          <article className="printing-panel"><div className="printing-panel-head"><div><span>PRODUCTION PIPELINE</span><h3>Active job stages</h3></div><Factory size={20} /></div><div className="pipeline-list">{dashboard?.pipeline.length ? dashboard.pipeline.map((item) => <div key={item.status}><div><span>{label(item.status)}</span><strong>{item.count}</strong></div><i><b style={{ width: `${Math.max(8, (Number(item.count) / pipelineMax) * 100)}%` }} /></i></div>) : <div className="printing-empty">No active Print Jobs yet.</div>}</div></article>
          {showFinancials && <article className="printing-panel"><div className="printing-panel-head"><div><span>COMMERCIAL VIEW</span><h3>Invoiced value and recorded cost</h3></div><TrendingUp size={20} /></div><div className="profit-block"><div><span>Invoiced value</span><strong>{money(dashboard?.metrics.revenueKobo)}</strong></div><div><span>Recorded cost</span><strong>{money(dashboard?.metrics.costKobo)}</strong></div><div><span>Recorded margin</span><strong>{money(dashboard?.metrics.grossProfitKobo)}</strong></div><div><span>Margin rate</span><strong>{((dashboard?.metrics.marginBasisPoints || 0) / 100).toFixed(1)}%</strong></div></div><p className="printing-commercial-truth">These figures are based on recorded invoices and costs. They do not confirm customer payment, bank settlement or reconciliation.</p></article>}
        </div>
        <article className="printing-panel"><div className="printing-panel-head"><div><span>RECENT WORK</span><h3>Latest Print Jobs</h3></div><button className="printing-link" onClick={() => setTab('jobs')}>View all <ArrowRight size={14} /></button></div><JobTable jobs={dashboard?.recentJobs || []} onMove={moveJob} editable={can(context, 'edit')} financial={showFinancials} compact /></article>
      </div>}

      {tab === 'jobs' && <div className="printing-body">
        <div className="printing-filters"><div className="printing-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job number, title or customer…" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All stages</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>
        <article className="printing-panel"><JobTable jobs={jobs} onMove={moveJob} editable={can(context, 'edit')} financial={showFinancials} /></article>
      </div>}

      {tab === 'customers' && <div className="printing-body"><div className="printing-section-heading"><div><span>CUSTOMER DIRECTORY</span><h3>Daenem Printing customers</h3></div>{can(context, 'create') && <button className="printing-new" onClick={() => setShowCustomerForm(true)}><Plus size={16} /> Add Customer</button>}</div><article className="printing-panel"><div className="customer-grid">{customers.length ? customers.map((customer) => <div className="customer-card" key={customer.id}><div className="customer-avatar">{customer.name.slice(0,2).toUpperCase()}</div><div><strong>{customer.name}</strong><span>{customer.businessName || 'Individual / Retail'}</span><small>{customer.phone || customer.email || customer.customerNo || 'No contact recorded'}</small></div>{showFinancials && <b>{money(customer.balanceKobo)}</b>}</div>) : <div className="printing-empty">No customers yet.</div>}</div></article></div>}

      {showJobForm && <div className="printing-modal-backdrop"><form className="printing-modal" onSubmit={createJob}><div className="printing-modal-head"><div><span>NEW WORK ORDER</span><h3>Create Print Job</h3></div><button type="button" onClick={() => setShowJobForm(false)}><X size={18} /></button></div><div className="printing-form-grid"><label><span>Customer</span><select value={jobForm.customerId} onChange={(event) => setJobForm({ ...jobForm, customerId: event.target.value })}><option value="">Walk-in / not selected</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.businessName ? ` — ${customer.businessName}` : ''}</option>)}</select></label><label><span>Service</span><select value={jobForm.serviceId} onChange={(event) => setJobForm({ ...jobForm, serviceId: event.target.value })}><option value="">Select service…</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="span-2"><span>Job title</span><input required value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} placeholder="e.g. Outdoor banner for ABC Stores" /></label><label className="span-2"><span>Description / instructions</span><textarea rows={3} value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} /></label><label><span>Quantity</span><input type="number" min="1" step="1" value={jobForm.quantity} onChange={(event) => setJobForm({ ...jobForm, quantity: Number(event.target.value) })} /></label><label><span>Unit</span><input value={jobForm.unit} onChange={(event) => setJobForm({ ...jobForm, unit: event.target.value })} /></label><label><span>Size / specification</span><input value={jobForm.sizeSpec} onChange={(event) => setJobForm({ ...jobForm, sizeSpec: event.target.value })} placeholder="e.g. 10ft × 4ft" /></label><label><span>Colour</span><input value={jobForm.colorSpec} onChange={(event) => setJobForm({ ...jobForm, colorSpec: event.target.value })} placeholder="Full colour" /></label><label><span>Finishing</span><input value={jobForm.finishingSpec} onChange={(event) => setJobForm({ ...jobForm, finishingSpec: event.target.value })} placeholder="Eyelets, lamination…" /></label><label><span>Priority</span><select value={jobForm.priority} onChange={(event) => setJobForm({ ...jobForm, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label><span>Due date/time</span><input type="datetime-local" value={jobForm.dueAt} onChange={(event) => setJobForm({ ...jobForm, dueAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>{showFinancials && <label><span>Quoted amount (₦)</span><input type="number" min="0" step="1" value={jobForm.quotedNaira} onChange={(event) => setJobForm({ ...jobForm, quotedNaira: event.target.value })} /></label>}</div><div className="printing-modal-actions"><button type="button" onClick={() => setShowJobForm(false)}>Cancel</button><button className="printing-new" disabled={busy}><Plus size={16} /> Create Print Job</button></div></form></div>}

      {showCustomerForm && <div className="printing-modal-backdrop"><form className="printing-modal small-modal" onSubmit={createCustomer}><div className="printing-modal-head"><div><span>CUSTOMER RECORD</span><h3>Add Printing Customer</h3></div><button type="button" onClick={() => setShowCustomerForm(false)}><X size={18} /></button></div><div className="printing-form-grid"><label><span>Customer name</span><input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></label><label><span>Business / brand</span><input value={customerForm.businessName} onChange={(event) => setCustomerForm({ ...customerForm, businessName: event.target.value })} /></label><label><span>Phone</span><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} /></label><label><span>WhatsApp</span><input value={customerForm.whatsapp} onChange={(event) => setCustomerForm({ ...customerForm, whatsapp: event.target.value })} /></label><label><span>Email</span><input type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} /></label><label><span>Customer type</span><select value={customerForm.customerType} onChange={(event) => setCustomerForm({ ...customerForm, customerType: event.target.value })}><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="corporate">Corporate</option><option value="government">Government</option><option value="other">Other</option></select></label><label className="span-2"><span>Address</span><textarea rows={2} value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></label></div><div className="printing-modal-actions"><button type="button" onClick={() => setShowCustomerForm(false)}>Cancel</button><button className="printing-new" disabled={busy}><UserPlus size={16} /> Add Customer</button></div></form></div>}
    </section>
  </div>;
}

function JobTable({ jobs, onMove, editable, financial, compact = false }: { jobs: PrintJob[]; onMove: (job: PrintJob, status: string) => void; editable: boolean; financial: boolean; compact?: boolean }) {
  if (!jobs.length) return <div className="printing-empty"><FileText size={30} /><strong>No Print Jobs found</strong><span>Create the first Daenem Printing work order to begin tracking production and recorded commercial margin.</span></div>;
  return <div className="job-table-wrap"><table className="job-table"><thead><tr><th>Job</th><th>Customer</th><th>Service</th><th>Status</th>{!compact && <th>Due</th>}{financial && <><th>Quote</th><th>Quoted / Invoiced Margin</th></>}{editable && <th>Next action</th>}</tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.jobNo}</strong><span>{job.title}</span></td><td><strong>{job.customerName || 'Walk-in'}</strong><span>{job.customerBusiness || ''}</span></td><td><span>{job.serviceName || 'General Print'}</span></td><td><b className={`job-status ${job.status}`}>{label(job.status)}</b>{job.priority === 'urgent' && <em>URGENT</em>}</td>{!compact && <td><span>{job.dueAt ? new Date(job.dueAt).toLocaleString() : 'Not set'}</span></td>}{financial && <><td><strong>{money(job.quotedKobo)}</strong></td><td><strong className={(job.grossProfitKobo || 0) < 0 ? 'negative' : ''}>{money(job.grossProfitKobo)}</strong><span>{((job.marginBasisPoints || 0) / 100).toFixed(1)}%</span></td></>}{editable && <td><select value="" onChange={(event) => { if (event.target.value) onMove(job, event.target.value); }}><option value="">Move to…</option>{(transitionOptions[job.status] || []).map((next) => <option key={next} value={next}>{label(next)}</option>)}</select></td>}</tr>)}</tbody></table></div>;
}
