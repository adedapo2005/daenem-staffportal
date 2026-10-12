import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import './smart-input.css';

type Sensitivity = 'nonsensitive' | 'sensitive' | 'secret';
type SmartInputProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  scopeKey: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  authorized: boolean;
  sensitivity: Sensitivity;
  optOut?: boolean;
};

/**
 * A deliberately small, local-only fallback. No provider request, retrieval,
 * logging, storage or company context is involved in these neutral phrases.
 * Backend-governed AI completion must use a separately approved contract.
 */
export function localSmartSuffix(value: string): string {
  if (value.length > 70 || value.includes('@') || value.includes('/') || /[0-9]/.test(value) || value.toLowerCase().includes('http')) return '';
  const phrases: Record<string, string> = {
    responsible: ' for assigned daily tasks',
    coordinates: ' approved workplace activities',
    supports: ' assigned team activities',
  };
  return phrases[value.trim().toLocaleLowerCase('en')] || '';
}

export function SmartInput({
  label, value, onChange, scopeKey, placeholder, required = false,
  disabled = false, authorized, sensitivity, optOut = false,
}: SmartInputProps) {
  const id = useId().replace(/:/g, '');
  const [enabled, setEnabled] = useState(true);
  const [dismissedValue, setDismissedValue] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const [activeScope, setActiveScope] = useState(scopeKey);
  useEffect(() => {
    setActiveScope(scopeKey);
    setDismissedValue(null);
    setUndo(null);
  }, [scopeKey]);

  const permitted = authorized && sensitivity === 'nonsensitive' && !optOut && !disabled;
  const suffix = permitted && activeScope === scopeKey && enabled && dismissedValue !== value
    ? localSmartSuffix(value) : '';
  const change = (next: string) => {
    setUndo(null);
    setDismissedValue(null);
    onChange(next);
  };
  const accept = () => {
    if (!suffix) return;
    const next = value + suffix;
    setUndo({ before: value, after: next });
    setDismissedValue(next);
    onChange(next);
  };
  const reject = () => setDismissedValue(value);
  const revert = () => {
    if (undo && value === undo.after) {
      onChange(undo.before);
      setDismissedValue(undo.before);
    }
    setUndo(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && suffix) {
      event.preventDefault();
      event.stopPropagation();
      reject();
    }
    if (event.key === 'ArrowRight' && suffix && !event.ctrlKey && !event.metaKey && !event.altKey
      && event.currentTarget.selectionStart === value.length
      && event.currentTarget.selectionEnd === value.length) {
      event.preventDefault();
      event.stopPropagation();
      accept();
    }
    if (event.altKey && event.key === 'Backspace' && undo && value === undo.after) {
      event.preventDefault();
      event.stopPropagation();
      revert();
    }
  };

  if (!permitted) {
    return <input aria-label={label} value={value} onChange={event => change(event.target.value)}
      placeholder={placeholder} required={required} disabled={disabled} autoComplete="off" />;
  }

  return <div className="smart-input-root" data-smart-input-scope={scopeKey}>
    <div className="smart-input-field">
      {suffix && <div aria-hidden="true" className="smart-input-preview">
        <span className="smart-input-typed">{value}</span><span className="smart-input-ghost">{suffix}</span>
      </div>}
      <input aria-label={label} aria-describedby={id + '-help'} aria-autocomplete="inline"
        value={value} onChange={event => change(event.target.value)} onKeyDown={onKeyDown}
        placeholder={placeholder} required={required} disabled={disabled} autoComplete="off" />
    </div>
    <div className="smart-input-actions">
      <button type="button" className="smart-input-toggle" aria-pressed={enabled}
        aria-label="Toggle local writing suggestions"
        onClick={() => { setEnabled(previous => !previous); setUndo(null); setDismissedValue(null); }}>
        Local suggestions {enabled ? 'on' : 'off'}
      </button>
      {suffix && <><button type="button" onClick={accept} aria-label="Accept local suggestion">
        Accept suggestion
      </button><button type="button" onClick={reject} aria-label="Dismiss local suggestion">
        Dismiss
      </button></>}
      {undo && value === undo.after && <button type="button" onClick={revert}
        aria-label="Undo accepted suggestion">Undo suggestion</button>}
    </div>
    <span id={id + '-help'} className="smart-input-help" role="status" aria-live="polite">
      {suffix ? 'Optional local suggestion: ' + suffix + '. Right Arrow accepts; Escape dismisses.'
        : 'Writing suggestions are optional and never sent to an AI provider.'}
    </span>
  </div>;
}
