import './theme-studio.css';
import { applyThemeToDocument, normalizeThemeId, themeList } from './theme-system';
import { fetchAdminSignInPreferences, normalizeSignInPreferences, nextSignInWidgetId, readSignInPreferences, saveSignInPreferences, WORLD_CLOCK_CATALOG, DEFAULT_SIGNIN_PREFERENCES, SIGNIN_LABEL_LIMITS, SIGNIN_WIDGET_VARIANTS, type SignInExperiencePreferences, type SignInWidgetId, type SignInWidgetInstance } from './signin-preferences';

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
let signInConfig: SignInExperiencePreferences = readSignInPreferences();
let signInSaveState: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
let signInSaveQueue: Promise<void> = Promise.resolve();
let aiOptions: Record<string, string[]> = {};
let draggedWidgetId: string | null = null;

const signInWidgetLabels: Record<SignInWidgetId, string> = {
  weather: 'Live Weather',
  inspiration: 'AI Inspiration',
  motivation: 'Employee Motivation',
  news: 'Live News',
  status: 'Portal Status',
};

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
      <section class="signin-theme-admin" hidden>
        <div class="signin-theme-admin-head"><div><strong>Live sign-in controls</strong><span>Manage the public sign-in widgets, clocks, scheduled dark mode, logo placement, and effects.</span></div><span class="signin-theme-save-state" data-state="idle">Central settings</span></div>
        <div class="signin-theme-admin-body"></div>
      </section>
      <div class="theme-choice-grid"></div>
    </section>`;
  const grid = modal.querySelector('.theme-choice-grid')!;
  themes.forEach((theme) => grid.appendChild(themeCard(theme)));
  modal.querySelector('.theme-studio-close')?.addEventListener('click', closeStudio);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeStudio(); });
  modal.querySelector('[data-theme-admin="default"]')?.addEventListener('click', () => void updateGroupPolicy('default'));
  modal.querySelector('[data-theme-admin="force"]')?.addEventListener('click', () => void updateGroupPolicy('force'));
  modal.querySelector('[data-theme-admin="clear"]')?.addEventListener('click', () => void updateGroupPolicy('clear'));
  modal.querySelector('.signin-theme-admin')?.addEventListener('change', handleSignInAdminChange);
  modal.querySelector('.signin-theme-admin')?.addEventListener('click', handleSignInAdminClick);
  modal.querySelector('.signin-theme-admin')?.addEventListener('dragstart', handleSignInDragStart);
  modal.querySelector('.signin-theme-admin')?.addEventListener('dragover', (event) => { if ((event.target as Element | null)?.closest('[data-signin-widget]')) event.preventDefault(); });
  modal.querySelector('.signin-theme-admin')?.addEventListener('drop', handleSignInDrop);
  document.body.appendChild(modal);
  refreshSelectedState();
  return modal;
}


function escapeHtml(value: unknown) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}
function optionMarkup(values: string[], selected: string, labels: Record<string, string> = {}) {
  return values.map((value) => '<option value="' + escapeHtml(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(labels[value] || value.replace(/-/g, ' ')) + '</option>').join('');
}
function signInWidgetRow(instance: SignInWidgetInstance, index: number) {
  const variants = SIGNIN_WIDGET_VARIANTS[instance.kind];
  return '<div class="signin-admin-row" draggable="true" data-signin-widget="' + escapeHtml(instance.id) + '">' +
    '<label class="signin-widget-visible"><input type="checkbox" data-widget-visible="' + escapeHtml(instance.id) + '"' + (instance.visible ? ' checked' : '') + '><span>' + escapeHtml(instance.label) + '</span></label>' +
    '<select data-widget-zone="' + escapeHtml(instance.id) + '" aria-label="Move ' + escapeHtml(instance.label) + ' to zone">' + optionMarkup(['workspace-spotlight', 'live-context', 'today', 'auxiliary'], instance.zone, { 'workspace-spotlight': 'Workspace Spotlight', 'live-context': 'Live Context', today: 'Today', auxiliary: 'Auxiliary' }) + '</select>' +
    '<select data-widget-kind="' + escapeHtml(instance.id) + '" aria-label="Replace ' + escapeHtml(instance.label) + '">' + optionMarkup(Object.keys(signInWidgetLabels), instance.kind, signInWidgetLabels) + '</select>' +
    '<select data-widget-variant="' + escapeHtml(instance.id) + '" aria-label="Choose ' + escapeHtml(instance.label) + ' variant">' + optionMarkup(variants, instance.variant) + '</select>' +
    '<select data-widget-effect="' + escapeHtml(instance.id) + '" aria-label="Choose ' + escapeHtml(instance.label) + ' effect">' + optionMarkup(['quiet', 'glass', 'accent', 'soft'], instance.effectPreset) + '</select>' +
    '<span class="signin-admin-order"><button type="button" data-widget-move="' + escapeHtml(instance.id) + '" data-direction="-1" ' + (index === 0 ? 'disabled' : '') + ' aria-label="Move ' + escapeHtml(instance.label) + ' up">↑</button><button type="button" data-widget-move="' + escapeHtml(instance.id) + '" data-direction="1" ' + (index === signInConfig.widgetInstances.length - 1 ? 'disabled' : '') + ' aria-label="Move ' + escapeHtml(instance.label) + ' down">↓</button></span>' +
    '<button type="button" class="signin-admin-remove" data-widget-remove="' + escapeHtml(instance.id) + '" aria-label="Remove ' + escapeHtml(instance.label) + '">×</button>' +
  '</div>';
}
function renderSignInAdmin() {
  const root = document.querySelector<HTMLElement>('.signin-theme-admin-body');
  if (!root) return;
  const labels = signInConfig.labels;
  const labelInput = (path: string, label: string, value: string, max: number, multiline = false) =>
    '<label>' + label + (multiline ? '<textarea data-signin-field="' + path + '" maxlength="' + max + '">' + escapeHtml(value) + '</textarea>' : '<input data-signin-field="' + path + '" maxlength="' + max + '" value="' + escapeHtml(value) + '">') + '</label>';
  const locationRows = WORLD_CLOCK_CATALOG.map((location) => {
    const checked = signInConfig.clockZones.includes(location.zone);
    const disabled = !checked && signInConfig.clockZones.length >= signInConfig.globalOperations.maxClocks;
    const clockIndex = signInConfig.clockZones.indexOf(location.zone);
    const order = checked ? '<span class="signin-clock-order"><button type="button" data-clock-move="' + location.zone + '" data-direction="-1"' + (clockIndex <= 0 ? ' disabled' : '') + ' aria-label="Move ' + escapeHtml(location.name) + ' up">↑</button><button type="button" data-clock-move="' + location.zone + '" data-direction="1"' + (clockIndex === signInConfig.clockZones.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + escapeHtml(location.name) + ' down">↓</button></span>' : '';
    return '<div class="signin-location-row"><label class="signin-location-main"><input type="checkbox" data-clock-zone="' + location.zone + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span><strong>' + escapeHtml(location.name) + '</strong><small>' + escapeHtml(location.region) + (disabled ? ' · remove one first' : '') + '</small></span></label>' + order + '</div>';
  }).join('');
  const aiMarkup = (kind: 'inspiration' | 'motivation') => {
    const options = aiOptions[kind] || [];
    return '<div class="signin-ai-block"><div><strong>' + (kind === 'inspiration' ? 'AI Inspiration' : 'Employee Motivation') + '</strong><small>Generate candidates only when an administrator requests them.</small></div><button type="button" data-ai-generate="' + kind + '">Generate 3 options</button>' +
      (options.length ? '<div class="signin-ai-options">' + options.map((value, index) => '<button type="button" data-ai-option-kind="' + kind + '" data-ai-option-index="' + index + '">' + escapeHtml(value) + '</button>').join('') + '</div>' : '') + '</div>';
  };
  root.innerHTML =
    '<div class="signin-admin-sections">' +
      '<section class="signin-admin-section"><h4>LAYOUT</h4><p>Responsive zones keep the authentication region protected while widgets can move safely.</p><div class="signin-admin-grid">' +
        '<label>Motion level<select data-signin-field="effectLevel">' + optionMarkup(['calm', 'balanced', 'vivid'], signInConfig.effectLevel) + '</select></label>' +
        '<label>Theme behavior<select data-signin-field="themeMode">' + optionMarkup(['auto', 'day', 'night'], signInConfig.themeMode, { auto: 'Automatic schedule', day: 'Always daylight', night: 'Always dark' }) + '</select></label>' +
        '<label>Dark mode starts<input type="time" data-signin-field="darkStart" value="' + signInConfig.darkStart + '"' + (signInConfig.themeMode !== 'auto' ? ' disabled' : '') + '></label>' +
        '<label>Day mode returns<input type="time" data-signin-field="darkEnd" value="' + signInConfig.darkEnd + '"' + (signInConfig.themeMode !== 'auto' ? ' disabled' : '') + '></label>' +
      '</div></section>' +
      '<section class="signin-admin-section"><h4>BRANDING</h4><div class="signin-admin-grid">' +
        '<label>Position<select data-signin-field="logo.position">' + optionMarkup(['left', 'center', 'right'], signInConfig.logo.position) + '</select></label>' +
        '<label>Size<select data-signin-field="logo.size">' + optionMarkup(['compact', 'standard', 'prominent'], signInConfig.logo.size) + '</select></label>' +
        '<label>Alignment<select data-signin-field="logo.alignment">' + optionMarkup(['start', 'center', 'end'], signInConfig.logo.alignment) + '</select></label>' +
        '<label>Animation<select data-signin-field="logo.animation">' + optionMarkup(['none', 'float', 'orbit', 'pulse'], signInConfig.logo.animation) + '</select></label>' +
        '<label class="signin-check"><input type="checkbox" data-signin-field="logo.glass"' + (signInConfig.logo.glass ? ' checked' : '') + '> Glass backing</label>' +
      '</div></section>' +
      '<section class="signin-admin-section"><h4>WIDGETS</h4><p>Add, remove, show, hide, reorder, move between responsive zones, and choose a presentation variant.</p><div class="signin-widget-list">' + signInConfig.widgetInstances.map(signInWidgetRow).join('') + '</div><label class="signin-add-widget">Add widget<select data-widget-add><option value="">Choose a widget…</option>' + optionMarkup(['weather', 'status', 'inspiration', 'motivation', 'news'], '', signInWidgetLabels) + '</select></label></section>' +
      '<section class="signin-admin-section"><h4>LABELS</h4><div class="signin-admin-grid signin-label-grid">' +
        labelInput('labels.brandEyebrow', 'Brand eyebrow', labels.brandEyebrow, SIGNIN_LABEL_LIMITS.brandEyebrow) +
        labelInput('labels.brandTitle', 'Portal title', labels.brandTitle, SIGNIN_LABEL_LIMITS.brandTitle) +
        labelInput('labels.brandTagline', 'Tagline', labels.brandTagline, SIGNIN_LABEL_LIMITS.brandTagline) +
        labelInput('labels.workspaceLabel', 'Workspace label', labels.workspaceLabel, SIGNIN_LABEL_LIMITS.workspaceLabel) +
        labelInput('labels.workspaceHeadline', 'Workspace headline', labels.workspaceHeadline, SIGNIN_LABEL_LIMITS.workspaceHeadline) +
        labelInput('labels.workspaceDescription', 'Workspace description', labels.workspaceDescription, SIGNIN_LABEL_LIMITS.workspaceDescription, true) +
        labelInput('labels.liveContextHeading', 'Live Context heading', labels.liveContextHeading, SIGNIN_LABEL_LIMITS.sectionHeading) +
        labelInput('labels.todayHeading', 'Today heading', labels.todayHeading, SIGNIN_LABEL_LIMITS.sectionHeading) +
        labelInput('labels.workspaceSpotlightHeading', 'Workspace Spotlight heading', labels.workspaceSpotlightHeading, SIGNIN_LABEL_LIMITS.sectionHeading) +
        labelInput('labels.auxiliaryHeading', 'Auxiliary heading', labels.auxiliaryHeading, SIGNIN_LABEL_LIMITS.sectionHeading) +
        labelInput('labels.globalOperationsHeading', 'Global Operations heading', labels.globalOperationsHeading, SIGNIN_LABEL_LIMITS.sectionHeading) +
        labelInput('labels.liveErpAccess', 'Live ERP access label', labels.liveErpAccess, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.installApp', 'Install App label', labels.installApp, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.ibadanTime', 'Ibadan time label', labels.ibadanTime, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.session', 'Session label', labels.session, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.protected', 'Protected label', labels.protected, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.encryptedSession', 'Encrypted session label', labels.encryptedSession, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.secureService', 'Secure service label', labels.secureService, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.weatherLoading', 'Weather loading label', labels.weatherLoading, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.weatherLocation', 'Weather location label', labels.weatherLocation, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.weatherConnecting', 'Weather connecting label', labels.weatherConnecting, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.weatherUpdated', 'Weather updated label', labels.weatherUpdated, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.liveGuidanceNote', 'Guidance note', labels.liveGuidanceNote, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.dailyMomentumNote', 'Momentum note', labels.dailyMomentumNote, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.rotatingLiveFeed', 'Live feed note', labels.rotatingLiveFeed, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.statusOperational', 'Operational status label', labels.statusOperational, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.statusMaintenance', 'Maintenance status label', labels.statusMaintenance, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.statusChecking', 'Checking status label', labels.statusChecking, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.statusConnecting', 'Status connecting label', labels.statusConnecting, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.clockSummary', 'Clock summary label', labels.clockSummary, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.inspirationSpark', 'Inspiration spark label', labels.inspirationSpark, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.promptOfTheDay', 'Prompt of the day label', labels.promptOfTheDay, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.promptOfTheDayNote', 'Prompt note', labels.promptOfTheDayNote, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.teamBoost', 'Team boost label', labels.teamBoost, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.recognition', 'Recognition label', labels.recognition, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.focusGoal', 'Focus goal label', labels.focusGoal, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.recognitionNote', 'Recognition note', labels.recognitionNote, SIGNIN_LABEL_LIMITS.support) +
        labelInput('labels.priorityBriefing', 'Priority briefing label', labels.priorityBriefing, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.secureEdge', 'Secure edge label', labels.secureEdge, SIGNIN_LABEL_LIMITS.display) +
        labelInput('labels.serviceTeamNotified', 'Service notification label', labels.serviceTeamNotified, SIGNIN_LABEL_LIMITS.display) +
        Object.keys(labels.auth).map((key) => labelInput('labels.auth.' + key, 'Auth · ' + key.replace(/([A-Z])/g, ' $1'), labels.auth[key as keyof typeof labels.auth], SIGNIN_LABEL_LIMITS.support)).join('') +
        Object.keys(labels.widgetLabels).map((kind) => labelInput('labels.widgetLabels.' + kind, signInWidgetLabels[kind as SignInWidgetId] + ' label', labels.widgetLabels[kind as SignInWidgetId], SIGNIN_LABEL_LIMITS.widget)).join('') +
      '</div></section>' +
      '<section class="signin-admin-section"><h4>WORLD CLOCKS</h4><p>Choose up to seven locations from the expanded catalogue.</p><div class="signin-admin-grid">' +
        '<label>Clock style<select data-signin-field="clockStyle">' + optionMarkup(['minimal', 'detailed', 'neon', 'classic'], signInConfig.clockStyle) + '</select></label>' +
        '<label>Temperature unit<select data-signin-field="temperatureUnit">' + optionMarkup(['F', 'C'], signInConfig.temperatureUnit, { F: 'Fahrenheit (°F)', C: 'Celsius (°C)' }) + '</select></label>' +
        '<label>Visible clocks<select data-signin-field="globalOperations.maxClocks">' + optionMarkup(['1', '2', '3', '4', '5', '6', '7'], String(signInConfig.globalOperations.maxClocks)) + '</select></label>' +
        '<label class="signin-check"><input type="checkbox" data-signin-field="globalOperations.visible"' + (signInConfig.globalOperations.visible ? ' checked' : '') + '> Show Global Operations</label>' +
      '</div><div class="signin-display-toggles">' + [['showAnalog','Analog clock'],['showDigital','Digital time'],['showDate','Date'],['showTimezone','Timezone'],['showDayNight','Day/night'],['showWeather','Weather'],['showFeelsLike','Feels like'],['showHumidity','Humidity'],['showWind','Wind'],['showPrecipitation','Precipitation'],['showHighLow','High / low'],['showSunriseSunset','Sunrise / sunset']].map(([key,label]) => '<label class="signin-check"><input type="checkbox" data-signin-field="globalOperations.' + key + '"' + (signInConfig.globalOperations[key as keyof typeof signInConfig.globalOperations] ? ' checked' : '') + '> ' + label + '</label>').join('') + '</div><div class="signin-admin-grid"><label>Weather style<select data-signin-field="globalOperations.weatherStyle">' + optionMarkup(['detailed', 'compact', 'visual'], signInConfig.globalOperations.weatherStyle) + '</select></label><label>Weather animation<select data-signin-field="globalOperations.weatherAnimation">' + optionMarkup(['none', 'subtle', 'expressive'], signInConfig.globalOperations.weatherAnimation) + '</select></label></div><div class="signin-location-list">' + locationRows + '</div></section>' +
      '<section class="signin-admin-section"><h4>EFFECTS</h4><div class="signin-display-toggles">' + [['ambientGlow','Ambient glow'],['backgroundBreathing','Background breathing'],['cardFloat','Card float'],['logoMotion','Logo motion'],['statusPulse','Status pulse'],['widgetEntrance','Widget entrance'],['shimmer','Shimmer']].map(([key,label]) => '<label class="signin-check"><input type="checkbox" data-signin-field="effects.' + key + '"' + (signInConfig.effects[key as keyof typeof signInConfig.effects] ? ' checked' : '') + '> ' + label + '</label>').join('') + '</div><label>Glass intensity<input type="range" min="0" max="100" step="1" data-signin-field="effects.glassIntensity" value="' + signInConfig.effects.glassIntensity + '"></label></section>' +
      '<section class="signin-admin-section"><h4>AI CONTENT</h4>' + aiMarkup('inspiration') + aiMarkup('motivation') + '<p class="signin-admin-note">News remains source-bound to verified RSS headlines; AI cannot fabricate news.</p></section>' +
      '<section class="signin-admin-section signin-admin-preview"><h4>PREVIEW</h4><p>Open the public sign-in surface in a separate tab to review the saved central configuration.</p><button type="button" data-signin-preview>Open sign-in preview</button></section>' +
      '<section class="signin-admin-section signin-admin-recovery"><h4>RESET / RECOVERY</h4><button type="button" data-signin-reset="complete">Reset complete sign-in layout</button><button type="button" data-signin-reset="widgets">Reset widgets</button><span>Changes are saved centrally and can be restored to safe defaults.</span></section>' +
    '</div>';
  const state = document.querySelector<HTMLElement>('.signin-theme-save-state');
  if (state) {
    state.dataset.state = signInSaveState;
    state.textContent = signInSaveState === 'saving' ? 'Saving…' : signInSaveState === 'saved' ? 'Saved live' : signInSaveState === 'error' ? 'Save failed' : 'Central V3 settings';
  }
}
function queueSignInConfigSave(next: SignInExperiencePreferences) {
  signInConfig = normalizeSignInPreferences(next);
  signInSaveState = 'saving';
  renderSignInAdmin();
  signInSaveQueue = signInSaveQueue.then(async () => {
    try {
      signInConfig = await saveSignInPreferences(signInConfig);
      signInSaveState = 'saved';
      renderSignInAdmin();
      window.setTimeout(() => {
        if (signInSaveState === 'saved') {
          signInSaveState = 'idle';
          renderSignInAdmin();
        }
      }, 1800);
    } catch {
      signInSaveState = 'error';
      renderSignInAdmin();
    }
  });
}

function cloneSignInConfig() {
  return JSON.parse(JSON.stringify(signInConfig)) as SignInExperiencePreferences;
}
function setConfigPath(config: SignInExperiencePreferences, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor = config as unknown as Record<string, unknown>;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  });
  cursor[parts[parts.length - 1]] = value;
}
function handleSignInAdminChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target) return;
  const path = target.dataset.signinField;
  if (path) {
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target.value;
    const next = cloneSignInConfig();
    setConfigPath(next, path, value);
    const widgetLabelMatch = path.match(/^labels\.widgetLabels\.(weather|inspiration|motivation|news|status)$/);
    if (widgetLabelMatch) {
      next.widgetInstances = next.widgetInstances.map((item) => item.kind === widgetLabelMatch[1] ? { ...item, label: String(value) } : item);
    }
    queueSignInConfigSave(next);
    return;
  }
  const widgetId = target.dataset.widgetVisible || target.dataset.widgetZone || target.dataset.widgetVariant || target.dataset.widgetKind || target.dataset.widgetEffect;
  if (widgetId) {
    const next = cloneSignInConfig();
    const instance = next.widgetInstances.find((item) => item.id === widgetId);
    if (!instance) return;
    if (target.dataset.widgetVisible) instance.visible = target instanceof HTMLInputElement && target.checked;
    if (target.dataset.widgetZone) instance.zone = target.value as SignInWidgetInstance['zone'];
    if (target.dataset.widgetVariant) instance.variant = target.value as SignInWidgetInstance['variant'];
    if (target.dataset.widgetEffect) instance.effectPreset = target.value as SignInWidgetInstance['effectPreset'];
    if (target.dataset.widgetKind) {
      instance.kind = target.value as SignInWidgetId;
      instance.variant = SIGNIN_WIDGET_VARIANTS[instance.kind][0];
      instance.label = next.labels.widgetLabels[instance.kind];
    }
    queueSignInConfigSave(next);
    return;
  }
  const zone = target.dataset.clockZone;
  if (zone && target instanceof HTMLInputElement) {
    const next = cloneSignInConfig();
    const clockZones = target.checked ? [...new Set([...next.clockZones, zone])].slice(0, next.globalOperations.maxClocks) : next.clockZones.filter((item) => item !== zone);
    if (clockZones.length) { next.clockZones = clockZones; queueSignInConfigSave(next); }
  }
  const addKind = target.dataset.widgetAdd;
  if (addKind) {
    const kind = addKind as SignInWidgetId;
    if (!(kind in SIGNIN_WIDGET_VARIANTS)) return;
    const next = cloneSignInConfig();
    next.widgetInstances.push({ id: nextSignInWidgetId(kind, next.widgetInstances), kind, variant: SIGNIN_WIDGET_VARIANTS[kind][0], zone: kind === 'weather' || kind === 'status' ? 'live-context' : 'today', order: next.widgetInstances.length, visible: true, label: next.labels.widgetLabels[kind], effectPreset: 'glass' });
    queueSignInConfigSave(next);
  }
}
function handleSignInDragStart(event: Event) {
  const row = (event.target as Element | null)?.closest<HTMLElement>('[data-signin-widget]');
  if (!row) return;
  draggedWidgetId = row.dataset.signinWidget || null;
  const dragEvent = event as DragEvent;
  if (draggedWidgetId && dragEvent.dataTransfer) dragEvent.dataTransfer.setData('text/plain', draggedWidgetId);
}
function handleSignInDrop(event: Event) {
  event.preventDefault();
  const row = (event.target as Element | null)?.closest<HTMLElement>('[data-signin-widget]');
  const destinationId = row?.dataset.signinWidget;
  const sourceId = draggedWidgetId || (event as DragEvent).dataTransfer?.getData('text/plain');
  draggedWidgetId = null;
  if (!sourceId || !destinationId || sourceId === destinationId) return;
  const from = signInConfig.widgetInstances.findIndex((item) => item.id === sourceId);
  const to = signInConfig.widgetInstances.findIndex((item) => item.id === destinationId);
  if (from < 0 || to < 0) return;
  const next = cloneSignInConfig();
  const [instance] = next.widgetInstances.splice(from, 1);
  next.widgetInstances.splice(to, 0, instance);
  queueSignInConfigSave(next);
}
async function generateAi(kind: 'inspiration' | 'motivation') {
  try {
    const result = await apiJson<{ candidates: string[] }>('/api/theme/signin/ai/generate', { method: 'POST', body: JSON.stringify({ kind }) });
    aiOptions = { ...aiOptions, [kind]: result.candidates };
    renderSignInAdmin();
  } catch {
    aiOptions = { ...aiOptions, [kind]: [] };
    renderSignInAdmin();
  }
}
function handleSignInAdminClick(event: Event) {
  const target = event.target as Element | null;
  const move = target?.closest<HTMLButtonElement>('[data-widget-move]');
  const remove = target?.closest<HTMLButtonElement>('[data-widget-remove]');
  const reset = target?.closest<HTMLButtonElement>('[data-signin-reset]');
  const generate = target?.closest<HTMLButtonElement>('[data-ai-generate]');
  const option = target?.closest<HTMLButtonElement>('[data-ai-option-kind]');
  const preview = target?.closest<HTMLButtonElement>('[data-signin-preview]');
  const clockMove = target?.closest<HTMLButtonElement>('[data-clock-move]');
  if (move) {
    const id = move.dataset.widgetMove;
    const index = signInConfig.widgetInstances.findIndex((item) => item.id === id);
    const destination = index + Number(move.dataset.direction || 0);
    if (index >= 0 && destination >= 0 && destination < signInConfig.widgetInstances.length) {
      const next = cloneSignInConfig();
      const instances = next.widgetInstances;
      [instances[index], instances[destination]] = [instances[destination], instances[index]];
      queueSignInConfigSave(next);
    }
    return;
  }
  if (remove) {
    const next = cloneSignInConfig();
    next.widgetInstances = next.widgetInstances.filter((item) => item.id !== remove.dataset.widgetRemove);
    queueSignInConfigSave(next);
    return;
  }
  if (clockMove) {
    const zone = clockMove.dataset.clockMove;
    const index = zone ? signInConfig.clockZones.indexOf(zone) : -1;
    const destination = index + Number(clockMove.dataset.direction || 0);
    if (index >= 0 && destination >= 0 && destination < signInConfig.clockZones.length) {
      const next = cloneSignInConfig();
      [next.clockZones[index], next.clockZones[destination]] = [next.clockZones[destination], next.clockZones[index]];
      queueSignInConfigSave(next);
    }
    return;
  }
  if (reset?.dataset.signinReset === 'complete') {
    queueSignInConfigSave(JSON.parse(JSON.stringify(DEFAULT_SIGNIN_PREFERENCES)) as SignInExperiencePreferences);
    return;
  }
  if (reset?.dataset.signinReset === 'widgets') {
    const next = cloneSignInConfig();
    next.widgetInstances = JSON.parse(JSON.stringify(DEFAULT_SIGNIN_PREFERENCES.widgetInstances));
    queueSignInConfigSave(next);
    return;
  }
  if (generate && (generate.dataset.aiGenerate === 'inspiration' || generate.dataset.aiGenerate === 'motivation')) {
    void generateAi(generate.dataset.aiGenerate);
    return;
  }
  if (option) {
    const kind = option.dataset.aiOptionKind as 'inspiration' | 'motivation';
    const value = aiOptions[kind]?.[Number(option.dataset.aiOptionIndex)];
    if (!value) return;
    const next = cloneSignInConfig();
    next.content[kind] = value;
    queueSignInConfigSave(next);
    return;
  }
  if (preview) {
    window.open('/', '_blank', 'noopener,noreferrer');
  }
}
async function loadSignInAdmin(canManage: boolean) {
  const section = document.querySelector<HTMLElement>('.signin-theme-admin');
  if (!section) return;
  section.hidden = !canManage;
  if (!canManage) return;
  signInSaveState = 'idle';
  renderSignInAdmin();
  try {
    const result = await fetchAdminSignInPreferences();
    signInConfig = result.config;
    section.hidden = !result.canManage;
    renderSignInAdmin();
  } catch {
    signInSaveState = 'error';
    renderSignInAdmin();
  }
}

async function loadPolicy() {
  try {
    policy = await apiJson<ThemePolicy>('/api/theme/policy');
    if (policy.effectiveTheme && normalizeThemeId(policy.effectiveTheme) !== currentTheme()) setVisualTheme(policy.effectiveTheme);
    const owner = document.querySelector<HTMLElement>('.theme-owner-controls');
    if (owner) owner.hidden = !policy.canManage;
    await loadSignInAdmin(Boolean(policy.canManage));
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
