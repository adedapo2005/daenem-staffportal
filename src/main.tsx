import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import React, { lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen, useAuth } from './auth';
import { OfflinePlatformProvider } from './offline-sync';
import './signin-experience.css';

const ApprovedPostLoginV115 = lazy(() => import('./qa-review-v115-runtime'));

const SERVICE_WORKER_CACHE = 'daenem-workforce-shell-v17-signin-restoration';

function registerFreshServiceWorker() {
  if (!('serviceWorker' in navigator)) return () => undefined;
  let disposed = false;
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reloadKey = `daenem-sw-reload:${SERVICE_WORKER_CACHE}`;
  sessionStorage.removeItem(reloadKey);
  const onControllerChange = () => {
    if (disposed || !hadController || reloading || sessionStorage.getItem(reloadKey) === '1') return;
    reloading = true;
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  };
  const requestActivation = (registration: ServiceWorkerRegistration) => registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  const onUpdateFound = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => { if (installing.state === 'installed') requestActivation(registration); });
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then(async (registration) => {
      if (disposed) return;
      requestActivation(registration);
      registration.addEventListener('updatefound', () => onUpdateFound(registration));
      await registration.update();
      requestActivation(registration);
    })
    .catch((error: unknown) => console.warn('Staff Portal service worker update was not available.', error));
  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
}

function LoadingScreen() {
  return <div className="sp-entry-loading" role="status"><span /><strong>Opening DAENEM Staff Portal…</strong></div>;
}

function Root() {
  const auth = useAuth();
  useEffect(() => registerFreshServiceWorker(), []);
  if (auth.loading) return <LoadingScreen />;
  const studioReview = new URLSearchParams(window.location.search).get('studioReview');
  if (studioReview === 'signin-v180') return <AuthScreen onAuthenticated={() => undefined} />;
  if (!auth.context) return <AuthScreen onAuthenticated={(context) => {
    auth.setContext(context);
    window.dispatchEvent(new Event('daenem-auth-changed'));
  }} />;
  return (
    <OfflinePlatformProvider context={auth.context}>
      <Suspense fallback={<LoadingScreen />}>
        <ApprovedPostLoginV115 context={auth.context} onLogout={auth.logout} />
      </Suspense>
    </OfflinePlatformProvider>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
