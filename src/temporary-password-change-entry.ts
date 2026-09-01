import './temporary-password-change.css';

type Status = { authenticated?: boolean; required?: boolean; expired?: boolean; displayName?: string; username?: string; expiresAt?: string; message?: string };
type Result = { ok?: boolean; username?: string; message?: string; error?: string; reference?: string; passwordErrors?: string[] };

const ID = 'daenem-temporary-password-change-gate';
let mounted = false;
let checking = false;
let statusTimer = 0;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

function passwordChecks(password: string) {
  return [
    ['6+ characters', password.length >= 6],
    ['Uppercase', /[A-Z]/.test(password)],
    ['Lowercase', /[a-z]/.test(password)],
    ['Number', /[0-9]/.test(password)],
    ['Symbol', /[^A-Za-z0-9]/.test(password)],
  ] as const;
}

function mount(status: Status) {
  if (mounted || document.getElementById(ID)) return;
  mounted = true;
  window.clearInterval(statusTimer);
  const expired = Boolean(status.expired);
  const node = document.createElement('div');
  node.id = ID;
  node.innerHTML = `
    <div class="temp-change-backdrop"></div>
    <section class="temp-change-card" role="dialog" aria-modal="true" aria-labelledby="temp-change-title">
      <div class="temp-change-mark">D</div>
      <span class="temp-change-eyebrow">ACCOUNT SECURITY · REQUIRED</span>
      <h1 id="temp-change-title">${expired ? 'Temporary password expired' : 'Create your private password'}</h1>
      <p>${escapeHtml(status.message || 'Management issued a temporary password. Replace it before using the portal.')}</p>
      <div class="temp-change-verified"><b>✓</b><span><strong>${expired ? 'Temporary access expired' : 'Temporary access verified'}</strong><small>${expired ? 'Ask an Owner/Admin to issue a new temporary password.' : 'Your workspace remains locked until you create your own password.'}</small></span></div>
      ${expired ? '' : `<form id="temp-change-form">
        <label><input id="temp-change-password" type="password" autocomplete="new-password" placeholder="New private password • Required" required /><button type="button" data-toggle="temp-change-password">Show</button></label>
        <label><input id="temp-change-confirm" type="password" autocomplete="new-password" placeholder="Confirm private password • Required" required /><button type="button" data-toggle="temp-change-confirm">Show</button></label>
        <div id="temp-change-checks" class="temp-change-checks"></div>
        <div id="temp-change-message" class="temp-change-message" hidden></div>
        <button id="temp-change-submit" class="temp-change-primary" type="submit">Save private password</button>
      </form>`}
      <div class="temp-change-note"><strong>One-time security step</strong><span>${expired ? 'The expired temporary password cannot be used to access the workspace.' : 'The temporary password stops working as soon as your private password is saved.'}</span></div>
      <button id="temp-change-signout" class="temp-change-signout" type="button">Sign out</button>
    </section>`;
  document.body.appendChild(node);
  document.documentElement.classList.add('temporary-password-change-required');

  const signout = node.querySelector<HTMLButtonElement>('#temp-change-signout')!;
  signout.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' }); } catch { /* no-op */ }
    window.location.href = '/';
  });
  if (expired) return;

  const form = node.querySelector<HTMLFormElement>('#temp-change-form')!;
  const password = node.querySelector<HTMLInputElement>('#temp-change-password')!;
  const confirm = node.querySelector<HTMLInputElement>('#temp-change-confirm')!;
  const checks = node.querySelector<HTMLElement>('#temp-change-checks')!;
  const message = node.querySelector<HTMLElement>('#temp-change-message')!;
  const submit = node.querySelector<HTMLButtonElement>('#temp-change-submit')!;

  const renderChecks = () => { checks.innerHTML = passwordChecks(password.value).map(([label, ok]) => `<span class="${ok ? 'pass' : 'wait'}"><i>${ok ? '✓' : '×'}</i>${label}</span>`).join(''); };
  renderChecks(); password.addEventListener('input', renderChecks);
  node.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((button) => button.addEventListener('click', () => {
    const field = node.querySelector<HTMLInputElement>(`#${button.dataset.toggle}`); if (!field) return;
    field.type = field.type === 'password' ? 'text' : 'password'; button.textContent = field.type === 'password' ? 'Show' : 'Hide';
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); message.hidden = true;
    if (password.value.length < 6) { message.hidden = false; message.textContent = 'Use at least 6 characters.'; return; }
    if (password.value !== confirm.value) { message.hidden = false; message.textContent = 'The two passwords do not match.'; return; }
    submit.disabled = true; submit.textContent = 'Securing account…';
    try {
      const response = await fetch('/api/account/temporary-password/change', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newPassword: password.value, confirmPassword: confirm.value }) });
      const result = await response.json().catch(() => ({})) as Result;
      if (!response.ok) throw new Error(`${result.error || 'The password could not be saved.'}${result.passwordErrors?.length ? ` ${result.passwordErrors.join(' ')}` : ''}${result.reference ? ` Reference: ${result.reference}` : ''}`);
      message.hidden = false; message.className = 'temp-change-message success'; message.textContent = result.message || 'Password saved. Returning to sign in…';
      window.setTimeout(() => { window.location.href = '/'; }, 1000);
    } catch (error) {
      message.hidden = false; message.className = 'temp-change-message error'; message.textContent = error instanceof Error ? error.message : 'The password could not be saved.';
      submit.disabled = false; submit.textContent = 'Save private password';
    }
  });
  window.setTimeout(() => password.focus(), 40);
}

async function check() {
  if (mounted || checking) return; checking = true;
  try {
    const response = await fetch('/api/account/temporary-password/status', { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) return;
    const status = await response.json() as Status;
    if (status.authenticated && status.required) mount(status);
  } catch { /* do not disturb sign-in */ } finally { checking = false; }
}

function checkWhenVisible() {
  if (document.visibilityState === 'visible') void check();
}

window.addEventListener('load', checkWhenVisible);
window.addEventListener('focus', checkWhenVisible);
window.addEventListener('daenem-auth-changed', checkWhenVisible);
document.addEventListener('visibilitychange', checkWhenVisible);
statusTimer = window.setInterval(checkWhenVisible, 60_000);
