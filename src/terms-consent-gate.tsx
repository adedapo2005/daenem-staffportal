import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './terms-consent-gate.css';

/**
 * A narrowly scoped legal-consent extension for the Owner-locked V180 UI.
 * We intentionally do not edit src/auth.tsx or the 128 protected V180 files.
 *
 * Inserts the required checkbox where the bottom Sign-In PWA install button
 * appears, or directly before first-step Create Account Continue. Gated
 * actions cannot enter sign-in, provider OAuth, or registration unless checked.
 * Password recovery and the Sign-In/Create Account tabs remain available.
 */
export function TermsConsentGate() {
  const [host] = useState(() => {
    const node = document.createElement('div');
    node.className = 'sp-terms-consent-host';
    return node;
  });
  const [accepted, setAccepted] = useState(false);
  const [warn, setWarn] = useState(false);
  const acceptedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const place = () => {
      if (disposed) return;
      const install = document.querySelector<HTMLElement>(
        '#staffportal-auth-mount .sp-auth-runtime .sp-install-card-v101',
      );
      const signupContinue = document.querySelector<HTMLButtonElement>(
        '#staffportal-auth-mount .usp-auth-panel[data-auth-mode="signup-identity"] ' +
        '.usp-signup-form button[type="submit"]',
      );
      const target = install || signupContinue;
      if (target?.parentElement) {
        if (host.parentElement !== target.parentElement ||
            host.nextElementSibling !== target) {
          target.parentElement.insertBefore(host, target);
        }
      } else if (host.isConnected) {
        host.remove();
      }
    };

    const deny = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setWarn(true);
      host.querySelector<HTMLInputElement>('#sp-terms-accept')?.focus({
        preventScroll: false,
      });
    };

    const onSubmit = (event: Event) => {
      if (acceptedRef.current) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) ||
          !form.closest('#staffportal-auth-mount')) return;
      if (form.matches('.sp-auth-form') ||
          form.matches('.usp-signup-form') ||
          form.closest('.usp-auth-panel[data-auth-mode^="signup-"]')) {
        deny(event);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (acceptedRef.current) return;
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button || !button.closest('#staffportal-auth-mount')) return;
      if (button.matches(
        '.sp-social-button, .sp-provider-flow-action, .usp-whatsapp-button, ' +
        '.usp-social-buttons button[aria-label^="Continue with"], ' +
        '.usp-whatsapp-start, .usp-signup-whatsapp-code button, ' +
        '.usp-whatsapp-stepup button',
      )) deny(event);
    };

    // Mutation observer is needed only because Sign-In and Create Account
    // swap the approved/legacy panel without modifying the locked source.
    const observer = new MutationObserver(place);
    observer.observe(document.getElementById('root') || document.body, {
      childList: true, subtree: true,
    });
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick, true);
    place();
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('click', onClick, true);
      host.remove();
    };
  }, [host]);

  return createPortal(
    <div className={'sp-terms-consent' + (warn && !accepted ? ' is-required' : '')}
      role="group" aria-label="Required Terms And Privacy Agreement">
      <input id="sp-terms-accept" type="checkbox" required
        checked={accepted} aria-required="true" aria-invalid={warn && !accepted}
        aria-describedby="sp-terms-accept-text"
        onChange={(event) => {
          acceptedRef.current = event.target.checked;
          setAccepted(event.target.checked);
          setWarn(false);
        }} />
      <div className="sp-terms-consent-copy" id="sp-terms-accept-text">
        <span className="sp-terms-consent-full">
          <label htmlFor="sp-terms-accept">I Accept The</label>{' '}
          <a href="/terms-and-conditions.html" target="_blank"
            rel="noopener noreferrer">Terms &amp; Conditions</a>{' '}
          And{' '}
          <a href="/privacy-policy.html" target="_blank"
            rel="noopener noreferrer">Privacy Policy</a>
        </span>
        <span className="sp-terms-consent-compact">
          <label htmlFor="sp-terms-accept">Accept</label>{' '}
          <a href="/terms-and-conditions.html" target="_blank"
            rel="noopener noreferrer" aria-label="Terms And Conditions">Terms</a>{' '}
          &amp;{' '}
          <a href="/privacy-policy.html" target="_blank"
            rel="noopener noreferrer" aria-label="Privacy Policy">Privacy</a>
        </span>
        <span className="sp-terms-consent-required" aria-hidden="true"> *</span>
        {warn && !accepted && <p className="sp-terms-consent-error"
          role="alert">Accept The Terms And Privacy Policy To Continue.</p>}
      </div>
    </div>,
    host,
  );
}
