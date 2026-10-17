import { useCallback, useSyncExternalStore } from 'react';

const NAVIGATION_EVENT = 'daenem:v115-navigation';

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

function pathname() {
  return window.location.pathname;
}

function navigate(method: 'pushState' | 'replaceState', href: string) {
  window.history[method]({}, '', href);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0, behavior: 'auto' });
}

export function usePathname() {
  return useSyncExternalStore(subscribe, pathname, () => '/home');
}

export function useRouter() {
  const push = useCallback((href: string) => navigate('pushState', href), []);
  const replace = useCallback((href: string) => navigate('replaceState', href), []);
  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);
  const refresh = useCallback(() => window.location.reload(), []);
  return { push, replace, back, forward, refresh, prefetch: async () => undefined };
}
