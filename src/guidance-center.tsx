import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Bot, BookOpen, Check, ChevronDown, ChevronUp,
  CircleHelp, Clock3, History, RefreshCw, Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import { api, hasWorkforcePermission, type AccessLevel, type WorkforceContext } from './auth';
import './guidance-center.css';

type GuideCompany = { id: string; code: string; name: string };
type GuideFunction = {
  key: string;
  group: string;
  label: string;
  shortLabel: string;
  description: string;
  permissionCode?: string;
  accessLevel: AccessLevel;
  setup: 'required' | 'optional';
  whoUses: string;
  requiredInformation: string;
  expectedResult: string;
  warning?: string;
  steps: string[];
};
type GuideProgress = { functionKey: string; status: 'reviewed' | 'not_reviewed'; lastReviewedAt?: string };
type GuideSuggestion = { id: string; question: string; relatedFunctionKey: string };
type GuideCatalog = {
  employee: string;
  company: GuideCompany;
  companies: GuideCompany[];
  roles: string[];
  functions: GuideFunction[];
  progress: GuideProgress[];
  suggestions: GuideSuggestion[];
  guidance: { required: string; optional: string };
  accessControlAvailable: boolean;
};
type GuideHistory = { id: string; question: string; answer: string; createdAt: string };
type HelpAnswer = {
  answer: string;
  source: 'workers_ai' | 'catalog';
  notice: string;
  relatedFunctions: Array<Pick<GuideFunction, 'key' | 'label' | 'description' | 'accessLevel'>>;
};
type GuideTab = 'ask' | 'library' | 'onboarding' | 'history';
type LibraryFilter = 'all' | 'required' | 'optional' | 'reviewed';

function cacheKey(employeeId: string, companyId: string) { return `daenem-smart-guide:${employeeId}:${companyId}`; }
function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as T | null; } catch { return null; }
}
function openFunction(key: string) {
  window.dispatchEvent(new CustomEvent('daenem:guide-open-function', { detail: { key } }));
}
function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function AiGuideView({ context }: { context: WorkforceContext }) {
  const allowedCompanies = useMemo(
    () => context.companies.filter((company) => hasWorkforcePermission(context, 'ai_guide.access', 'view', company.id)),
    [context],
  );
  const [companyId, setCompanyId] = useState(allowedCompanies[0]?.id || '');
  const [catalog, setCatalog] = useState<GuideCatalog | null>(() => companyId ? readJson<GuideCatalog>(cacheKey(context.employee.id, companyId)) : null);
  const [history, setHistory] = useState<GuideHistory[]>([]);
  const [tab, setTab] = useState<GuideTab>('ask');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<HelpAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!allowedCompanies.some((company) => company.id === companyId)) setCompanyId(allowedCompanies[0]?.id || '');
  }, [allowedCompanies, companyId]);

  async function load(selectedCompanyId = companyId) {
    if (!selectedCompanyId) return;
    setLoading(true);
    const cached = readJson<GuideCatalog>(cacheKey(context.employee.id, selectedCompanyId));
    if (cached) setCatalog(cached);
    else if (catalog?.company.id !== selectedCompanyId) { setCatalog(null); setHistory([]); }
    try {
      const [nextCatalog, nextHistory] = await Promise.all([
        api<GuideCatalog>(`/api/ai/guide/catalog?companyId=${encodeURIComponent(selectedCompanyId)}`),
        api<{ history: GuideHistory[] }>(`/api/ai/guide/history?companyId=${encodeURIComponent(selectedCompanyId)}`),
      ]);
      setCatalog(nextCatalog);
      setHistory(nextHistory.history);
      localStorage.setItem(cacheKey(context.employee.id, selectedCompanyId), JSON.stringify(nextCatalog));
      setMessage('');
    } catch (error) {
      if (!cached) setMessage((error as Error).message);
      else setMessage('Showing your last saved guide while the portal reconnects.');
    } finally { setLoading(false); }
  }

  useEffect(() => { setResult(null); setExpanded(null); setQuery(''); void load(companyId); }, [companyId, context.employee.id]);
  useEffect(() => {
    const online = () => { setOffline(false); void load(); };
    const disconnected = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', disconnected); };
  }, [companyId]);

  const reviewed = useMemo(() => new Set((catalog?.progress || []).filter((item) => item.status === 'reviewed').map((item) => item.functionKey)), [catalog]);
  const functions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.functions || []).filter((item) => {
      if (filter === 'required' && item.setup !== 'required') return false;
      if (filter === 'optional' && item.setup !== 'optional') return false;
      if (filter === 'reviewed' && !reviewed.has(item.key)) return false;
      if (!needle) return true;
      return `${item.label} ${item.shortLabel} ${item.group} ${item.description} ${item.whoUses} ${item.requiredInformation} ${item.expectedResult} ${item.warning || ''}`.toLowerCase().includes(needle);
    });
  }, [catalog, filter, query, reviewed]);
  const requiredFunctions = (catalog?.functions || []).filter((item) => item.setup === 'required');
  const reviewedRequired = requiredFunctions.filter((item) => reviewed.has(item.key)).length;

  async function saveProgress(item: GuideFunction) {
    const nextReviewed = !reviewed.has(item.key);
    try {
      await api('/api/ai/guide/progress', { method: 'POST', body: JSON.stringify({ companyId, functionKey: item.key, reviewed: nextReviewed }) });
      setCatalog((current) => current ? {
        ...current,
        progress: [...current.progress.filter((row) => row.functionKey !== item.key), { functionKey: item.key, status: nextReviewed ? 'reviewed' : 'not_reviewed', lastReviewedAt: new Date().toISOString() }],
      } : current);
      setMessage(nextReviewed ? `${item.label} marked as reviewed.` : `${item.label} moved back to your review list.`);
    } catch (error) { setMessage((error as Error).message); }
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const prompt = question.trim();
    if (!prompt || !companyId || offline) return;
    setBusy(true);
    try {
      const answer = await api<HelpAnswer>('/api/ai/help', { method: 'POST', body: JSON.stringify({ companyId, question: prompt }) });
      setResult(answer);
      setHistory((current) => [{ id: `current-${Date.now()}`, question: prompt, answer: answer.answer, createdAt: new Date().toISOString() }, ...current].slice(0, 20));
      setMessage('');
    } catch (error) {
      setResult({ answer: (error as Error).message, source: 'catalog', notice: 'The question could not be processed.', relatedFunctions: [] });
    } finally { setBusy(false); }
  }

  function chooseSuggestion(value: string) { setQuestion(value); setTab('ask'); }

  function functionCards(items: GuideFunction[]) {
    return items.map((item) => {
      const isExpanded = expanded === item.key;
      const isReviewed = reviewed.has(item.key);
      return <article className={`smart-function ${isReviewed ? 'reviewed' : ''}`} key={item.key}>
        <button className="smart-function-head" onClick={() => setExpanded(isExpanded ? null : item.key)} aria-expanded={isExpanded}>
          <span className="smart-function-icon" aria-hidden="true">{isReviewed ? <Check size={15} /> : item.label.slice(0, 1)}</span>
          <span><small>{item.group}</small><strong>{item.label}</strong><em>{item.description}</em></span>
          <span className={`smart-level level-${item.accessLevel}`}>{item.accessLevel === 'manage' ? 'Manage / Admin' : item.accessLevel}</span>
          {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        {isExpanded && <div className="smart-function-detail">
          <div className="smart-definition-grid">
            <section><b>What it does</b><p>{item.description}</p></section>
            <section><b>Who normally uses it</b><p>{item.whoUses}</p></section>
            <section><b>Information required</b><p>{item.requiredInformation}</p></section>
            <section><b>Expected result</b><p>{item.expectedResult}</p></section>
          </div>
          {item.warning && <div className="smart-warning"><AlertTriangle size={16} /><span><b>Important</b>{item.warning}</span></div>}
          <div className="smart-steps"><b>How to use it</b><ol>{item.steps.map((step) => <li key={step}>{step}</li>)}</ol></div>
          <footer>
            <button className="text-action" onClick={() => chooseSuggestion(`How do I use ${item.label} with ${item.accessLevel} access in ${catalog?.company.name}?`)}><CircleHelp size={15} />Ask about this</button>
            <button className="smart-secondary" onClick={() => void saveProgress(item)}><Check size={15} />{isReviewed ? 'Mark not reviewed' : 'Mark reviewed'}</button>
            <button className="primary-action small" onClick={() => openFunction(item.key)}>Open Function<ArrowRight size={15} /></button>
          </footer>
        </div>}
      </article>;
    });
  }

  if (!allowedCompanies.length) return <div className="view-stack guide-view"><div className="guide-empty"><ShieldCheck size={34} /><h2>Smart Help is not assigned</h2><p>Ask an Owner/Admin to assign AI Guide access for the business where you work.</p></div></div>;

  return <div className="view-stack guide-view">
    <div className="view-heading smart-guide-heading">
      <div><span className="eyebrow">DAENEM SMART HELP CENTRE</span><h2>Understand every function you can use</h2><p>Choose a business to see only its assigned functions, your exact access level and clear instructions. Smart Help never opens unassigned data or bypasses approval.</p></div>
      <div className="smart-guide-controls">
        <label><span>Working in</span><select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{allowedCompanies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
        <button className="smart-refresh" onClick={() => void load()} disabled={loading} title="Refresh permissions and guidance"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
      </div>
    </div>

    {(offline || message) && <div className="guide-status"><strong>{offline ? 'Offline guide' : 'Smart Help'}</strong><span>{message || 'Saved function descriptions remain available. AI questions will resume after reconnection.'}</span></div>}

    <nav className="smart-guide-tabs" aria-label="Smart Help sections">
      <button className={tab === 'ask' ? 'active' : ''} onClick={() => setTab('ask')}><Bot size={16} /><span>Ask Smart Help</span></button>
      <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><BookOpen size={16} /><span>Function Library</span><em>{catalog?.functions.length || 0}</em></button>
      <button className={tab === 'onboarding' ? 'active' : ''} onClick={() => setTab('onboarding')}><Check size={16} /><span>My Onboarding</span><em>{reviewedRequired}/{requiredFunctions.length}</em></button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={16} /><span>Recent Questions</span></button>
    </nav>

    {tab === 'ask' && <div className="smart-ask-layout">
      <article className="panel smart-answer">
        <header><span><Bot size={21} /></span><div><small>{catalog?.company.name || 'Selected business'}</small><h3>{result ? 'Permission-aware answer' : `Hello ${context.employee.displayName.split(' ')[0]}`}</h3></div></header>
        {result ? <><div className="smart-answer-copy">{result.answer}</div><p className="smart-source"><ShieldCheck size={14} />{result.notice}</p>{result.relatedFunctions.length > 0 && <section className="smart-related"><b>Related authorized functions</b>{result.relatedFunctions.map((item) => <button key={item.key} onClick={() => openFunction(item.key)}><span><strong>{item.label}</strong><small>{item.description}</small></span><em>{item.accessLevel}</em><ArrowRight size={14} /></button>)}</section>}</> : <div className="smart-welcome"><Sparkles size={28} /><p>Ask what a function does, what information it needs, how to complete a workflow or which assigned function should be used.</p><span>Answers are limited to your permissions in the selected business.</span></div>}
      </article>
      <article className="panel smart-question-card">
        <form onSubmit={ask}>
          <label><span>What do you need help with?</span><em>Required · Maximum 800 characters</em></label>
          <textarea value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 800))} rows={6} placeholder="Example: What information must I record before closing a job?" required />
          <footer><span>{question.length}/800</span><button className="primary-action" disabled={busy || offline || question.trim().length < 3}><Sparkles size={17} />{busy ? 'Preparing guidance…' : offline ? 'AI unavailable offline' : 'Ask Smart Help'}</button></footer>
        </form>
        <div className="smart-suggestions"><b>Suggested for {catalog?.company.name}</b>{(catalog?.suggestions || []).map((item) => <button key={item.id} onClick={() => chooseSuggestion(item.question)}>{item.question}<ArrowRight size={13} /></button>)}</div>
      </article>
    </div>}

    {tab === 'library' && <section className="smart-library">
      <header className="smart-library-tools"><div><span className="eyebrow">AUTHORIZED FUNCTION LIBRARY</span><h3>{catalog?.company.name}</h3><p>Every description below explains what the function does, who uses it, what information is required and the expected result.</p></div><label className="smart-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search functions, records or tasks…" /></label></header>
      <div className="smart-filters">{(['all', 'required', 'optional', 'reviewed'] as LibraryFilter[]).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All assigned' : value}</button>)}</div>
      <div className="smart-function-list">{functionCards(functions)}{functions.length === 0 && <div className="guide-empty compact"><Search size={28} /><h3>No matching assigned function</h3><p>Try a different search or filter. Unassigned functions are intentionally hidden.</p></div>}</div>
    </section>}

    {tab === 'onboarding' && <section className="smart-library">
      <header className="smart-onboarding-head"><div><span className="eyebrow">MY AUTHORIZED ONBOARDING</span><h3>{reviewedRequired} of {requiredFunctions.length} required functions reviewed</h3><p>{catalog?.guidance.required}</p></div><div className="smart-progress"><i style={{ width: `${requiredFunctions.length ? Math.round(reviewedRequired / requiredFunctions.length * 100) : 0}%` }} /></div></header>
      <div className="smart-function-list">{functionCards(requiredFunctions)}</div>
      {(catalog?.functions || []).some((item) => item.setup === 'optional') && <div className="smart-optional-note"><BookOpen size={18} /><span><b>Assigned workflow guides</b>{catalog?.guidance.optional}</span><button onClick={() => { setFilter('optional'); setTab('library'); }}>View optional guides</button></div>}
    </section>}

    {tab === 'history' && <section className="smart-history panel">
      <header><div><span className="eyebrow">PRIVATE QUESTION HISTORY</span><h3>Your recent {catalog?.company.name} questions</h3><p>Only your own company-scoped Smart Help activity is shown.</p></div><Clock3 size={24} /></header>
      <div>{history.map((item) => <article key={item.id}><button onClick={() => { setQuestion(item.question); setResult({ answer: item.answer, source: 'catalog', notice: 'Previously saved Smart Help answer.', relatedFunctions: [] }); setTab('ask'); }}><strong>{item.question}</strong><span>{item.answer}</span><small>{formatDate(item.createdAt)}</small></button></article>)}{history.length === 0 && <div className="guide-empty compact"><History size={28} /><h3>No questions yet</h3><p>Your recent Smart Help questions for this business will appear here.</p></div>}</div>
    </section>}

    {catalog?.accessControlAvailable && <article className="panel access-guide-callout"><ShieldCheck size={26} /><div><strong>Need to change a role or employee permission?</strong><span>Open Advanced Access Control to assign the exact business, function and access level. Every change is audited.</span></div><button className="primary-action small" onClick={() => openFunction('access-control')}>Open Access Control</button></article>}
  </div>;
}
