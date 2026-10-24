import { useId, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import './smart-master-select.css';

/**
 * Reusable, read-only-to-master-data selector.
 * Callers must supply options from an authenticated, permission-scoped
 * backend response. Typed search terms never become persisted record IDs.
 */
export type SmartMasterOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SmartMasterOption[];
  emptyLabel?: string;
  help?: string;
  required?: boolean;
  disabled?: boolean;
  searchThreshold?: number;
};

const searchableText = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function SmartMasterSelect({
  label, value, onChange, options, emptyLabel = 'Select an approved value',
  help, required = false, disabled = false, searchThreshold = 7,
}: Props) {
  const selectId = useId();
  const helpId = useId();
  const [search, setSearch] = useState('');
  const query = searchableText(search);
  const searchable = options.length >= searchThreshold;

  const suggestions = useMemo(() => {
    if (!query) return [];
    return options
      .filter((option) => !option.disabled && searchableText(
        [option.label, option.searchText || ''].join(' '),
      ).includes(query))
      .sort((a, b) => Number(searchableText(b.label).startsWith(query)) -
        Number(searchableText(a.label).startsWith(query)))
      .slice(0, 6);
  }, [options, query]);

  function choose(next: string) {
    // The only saved value is an exact ID from the approved options list.
    if (next && !options.some((option) => option.value === next && !option.disabled)) return;
    onChange(next);
    setSearch('');
  }

  return <div className="smart-master-field" data-approved-options="true">
    <label htmlFor={selectId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {searchable && <div className="smart-master-find">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={`Find ${label.toLowerCase()}…`}
        aria-label={`Search approved ${label.toLowerCase()}`}
        autoComplete="off"
        disabled={disabled}
      />
    </div>}
    {searchable && query && <div className="smart-master-suggestions" role="group" aria-label={`Matching ${label.toLowerCase()} choices`}>
      {suggestions.length ? suggestions.map((option) => <button
        key={option.value}
        type="button"
        onClick={() => choose(option.value)}
        disabled={disabled}
      >{option.label}</button>) : <span role="status">No matching approved values. Use the request-new-option process where available.</span>}
    </div>}
    <select
      id={selectId}
      required={required}
      value={options.some((option) => option.value === value) ? value : ''}
      onChange={(event) => choose(event.target.value)}
      aria-describedby={help ? helpId : undefined}
      disabled={disabled || options.length === 0}
    >
      <option value="">{options.length === 0 ? 'No approved values available' : emptyLabel}</option>
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    {help && <small id={helpId}>{help}</small>}
  </div>;
}
