import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SearchSuggestion {
  type: string;
  command: string;
  label: string;
  group: string;
  description?: string;
  entityId?: string;
}
interface SearchPayload {
  suggestions: SearchSuggestion[];
  sources: { name: string; status: 'checked' | 'unavailable' }[];
  partial: boolean;
}
function recordHref(result: SearchSuggestion) {
  const route: Record<string,string> = {
    'employee': '/people', 'payroll': '/payroll', 'construction': '/construction-command',
    'leave-request': '/leave', 'document-request': '/self-service',
  };
  return route[result.type] || undefined;
}
export default function Stage1SearchResults({ enabled }: { enabled: boolean }): ReactNode {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<SearchPayload | null>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'ready'|'unavailable'>('idle');

  useEffect(() => {
    if (!enabled) { setHost(null); return; }
    const bind = () => {
      const modal = document.getElementById('ask-daenem-command');
      const input = modal?.querySelector<HTMLInputElement>('input[placeholder*="Search work areas"]');
      const container = modal?.querySelector<HTMLElement>('.p-ai-search-guidance');
      if (!input || !container) { setHost(null); return; }
      setHost(container);
      const handler = () => setQuery(input.value);
      handler();
      input.addEventListener('input', handler);
      return () => input.removeEventListener('input', handler);
    };
    let cleanup: (() => void) | undefined;
    let boundInput: HTMLInputElement | null = null;
    const synchronize = () => {
      const nextInput = document.querySelector<HTMLInputElement>(
        '#ask-daenem-command input[placeholder*="Search work areas"]');
      if (nextInput === boundInput) return;
      cleanup?.();
      boundInput = nextInput;
      cleanup = nextInput ? bind() : undefined;
      if (!nextInput) { setHost(null); setQuery(''); }
    };
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, { childList: true, subtree: true });
    synchronize();
    return () => { observer.disconnect(); cleanup?.(); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !host || query.trim().length < 2) {
      setResponse(null); setStatus('idle'); return;
    }
    const controller = new AbortController();
    const pending = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const result = await fetch('/api/search/suggest?q=' + encodeURIComponent(query.trim()), {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
          signal: controller.signal, headers: { Accept: 'application/json' },
        });
        if (!result.ok) throw new Error('Search endpoint unavailable');
        const data = await result.json() as SearchPayload;
        if (!Array.isArray(data.suggestions) || !Array.isArray(data.sources)) throw new Error('Invalid search response');
        if (!controller.signal.aborted) { setResponse(data); setStatus('ready'); }
      } catch {
        if (!controller.signal.aborted) { setResponse(null); setStatus('unavailable'); }
      }
    }, 280);
    return () => { window.clearTimeout(pending); controller.abort(); };
  }, [enabled, host, query]);

  if (!enabled || !host || query.trim().length < 2) return null;
  const records = response?.suggestions.filter((item) => item.type !== 'module') || [];
  return createPortal(
    <section className="stage1-live-search" aria-label="Live record search">
      <div className="stage1-search-heading">
        <strong>Live records</strong>
        <span role="status" aria-live="polite">
          {status === 'loading' ? 'Checking authorised records…' :
            status === 'unavailable' ? 'Live search unavailable · existing search remains available' :
              status === 'ready' ? response?.partial ? 'Some record sources unavailable' : 'Authorised record sources checked' :
                'Preparing live search…'}
        </span>
      </div>
      {status === 'ready' && records.length > 0 && (
        <ul className="stage1-search-list">{records.map((item, index) => {
          const href = recordHref(item);
          return <li key={item.type + ':' + (item.entityId || index)}>
            {href ? <a href={href} aria-label={`Open ${item.group} workspace for ${item.label}`}>
              <span>{item.label}</span><small>{item.group} · {item.description || 'Open authorised workspace'}</small>
            </a> : <span>{item.label}<small>{item.group} · {item.description}</small></span>}
          </li>;
        })}</ul>
      )}
      {status === 'ready' && records.length === 0 &&
        <p className="stage1-search-empty">{response?.partial
          ? 'No results from the sources currently available. Other sources could not be checked.'
          : 'No matching live records in the authorised sources checked.'}</p>}
    </section>, host);
}
