import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  children?: ReactNode;
  replace?: boolean;
};

function resolveHref(href: LinkProps['href']) {
  if (typeof href === 'string') return href;
  const query = new URLSearchParams(href.query || {}).toString();
  return `${href.pathname || '/'}${query ? `?${query}` : ''}`;
}

export default function Link({ href, replace = false, onClick, children, ...props }: LinkProps) {
  const resolved = resolveHref(href);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (/^(?:https?:|mailto:|tel:)/.test(resolved)) return;
    event.preventDefault();
    window.history[replace ? 'replaceState' : 'pushState']({}, '', resolved);
    window.dispatchEvent(new Event('daenem:v115-navigation'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  return <a {...props} href={resolved} onClick={handleClick}>{children}</a>;
}
