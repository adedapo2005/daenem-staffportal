import type { CanonicalFixture } from './canonical-types';

export function formatFreshnessTime(value?: string | null, timeZone = 'Africa/Lagos') {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return {
      iso: date.toISOString(),
      label: new Intl.DateTimeFormat('en-NG', {
        timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(date),
      zone: timeZone,
    };
  } catch {
    return null;
  }
}

/** Data freshness, not an assertion that an offline business operation reached the server. */
export function FreshnessStatus({ sync, variant = 'topbar' }: {
  sync: CanonicalFixture['sync'];
  variant?: 'topbar' | 'card';
}) {
  const timestamp = formatFreshnessTime(sync.updatedAt, sync.timeZone);
  const state = /offline/i.test(sync.label) ? 'offline'
    : /unavailable|error|attention/i.test(sync.label) ? 'error'
    : /syncing|loading|waiting/i.test(sync.label) ? 'loading' : 'ready';
  return <span className={`csp-sync csp-freshness csp-freshness-${variant} csp-freshness-${state}`}
    data-canonical-freshness="true" role="status" aria-live="polite" title={sync.detail}>
    <i aria-hidden="true"/>
    <span className="csp-freshness-copy">
      <b>{sync.label}</b>
      {timestamp
        ? <small>Last Updated <time dateTime={timestamp.iso} title={timestamp.zone}>{timestamp.label}</time> <span>{timestamp.zone === 'Africa/Lagos' ? 'WAT' : timestamp.zone}</span></small>
        : <small>{sync.detail}</small>}
    </span>
  </span>;
}
