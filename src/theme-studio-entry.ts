import './theme-studio.css';
import { applyThemeToDocument, normalizeThemeId, themeList } from './theme-system';

type ThemeOption = {
  id: string;
  name: string;
  mode: string;
  description: string;
  swatches: [string, string, string];
};
type ThemePolicy = { forcedTheme?: string; defaultTheme?: string; allowEmployeeChoice?: boolean; preferredTheme?: string; effectiveTheme?: string; canManage?: boolean };

const themes: ThemeOption[] = themeList.map((theme) => ({
  id: theme.id,
  name: theme.name,
  mode: `${theme.signInLayout} / ${theme.dashboardLayout}`,
  description: `${theme.focus}. ${theme.mood}.`,
  swatches: [theme.day.canvas, theme.day.surfaceStrong, theme.day.primary],
}));

const STORAGE_KEY = 'workforce-theme';
const modalId = 'daenem-theme-studio';
let policy: ThemePolicy | null = null;

function currentTheme() {
  return normalizeThemeId(document.documentElement.dataset.theme || localStorage.getItem(STORAGE_KEY));
}

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(String(data.error || `Request failed (${response.status})`)) as Error & { status?: number; forcedTheme?: string };
    error.status = response.status;
    error.forcedTheme = data.forcedTheme ? String(data.forcedTheme) : undefined;
    throw error;
  }
  return data as T;
}

function updateThemeColor(themeId: string) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const dark = document.documentElement.dataset.mode === 'night';
  const theme = themeList.find((item) => item.id === normalizeThemeId(themeId)) || themeList[0];
  meta.content = dark ? theme.night.canvas : theme.day.canvas;
}

function setVisualTheme(themeId: string) {
  const appliedTheme = applyThemeToDocument(themeId);
  localStorage.setItem(STORAGE_KEY, appliedTheme);
  updateThemeColor(appliedTheme);
  document.dispatchEvent(new CustomEvent('daenem:theme-change', { detail: { theme: appliedTheme } }));
  refreshSelectedState();
}

async function applyTheme(themeId: string) {
  setVisualTheme(themeId);
  try {
    await apiJson('/api/theme/preference', { method: 'POST', body: JSON.stringify({ theme: themeId }) });
    showThemeMessage('Theme saved to your Workforce profile.', 'success');
  } catch (error) {
    const e = error as Error & { forcedTheme?: string; status?: number };
    if (e.forcedTheme) {
      setVisualTheme(e.forcedTheme);
      showThemeMessage('The Owner has selected a Group-wide theme. Your workspace has been returned to that theme.', 'info');
    } else if (e.status !== 401) {
      showThemeMessage(e.message || 'Theme applied on this device.', 'info');
    }
  }
}

function refreshSelectedState() {
  const active = currentTheme();
  document.querySelectorAll<HTMLElement>('[data-theme-choice]').forEach((node) => {
    const selected = node.dataset.themeChoice === active;
    node.classList.toggle('selected', selected);
    node.setAttribute('aria-pressed', String(selected));
    const status = node.querySelector<HTMLElement>('.theme-selected-label');
    if (status) status.textContent = selected ? 'Selected' : 'Apply';
  });
}

function showThemeMessage(text: string, type: 'success' | 'info' | 'error' = 'info') {
  const box = document.querySelector<HTMLElement>('.theme-policy-message');
  if (!box) return;
  box.textContent = text;
  box.dataset.type = type;
  box.hidden = !text;
}

function themeCard(theme: ThemeOption) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-choice';
  button.dataset.themeChoice = theme.id;
  button.innerHTML = `
    <span class="theme-mini-preview" aria-hidden="true" style="--tp-bg:${theme.swatches[0]};--tp-surface:${theme.swatches[1]};--tp-accent:${theme.swatches[2]}">
      <i class="tp-rail"></i><i class="tp-top"></i><i class="tp-card one"></i><i class="tp-card two"></i><i class="tp-card three"></i>
    </span>
    <span class="theme-choice-copy"><strong>${theme.name}</strong><em>${theme.mode}</em><small>${theme.description}</small></span>
    <span class="theme-selected-label">Apply</span>`;
  button.addEventListener('click', () => void applyTheme(theme.id));
  return button;
}

function ensureModal() {
  let modal = document.getElementById(modalId);
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'theme-studio-backdrop';
  modal.hidden = true;
  modal.innerHTML = `
    <section class="theme-studio" role="dialog" aria-modal="true" aria-labelledby="theme-studio-title">
      <header class="theme-studio-head">
        <div><span>WORKSPACE APPEARANCE</span><h2 id="theme-studio-title">Choose your Daenem theme</h2><p>Change the visual experience without changing your menus, permissions or working functions.</p></div>
        <button type="button" class="theme-studio-close" aria-label="Close theme studio">×</button>
      </header>
      <div class="theme-studio-note"><strong>Live theme preview</strong><span>Your selection applies immediately and follows your Workforce profile when personal choice is enabled.</span></div>
      <div class="theme-policy-message" hidden></div>
      <div class="theme-owner-controls" hidden>
        <div><strong>Owner / Admin theme policy</strong><span>Use the currently selected theme as the Group default or force it for everyone.</span></div>
        <div class="theme-owner-actions"><button type="button" data-theme-admin="default">Set as Group default</button><button type="button" data-theme-admin="force">Force selected theme</button><button type="button" data-theme-admin="clear">Clear forced theme</button></div>
      </div>
      <div class="theme-choice-grid"></div>
    </section>`;
  const grid = modal.querySelector('.theme-choice-grid')!;
  themes.forEach((theme) => grid.appendChild(themeCard(theme)));
  modal.querySelector('.theme-studio-close')?.addEventListener('click', closeStudio);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeStudio(); });
  modal.querySelector('[data-theme-admin="default"]')?.addEventListener('click', () => void updateGroupPolicy('default'));
  modal.querySelector('[data-theme-admin="force"]')?.addEventListener('click', () => void updateGroupPolicy('force'));
  modal.querySelector('[data-theme-admin="clear"]')?.addEventListener('click', () => void updateGroupPolicy('clear'));
  document.body.appendChild(modal);
  refreshSelectedState();
  return modal;
}

async function loadPolicy() {
  try {
    policy = await apiJson<ThemePolicy>('/api/theme/policy');
    if (policy.effectiveTheme && normalizeThemeId(policy.effectiveTheme) !== currentTheme()) setVisualTheme(policy.effectiveTheme);
    const owner = document.querySelector<HTMLElement>('.theme-owner-controls');
    if (owner) owner.hidden = !policy.canManage;
    if (policy.forcedTheme) showThemeMessage(`Group-wide theme is currently forced to ${themes.find((t) => t.id === policy!.forcedTheme)?.name || policy.forcedTheme}.`, 'info');
    else showThemeMessage('', 'info');
  } catch {
    policy = null;
  }
}

async function updateGroupPolicy(action: 'default' | 'force' | 'clear') {
  const selected = currentTheme();
  const body = action === 'default' ? { defaultTheme: selected } : action === 'force' ? { forcedTheme: selected } : { forcedTheme: '' };
  try {
    policy = await apiJson<ThemePolicy>('/api/theme/policy', { method: 'POST', body: JSON.stringify(body) });
    if (policy.effectiveTheme) setVisualTheme(policy.effectiveTheme);
    showThemeMessage(action === 'default' ? 'Group default theme updated.' : action === 'force' ? 'Selected theme is now forced for the Group.' : 'Forced theme cleared. Employees may use their permitted preference.', 'success');
  } catch (error) {
    showThemeMessage((error as Error).message, 'error');
  }
}

async function openStudio() {
  const modal = ensureModal();
  modal.hidden = false;
  document.body.classList.add('theme-studio-open');
  refreshSelectedState();
  await loadPolicy();
  (modal.querySelector('.theme-studio-close') as HTMLButtonElement | null)?.focus();
}

function closeStudio() {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
  document.body.classList.remove('theme-studio-open');
}

function themeIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.4a1.6 1.6 0 0 0 .25-3.18l-.58-.1a1.7 1.7 0 0 1 .28-3.38H16a5 5 0 0 0 5-5C21 5.84 17.15 3 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.6" cy="10" r="1" fill="currentColor"/><circle cx="10" cy="6.8" r="1" fill="currentColor"/><circle cx="14" cy="6.7" r="1" fill="currentColor"/><circle cx="17" cy="9.2" r="1" fill="currentColor"/></svg>`;
}

function installTrigger() {
  const actions = document.querySelector('.top-actions');
  if (!actions || actions.querySelector('.theme-studio-trigger')) return false;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'theme-studio-trigger';
  trigger.setAttribute('aria-label', 'Choose workspace theme');
  trigger.title = 'Themes';
  trigger.innerHTML = `${themeIcon()}<span>Themes</span>`;
  trigger.addEventListener('click', () => void openStudio());
  const profile = actions.querySelector('.profile-wrap');
  actions.insertBefore(trigger, profile || null);
  void loadPolicy();
  return true;
}

function boot() {
  updateThemeColor(currentTheme());
  ensureModal();
  if (installTrigger()) return;
  const observer = new MutationObserver(() => {
    if (installTrigger()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStudio(); });
new MutationObserver(() => refreshSelectedState()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
