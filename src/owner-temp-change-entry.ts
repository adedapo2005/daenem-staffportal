import './owner-temp-change.css';

type StatusResponse = {
  authenticated?: boolean;
  required?: boolean;
  owner?: boolean;
  displayName?: string;
  message?: string;
};

type ChangeResponse = {
  ok?: boolean;
  username?: string;
  signedOut?: boolean;
  message?: string;
  error?: string;
  reference?: string;
  passwordErrors?: string[];
};

const OVERLAY_ID = 'daenem-owner-password-change-gate';
let checking = false;
let mounted = false;
let statusTimer = 0;

function checks(password: string) {
  return [
    ['6+ characters', password.length >= 6],
    ['Uppercase', /[A-Z]/.test(password)],
    ['Lowercase', /[a-z]/.test(password)],
    ['Number', /[0-9]/.test(password)],
    ['Symbol', /[^A-Za-z0-9]/.test(password)],
  ] as const;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] || character));
}

function renderChecks(container: HTMLElement, password: string) {
  container.innerHTML = checks(password).map(([label, okay]) => `
    <span class="${okay ? 'pass' : 'wait'}"><i>${okay ? '✓' : '×'}</i>${label}</span>
  `).join('');
}

function mountGate(status: StatusResponse) {
  if (mounted || document.getElementById(OVERLAY_ID)) return;
  mounted = true;
  window.clearInterval(statusTimer);
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'owner-password-change-title');
  overlay.innerHTML = `
    <div class="owner-change-backdrop"></div>
    <section class="owner-change-card">
      <div class="owner-change-mark">D</div>
      <span class="owner-change-eyebrow">OWNER SECURITY · REQUIRED</span>
      <h1 id="owner-password-change-title">Create your private password</h1>
      <p class="owner-change-intro">${escapeHtml(status.message || 'You signed in with a temporary Owner password. Replace it before using the portal.')}</p>
      <div class="owner-change-verified">
        <span class="owner-change-check">✓</span>
        <div><strong>Temporary Owner access verified</strong><small>Your dashboard remains locked until this password is replaced.</small></div>
      </div>
      <form id="owner-password-change-form" novalidate>
        <label>
          <span class="sr-only">New private password required</span>
          <div class="owner-change-password-field">
            <input id="owner-change-password" type="password" autocomplete="new-password" placeholder="New private password • Required" required />
            <button type="button" data-toggle="owner-change-password" aria-label="Show password">Show</button>
          </div>
        </label>
        <label>
          <span class="sr-only">Confirm private password required</span>
          <div class="owner-change-password-field">
            <input id="owner-change-confirm" type="password" autocomplete="new-password" placeholder="Confirm private password • Required" required />
            <button type="button" data-toggle="owner-change-confirm" aria-label="Show password">Show</button>
          </div>
        </label>
        <div id="owner-change-checks" class="owner-change-checks" aria-label="Password checks"></div>
        <div id="owner-change-message" class="owner-change-message" hidden></div>
        <button id="owner-change-submit" class="owner-change-primary" type="submit">Save private password</button>
      </form>
      <div class="owner-change-note"><strong>One-time security step</strong><span>The temporary password will stop working as soon as your new password is saved.</span></div>
      <button id="owner-change-signout" class="owner-change-signout" type="button">Sign out instead</button>
    </section>
  `;
  document.body.appendChild(overlay);
  document.documentElement.classList.add('owner-password-change-required');

  const form = overlay.querySelector<HTMLFormElement>('#owner-password-change-form')!;
  const password = overlay.querySelector<HTMLInputElement>('#owner-change-password')!;
  const confirm = overlay.querySelector<HTMLInputElement>('#owner-change-confirm')!;
  const checkBox = overlay.querySelector<HTMLElement>('#owner-change-checks')!;
  const message = overlay.querySelector<HTMLElement>('#owner-change-message')!;
  const submit = overlay.querySelector<HTMLButtonElement>('#owner-change-submit')!;
  const signout = overlay.querySelector<HTMLButtonElement>('#owner-change-signout')!;

  const showMessage = (text: string, type: 'error' | 'success') => {
    message.hidden = false;
    message.className = `owner-change-message ${type}`;
    message.textContent = text;
  };

  const refreshChecks = () => renderChecks(checkBox, password.value);
  refreshChecks();
  password.addEventListener('input', refreshChecks);

  overlay.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = overlay.querySelector<HTMLInputElement>(`#${button.dataset.toggle}`);
      if (!target) return;
      const visible = target.type === 'text';
      target.type = visible ? 'password' : 'text';
      button.textContent = visible ? 'Show' : 'Hide';
      button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;
    if (password.value.length < 6) {
      showMessage('Your private password needs at least 6 characters.', 'error');
      password.focus();
      return;
    }
    if (password.value !== confirm.value) {
      showMessage('The two passwords do not match.', 'error');
      confirm.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Securing Owner account…';
    try {
      const response = await fetch('/api/owner/temporary-password/change', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: password.value, confirmPassword: confirm.value }),
      });
      const result = await response.json().catch(() => ({})) as ChangeResponse;
      if (!response.ok) {
        const details = result.passwordErrors?.length ? ` ${result.passwordErrors.join(' ')}` : '';
        const reference = result.reference ? ` Reference: ${result.reference}` : '';
        throw new Error(`${result.error || 'The password could not be saved.'}${details}${reference}`);
      }
      password.value = '';
      confirm.value = '';
      showMessage(result.message || 'Your private password is active. Returning to sign in…', 'success');
      submit.textContent = 'Password saved';
      window.setTimeout(() => { window.location.href = '/'; }, 1200);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'The password could not be saved. Please try again.', 'error');
      submit.disabled = false;
      submit.textContent = 'Save private password';
    }
  });

  signout.addEventListener('click', async () => {
    signout.disabled = true;
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' }); } catch { /* no-op */ }
    window.location.href = '/';
  });

  window.setTimeout(() => password.focus(), 50);
}

async function checkRequired() {
  if (checking || mounted) return;
  checking = true;
  try {
    const response = await fetch('/api/owner/temporary-password/status', {
      method: 'GET', credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' },
    });
    if (!response.ok) return;
    const result = await response.json() as StatusResponse;
    if (result.authenticated && result.owner && result.required) mountGate(result);
  } catch {
    // The normal unauthenticated/sign-in experience must never be disrupted by this guard.
  } finally {
    checking = false;
  }
}

function checkWhenVisible() {
  if (document.visibilityState === 'visible') void checkRequired();
}

window.addEventListener('load', checkWhenVisible);
window.addEventListener('focus', checkWhenVisible);
window.addEventListener('daenem-auth-changed', checkWhenVisible);
document.addEventListener('visibilitychange', checkWhenVisible);
statusTimer = window.setInterval(checkWhenVisible, 60_000);
