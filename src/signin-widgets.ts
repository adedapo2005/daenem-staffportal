// Hydrate the four approved Sign-In widgets from their existing public V180
// services. Their outer cards, photographs and Owner Studio remain untouched.
type Item = { id: string; title: string; source: string; link: string; published: string; summary: string; categories: string };
type Feed = { state: string; latest: Item[]; intelligence: Record<string, Item[]>; sources: { name: string }[]; updated_at: string };
type Behaviour = {
  liveMode?: boolean; scrollBehavior?: string; autoScroll?: boolean; rotationPaused?: boolean;
  rotationSeconds?: number; cycleSeconds?: number; autoCycleIntervalSeconds?: number;
  refreshMinutes?: number; wireEnabled?: boolean; wireSpeed?: string; tickerSpeed?: string;
  tickerDirection?: string; tickerPaused?: boolean; tickerPauseOnHover?: boolean;
  tickerShowSource?: boolean; tickerShowFreshness?: boolean; tickerSeparator?: string;
  showMeta?: boolean; showSourceTime?: boolean; showSource?: boolean; showFreshness?: boolean; showSummary?: boolean;
  transitionDuration?: number; transition?: string; transitionStyle?: string; contentOrder?: string;
  enabledSources?: string[]; sourcePriority?: string[]; dominantSource?: string; rotationMode?: string;
};
const domains = ['Security', 'Economy', 'Politics', 'Agriculture', 'Energy', 'Infrastructure'];
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const minutes = (value: number | undefined, fallback: number) => Math.max(1, Math.min(60, value || fallback)) * 60_000;
const node = (tag: string, className: string, value = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
};
function append(parent: HTMLElement, ...children: Node[]) { children.forEach(child => parent.appendChild(child)); }
function link(className: string, value: string, href: string) {
  let safe = '';
  try { const url = new URL(href); if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) safe = url.href; } catch { /* Keep an unlinked title readable. */ }
  const element = node(safe ? 'a' : 'span', className, value);
  if (element instanceof HTMLAnchorElement) { element.href = safe; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
  return element;
}
function trailing(element: Element | null, value: string) {
  if (!element) return;
  [...element.childNodes].filter(child => child.nodeType === Node.TEXT_NODE).forEach(child => child.remove());
  element.appendChild(document.createTextNode(` ${value}`));
}
function age(value: string) {
  if (!Number.isFinite(Date.parse(value))) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
function sortItems(items: Item[], config: Behaviour = {}) {
  const seen = new Set<string>();
  const enabled = config.enabledSources?.map(source => source.toLowerCase());
  const priorities = config.sourcePriority?.map(source => source.toLowerCase());
  const result = items.filter(item => {
    const key = (item.link || item.id || item.title).toLowerCase();
    if (!key || seen.has(key) || (enabled?.length && !enabled.includes(item.source.toLowerCase()))) return false;
    seen.add(key); return true;
  });
  const priority = (source: string) => source.toLowerCase() === config.dominantSource?.toLowerCase() ? -1 : priorities?.includes(source.toLowerCase()) ? priorities.indexOf(source.toLowerCase()) : 10_000;
  result.sort((a, b) => priority(a.source) - priority(b.source) || (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  if (config.rotationMode !== 'smart') return result;
  const buckets = new Map<string, Item[]>();
  result.forEach(item => buckets.set(item.source, [...(buckets.get(item.source) || []), item]));
  const interleaved: Item[] = [];
  while (interleaved.length < result.length) for (const bucket of buckets.values()) { const item = bucket.shift(); if (item) interleaved.push(item); }
  return interleaved;
}
function parseFeed(value: unknown): Feed | null {
  const raw = object(value), intelligence = object(raw.intelligence);
  if (!Array.isArray(raw.latest) || !domains.every(domain => Array.isArray(intelligence[domain]))) return null;
  const valid = (value: unknown): value is Item => !!text(object(value).title) && !!text(object(value).source);
  return { state: text(raw.state), latest: raw.latest.filter(valid), intelligence: Object.fromEntries(domains.map(domain => [domain, (intelligence[domain] as unknown[]).filter(valid)])),
    sources: Array.isArray(raw.sources) ? raw.sources.filter(value => !!text(object(value).name)) as { name: string }[] : [], updated_at: text(raw.updated_at) };
}

export function connectSignInWidgets(root: HTMLElement) {
  const cards = Object.fromEntries(['news', 'intelligence', 'spotlight', 'inspiration'].map(key => [key, root.querySelector<HTMLElement>(`[data-widget="${key}"]`)]));
  const rawNews = cards.news?.querySelector<HTMLElement>('.gw-primary-raw');
  if (!rawNews) return () => undefined;
  rawNews.classList.remove('sp-live-news-content');
  rawNews.classList.add('sp-connected-news');
  rawNews.replaceChildren(node('div', 'gw-news-empty', 'Loading Nigeria News…'));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = true, feed: Feed | null = null, newsItems: Item[] = [];
  let newsIndex = 0, intelIndex = 0, nextNews = 0, nextContent = 0, nextSettings = 0;
  let nextStory = Date.now() + 60_000, nextDomain = Date.now() + 30_000;
  let config: Record<string, Behaviour> = { news: {}, intelligence: {}, spotlight: {}, inspiration: {} };
  let contentInterval = 10 * 60_000, contentLoaded = false, feedSaved = false;
  let ticker: HTMLElement | null = null, marquee: HTMLElement | null = null, pause: HTMLButtonElement | null = null;
  let userPaused: boolean | null = null, hoverPaused = false, focusPaused = false;
  let tickerKey = '';
  const pending = new Map<string, AbortController>();
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, event: string, handler: EventListener) => { target.addEventListener(event, handler); cleanups.push(() => target.removeEventListener(event, handler)); };
  const status = (label: string, value: string, good: boolean) => {
    const item = [...root.querySelectorAll('.sp-status-rail > span')].find(item => item.querySelector('b')?.textContent?.trim() === label);
    const dot = item?.querySelector('i'); if (dot) dot.className = good ? 'is-good' : 'is-warn';
    trailing(item || null, value);
  };
  const write = (key: string, selector: string, value: string) => { const target = cards[key]?.querySelector(selector); if (target) target.textContent = value; };
  const badge = (key: string, value: string) => {
    const target = cards[key]?.querySelector('.gw-state-badge');
    trailing(target || null, value);
    const dot = target?.querySelector('span');
    if (dot) { dot.classList.remove('animate-pulse', 'bg-gw-muted'); dot.classList.add('bg-gw-accent'); }
  };
  const fade = (target: HTMLElement | null, behaviour: Behaviour) => {
    if (target && !motion.matches && !document.hidden && (behaviour.transitionStyle || behaviour.transition) !== 'none') {
      target.animate([{ opacity: .55 }, { opacity: 1 }], { duration: Math.max(0, Math.min(1.5, behaviour.transitionDuration ?? .42)) * 1000 });
    }
  };

  function tickerMotion() {
    const selectedPause = userPaused ?? config.news.tickerPaused === true;
    const paused = selectedPause || motion.matches || document.hidden || hoverPaused || focusPaused || config.news.scrollBehavior === 'static' || config.news.autoScroll === false;
    if (marquee) { marquee.style.animationPlayState = paused ? 'paused' : 'running'; marquee.classList.toggle('is-reduced', motion.matches); }
    if (pause) {
      const label = selectedPause ? 'Resume Live Wire ticker' : 'Pause Live Wire ticker';
      pause.setAttribute('aria-label', label); pause.title = label; pause.setAttribute('aria-pressed', String(selectedPause));
      pause.textContent = selectedPause ? '▶' : 'Ⅱ';
    }
  }

  function renderTicker() {
    const nextKey = JSON.stringify([feed?.sources, newsItems, config.news]);
    if (ticker && tickerKey === nextKey) { tickerMotion(); return; }
    tickerKey = nextKey;
    ticker?.remove(); ticker = null; marquee = null; pause = null;
    hoverPaused = false; focusPaused = false;
    cards.news!.style.setProperty('--gw-news-bottom-space', '10px'); cards.news!.dataset.liveTicker = 'false';
    if (!feed || config.news.wireEnabled === false) return;
    const unique = [...new Map(newsItems.slice().reverse().map(item => [item.source, item])).values()];
    const order = feed.sources.map(source => source.name);
    unique.sort((a, b) => (order.includes(a.source) ? order.indexOf(a.source) : 999) - (order.includes(b.source) ? order.indexOf(b.source) : 999));
    if (unique.length < 2) return;
    ticker = node('div', 'gw-visible-wire gw-news-ticker');
    const label = node('span', 'gw-news-ticker-label'); append(label, node('span', 'gw-news-ticker-live-dot'), document.createTextNode('Live Wire'));
    const viewport = node('div', 'gw-news-ticker-viewport');
    viewport.tabIndex = 0; viewport.setAttribute('aria-label', 'Nigeria News scrolling headlines');
    marquee = node('div', 'gw-marquee');
    const speed = config.news.tickerSpeed || config.news.wireSpeed || 'standard';
    marquee.style.animationDuration = `${Math.max(speed === 'slow' ? 280 : speed === 'fast' ? 120 : 190, Math.round(unique.length * (speed === 'slow' ? 18 : speed === 'fast' ? 8 : 12)))}s`;
    marquee.style.animationDirection = config.news.tickerDirection === 'right' ? 'reverse' : 'normal';
    const separator = config.news.tickerSeparator === 'slash' ? '/' : config.news.tickerSeparator === 'diamond' ? '◆' : config.news.tickerSeparator === 'line' ? '|' : '•';
    [...unique, ...unique].forEach((item, index) => {
      const anchor = link('', '', item.link); anchor.title = item.title;
      if (index >= unique.length) { anchor.setAttribute('aria-hidden', 'true'); anchor.tabIndex = -1; }
      if (config.news.tickerShowSource !== false) append(anchor, node('strong', '', item.source), node('span', 'gw-news-ticker-separator', separator));
      append(anchor, node('span', '', item.title));
      if (config.news.tickerShowFreshness !== false && age(item.published)) { const time = node('time', '', age(item.published)); time.setAttribute('datetime', item.published); append(anchor, node('span', 'gw-news-ticker-separator', separator), time); }
      append(marquee!, anchor);
    });
    pause = node('button', 'gw-news-ticker-pause') as HTMLButtonElement; pause.type = 'button';
    pause.onclick = () => { userPaused = !(userPaused ?? config.news.tickerPaused === true); tickerMotion(); };
    ticker.onmouseenter = () => { hoverPaused = config.news.tickerPauseOnHover !== false; tickerMotion(); };
    ticker.onmouseleave = () => { hoverPaused = false; tickerMotion(); };
    ticker.addEventListener('focusin', () => { focusPaused = true; tickerMotion(); });
    ticker.addEventListener('focusout', event => { if (!ticker?.contains(event.relatedTarget as Node | null)) { focusPaused = false; tickerMotion(); } });
    append(viewport, marquee); append(ticker, label, viewport, pause); append(cards.news!, ticker); cards.news!.style.setProperty('--gw-news-bottom-space', '38px'); cards.news!.dataset.liveTicker = 'true'; tickerMotion();
  }

  function renderStory(animate = false) {
    const item = newsItems[newsIndex % newsItems.length];
    if (!item) { rawNews!.replaceChildren(node('div', 'gw-news-empty', 'Nigerian headlines are temporarily unavailable. Updates resume automatically.')); return; }
    const view = node('div', 'gw-news-two-view gw-news-style-cinematic_feature gw-news-story-layout-single');
    view.dataset.storyLayout = 'single'; view.dataset.newsDensity = 'compact';
    const grid = node('div', 'gw-news-story-grid gw-news-story-grid-single');
    const story = node('article', 'gw-news-story is-primary gw-news-story-cinematic_feature'); story.dataset.newsStory = 'true'; story.dataset.hasImage = 'false';
    const copy = node('div', 'gw-news-story-copy');
    const signal = node('div', 'gw-news-story-signal');
    append(signal, node('span', 'gw-news-story-kicker', 'LEAD STORY'), node('span', 'gw-news-story-category', (item.categories || 'Nigeria').split(/[,|]/)[0].slice(0, 34)), node('span', 'gw-news-live-state', feedSaved ? 'Saved feed' : 'Live Feed'));
    const anchor = link('gw-news-story-link', '', item.link); anchor.title = item.title;
    append(anchor, node('span', 'gw-news-feature-title', item.title));
    if (config.news.showSummary !== false && item.summary) append(anchor, node('span', 'gw-news-feature-summary', item.summary.replace(/\s+(?:read more\s*:?\s*)?https?:\/\/\S.*$/i, '').trim()));
    if (config.news.showMeta !== false && config.news.showSourceTime !== false) {
      const parts = [config.news.showSource !== false ? item.source : '', config.news.showFreshness !== false ? age(item.published) : ''].filter(Boolean);
      if (config.news.contentOrder === 'time_source') parts.reverse();
      append(anchor, node('span', 'gw-news-feature-meta', parts.join(' · ')));
    }
    append(copy, signal, anchor); append(story, copy); append(grid, story); append(view, grid); rawNews!.replaceChildren(view);
    if (animate) fade(grid, config.news);
    cards.news!.dataset.feedState = feedSaved ? 'saved' : feed?.state || 'unavailable';
  }

  function renderIntelligence(animate = false) {
    const card = cards.intelligence, focus = card?.querySelector<HTMLElement>('.gw-intel-focus');
    if (!card || !focus) return;
    const domain = domains[intelIndex % domains.length], reports = sortItems(feed?.intelligence[domain] || []);
    const item = reports[Math.floor(intelIndex / domains.length) % reports.length];
    card.querySelectorAll<HTMLElement>('.gw-intel-domain-index > span').forEach((element, index) => {
      const count = feed ? (feed.intelligence[domains[index]] || []).length : null;
      element.dataset.active = String(count !== null && count > 0); element.title = `${domains[index]}: ${count === null ? 'reporting unavailable' : `${count} reports`}`;
      const small = element.querySelector('small'); if (small) small.textContent = count === null ? '—' : String(count);
    });
    const signal = node('div', 'gw-intel-signal-row');
    const kicker = node('span', 'gw-intel-domain-kicker'); append(kicker, node('i', ''), document.createTextNode(`${domain} · Executive Briefing`));
    append(signal, kicker, node('span', 'gw-intel-domain-state', item ? `${reports.length} Signals` : feed ? 'Monitoring' : 'Unavailable'));
    focus.replaceChildren(signal);
    if (item) {
      const anchor = link('gw-intelligence-headline', item.title, item.link); anchor.title = item.title; append(focus, anchor);
      if (config.intelligence.showSummary !== false && item.summary) append(focus, node('p', 'gw-intelligence-summary', item.summary));
    } else append(focus, node('p', 'gw-intelligence-empty', feed ? `No attributed ${domain.toLowerCase()} reports in this update.` : 'Verified intelligence updates are temporarily unavailable.'));
    const reporting = domains.filter(domain => feed?.intelligence[domain]?.length).length;
    const footer = card.querySelector<HTMLElement>('.gw-primary-footer > span');
    if (footer) { footer.textContent = item ? `${item.source} · ${age(item.published)}` : feed ? `${reporting}/6 domains reporting` : 'Coverage unavailable'; footer.title = `${reporting}/6 domains reporting`; }
    badge('intelligence', feedSaved ? 'Saved' : reporting ? `${reporting}/6 domains` : 'Unavailable');
    status('Nigerian Intelligence', reporting ? feedSaved ? 'Saved' : 'Live' : 'Unavailable', reporting > 0 && !feedSaved);
    card.dataset.feedState = feedSaved ? 'saved' : feed?.state || 'unavailable';
    if (animate) fade(focus, config.intelligence);
  }

  async function request(key: string, url: string, apply: (value: unknown) => void, fail: () => void) {
    if (!active || pending.has(key)) return;
    const controller = new AbortController(); pending.set(key, controller);
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('Unavailable');
      const value: unknown = await response.json();
      if (active && !controller.signal.aborted) apply(value);
    } catch { if (active) fail(); }
    finally { window.clearTimeout(timeout); pending.delete(key); }
  }

  const newsFailure = () => {
    feedSaved = !!feed; renderStory(); renderIntelligence();
    status('Nigeria News', feed ? 'Saved' : 'Unavailable', false);
  };
  function refreshNews() {
    nextNews = config.news.liveMode === false ? Infinity : Date.now() + Math.max(10, Math.min(120, config.news.refreshMinutes || 15)) * 60_000;
    void request('news', '/api/context/signin/news', value => {
      const payload = parseFeed(value); if (!payload) { newsFailure(); return; }
      feed = payload; feedSaved = false; newsItems = sortItems(feed.latest, config.news);
      renderStory(); renderTicker(); renderIntelligence();
      status('Nigeria News', newsItems.length ? feed.state === 'partial' ? 'Partial' : 'Live' : 'Unavailable', newsItems.length > 0);
    }, newsFailure);
  }
  function refreshContent() {
    nextContent = Date.now() + contentInterval;
    const failure = () => {
      if (contentLoaded) { badge('spotlight', 'Saved'); badge('inspiration', 'Saved'); return; }
      write('spotlight', '.gw-spotlight-kicker', 'Daily Spotlight'); write('spotlight', '.gw-spotlight-title', 'Spotlight temporarily unavailable'); write('spotlight', '.gw-spotlight-body', 'Updates resume automatically.');
      write('inspiration', '.gw-inspiration-quote', 'Inspiration temporarily unavailable. Updates resume automatically.'); write('inspiration', '.gw-inspiration-attribution', '');
      badge('spotlight', 'Unavailable'); badge('inspiration', 'Unavailable');
    };
    void request('content', '/api/staff-content', value => {
      const raw = object(value), spotlight = object(raw.spotlight), inspiration = object(raw.inspiration);
      if (!text(spotlight.title) || !text(spotlight.body) || !text(inspiration.message)) { failure(); return; }
      contentLoaded = true;
      write('spotlight', '.gw-spotlight-kicker', text(spotlight.category)); write('spotlight', '.gw-spotlight-title', text(spotlight.title)); write('spotlight', '.gw-spotlight-body', text(spotlight.body));
      write('inspiration', '.gw-inspiration-theme', text(inspiration.category)); write('inspiration', '.gw-inspiration-quote', text(inspiration.message)); write('inspiration', '.gw-inspiration-attribution', text(inspiration.attribution) ? `— ${text(inspiration.attribution)}` : '');
      for (const key of ['spotlight', 'inspiration']) {
        const item = key === 'spotlight' ? spotlight : inspiration;
        write(key, '.gw-primary-footer > span', text(item.category));
        const connectedCurated = raw.contentMode === 'scheduled_curated';
        badge(key, raw.providerConnected === true ? 'Updated' : connectedCurated ? 'Connected' : 'Curated');
        if (cards[key]) {
          cards[key]!.dataset.contentId = text(item.id);
          cards[key]!.dataset.contentProvider = text(raw.provider);
          cards[key]!.dataset.contentExpires = text(raw.expiresAt);
          cards[key]!.dataset.contentMode = connectedCurated ? 'scheduled_curated' : 'owner_curated';
          cards[key]!.dataset.contentConnection = 'online';
          // The content service is connected; external AI is deliberately NOT
          // claimed when the approved Owner Studio provider is curated.
          cards[key]!.title = connectedCurated
            ? `Connected to the DAENEM editorial schedule · Curated, next change ${text(raw.expiresAt)}`
            : `Connected to the approved content service · ${text(raw.provider)}`;
        }
      }
      const expiry = Date.parse(text(raw.expiresAt));
      if (Number.isFinite(expiry)) nextContent = Math.min(nextContent, Date.now() + Math.max(60_000, expiry - Date.now() + 1000));
    }, failure);
  }
  function refreshSettings() {
    nextSettings = Date.now() + 10 * 60_000;
    void request('settings', '/api/context/signin/widget-settings', value => {
      const raw = object(value), widgets = object(raw.widgets);
      const previousPaused = config.news.tickerPaused;
      config = Object.fromEntries(['news', 'intelligence', 'spotlight', 'inspiration'].map(key => [key, object(widgets[key]) as Behaviour]));
      if (previousPaused !== config.news.tickerPaused) userPaused = null;
      nextNews = config.news.liveMode === false ? Infinity : Math.min(nextNews, Date.now() + Math.max(10, Math.min(120, config.news.refreshMinutes || 15)) * 60_000);
      contentInterval = minutes(Number(object(raw.contentAutomation).intervalMinutes), 10);
      nextStory = Date.now() + Math.max(30, config.news.rotationSeconds || config.news.autoCycleIntervalSeconds || config.news.cycleSeconds || 60) * 1000;
      nextDomain = Date.now() + Math.max(5, Math.min(300, config.intelligence.rotationSeconds || config.intelligence.cycleSeconds || 30)) * 1000;
      if (feed) { newsItems = sortItems(feed.latest, config.news); renderStory(); renderTicker(); renderIntelligence(); }
    }, () => { /* Retain the last approved behaviour if configuration refresh fails. */ });
  }
  function tick() {
    if (!active || document.hidden) return;
    const now = Date.now();
    if (now >= nextSettings) refreshSettings();
    if (now >= nextNews) refreshNews();
    if (now >= nextContent) refreshContent();
    if (now >= nextStory) {
      nextStory = now + Math.max(30, config.news.rotationSeconds || config.news.autoCycleIntervalSeconds || config.news.cycleSeconds || 60) * 1000;
      if (!motion.matches && config.news.rotationPaused !== true && config.news.autoScroll !== false && config.news.scrollBehavior !== 'static' && newsItems.length > 1 && !cards.news?.matches(':hover, :focus-within')) { newsIndex++; renderStory(true); }
    }
    if (now >= nextDomain) {
      nextDomain = now + Math.max(5, Math.min(300, config.intelligence.rotationSeconds || config.intelligence.cycleSeconds || 30)) * 1000;
      if (feed && !motion.matches && config.intelligence.scrollBehavior !== 'static' && config.intelligence.rotationPaused !== true && !cards.intelligence?.matches(':hover, :focus-within')) { intelIndex++; renderIntelligence(true); }
    }
  }
  listen(motion, 'change', tickerMotion);
  listen(document, 'visibilitychange', () => { tickerMotion(); tick(); });
  listen(window, 'online', tick);
  tick(); const timer = window.setInterval(tick, 1000);
  return () => { active = false; window.clearInterval(timer); pending.forEach(controller => controller.abort()); cleanups.forEach(cleanup => cleanup()); ticker?.remove(); };
}
