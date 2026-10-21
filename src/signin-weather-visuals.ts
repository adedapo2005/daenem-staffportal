// The approved V180 vector artwork and existing CSS animation classes.
// Values select artwork; provider text is never inserted as SVG markup.
type Condition = 'clear' | 'mostly_clear' | 'partly' | 'mostly_cloudy' | 'cloudy' | 'overcast' | 'light_rain' | 'rain' | 'heavy_rain' | 'showers' | 'storm' | 'snow' | 'sleet' | 'fog' | 'mist' | 'haze' | 'wind' | 'unknown';
function conditionFrom(description: string): Condition {
  const value = description.toLowerCase().replace(/[._-]/g, ' ');
  if (!value.trim() || /^(unknown|unavailable|unclear|current conditions|weather unavailable|not available)$/.test(value.trim())) return 'unknown';
  if (/thunder|storm|lightning/.test(value)) return 'storm';
  if (/sleet|ice pellet/.test(value) || (/rain/.test(value) && /snow/.test(value))) return 'sleet';
  if (/snow|flurr/.test(value)) return 'snow';
  if (/heavy rain|heavy shower|torrential rain/.test(value)) return 'heavy_rain';
  if (/drizzle|light rain|light shower/.test(value)) return 'light_rain';
  if (/shower/.test(value)) return 'showers';
  if (/rain/.test(value)) return 'rain';
  if (/fog/.test(value)) return 'fog';
  if (/mist/.test(value)) return 'mist';
  if (/haze|dust|smoke/.test(value)) return 'haze';
  if (/wind/.test(value)) return 'wind';
  if (/partly cloud|partly sunny|scattered cloud|few cloud/.test(value)) return 'partly';
  if (/mostly cloud/.test(value)) return 'mostly_cloudy';
  if (/overcast/.test(value)) return 'overcast';
  if (/cloud/.test(value)) return 'cloudy';
  if (/mostly clear|mostly sunny/.test(value)) return 'mostly_clear';
  if (/clear|sunny/.test(value)) return 'clear';
  return 'unknown';
}

function artwork(code: Condition, day: boolean, id: string) {
  const fill = (name: string) => `url(#${id}-${name})`;
  const defs = `<defs>
    <radialGradient id="${id}-sun" cx="36%" cy="30%" r="70%"><stop stop-color="#FFF6B9"/><stop offset="46%" stop-color="#FFD65A"/><stop offset="100%" stop-color="#F6A51A"/></radialGradient>
    <linearGradient id="${id}-sunEdge" x2="1" y2="1"><stop stop-color="#FFE78A"/><stop offset="1" stop-color="#F4A413"/></linearGradient>
    <linearGradient id="${id}-cloud" x1=".18" y1=".12" x2=".8" y2=".95"><stop stop-color="${day ? '#FFFFFF' : '#E8F0F7'}"/><stop offset=".48" stop-color="${day ? '#E9F3FA' : '#BFCFDC'}"/><stop offset="1" stop-color="${day ? '#B7CEE0' : '#7D8EA0'}"/></linearGradient>
    <linearGradient id="${id}-cloudBack" x2="1" y2="1"><stop stop-color="${day ? '#D9E9F5' : '#9AAAB9'}"/><stop offset="1" stop-color="${day ? '#95AFC4' : '#536272'}"/></linearGradient>
    <linearGradient id="${id}-rain" x2="0" y2="1"><stop stop-color="#7ED6FF"/><stop offset="1" stop-color="#2C8EE6"/></linearGradient>
    <linearGradient id="${id}-moon" x2="1" y2="1"><stop stop-color="#FFF7D9"/><stop offset=".52" stop-color="#F1E6B6"/><stop offset="1" stop-color="#C8D3E3"/></linearGradient>
    <linearGradient id="${id}-fog" x2="1" y2="0"><stop stop-color="#EBF5FA" stop-opacity="0"/><stop offset=".2" stop-color="#EBF5FA" stop-opacity=".72"/><stop offset=".8" stop-color="#EBF5FA" stop-opacity=".72"/><stop offset="1" stop-color="#EBF5FA" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-snow" x2="1" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#BFE8FF"/></linearGradient>
  </defs>`;
  const sun = (x = 24, y = 23, r = 11) => `<g class="gw-wxi-sun"><circle cx="${x}" cy="${y}" r="${r + 4.5}" fill="rgba(255,202,61,.12)" class="gw-wxi-glow"/>${Array.from({ length: 8 }, (_, index) => `<line x1="${x}" y1="${y - r - 5}" x2="${x}" y2="${y - r - 9}" stroke="${fill('sunEdge')}" stroke-width="3" stroke-linecap="round" transform="rotate(${index * 45} ${x} ${y})"/>`).join('')}<circle cx="${x}" cy="${y}" r="${r}" fill="${fill('sun')}"/><ellipse cx="${x - 3.5}" cy="${y - 4.2}" rx="${r * .38}" ry="${r * .25}" fill="rgba(255,255,255,.38)"/></g>`;
  const moon = (x = 25, y = 24, r = 12) => `<g class="gw-wxi-moon"><circle cx="${x}" cy="${y}" r="${r + 5}" fill="rgba(220,231,255,.1)" class="gw-wxi-glow"/><path d="M${x + 7} ${y - 10}A${r} ${r} 0 1 0 ${x + 8} ${y + 10}A${r - 3} ${r - 3} 0 0 1 ${x + 7} ${y - 10}Z" fill="${fill('moon')}"/><circle cx="${x - 3}" cy="${y - 4}" r="1.7" fill="rgba(126,141,162,.16)"/></g>`;
  const stars = '<g fill="#FFF3B3"><circle class="gw-wxi-star" cx="47" cy="13" r="1.7"/><circle class="gw-wxi-star" style="animation-delay:-1.1s" cx="58" cy="23" r="1.2"/><path class="gw-wxi-star" style="animation-delay:-.55s" d="M49 33l1.2 2.5 2.6 1.1-2.6 1.1-1.2 2.5-1.1-2.5-2.6-1.1 2.6-1.1z"/></g>';
  const cloud = (x = 4, y = 7, scale = .96, back = false, slow = true) => `<g transform="translate(${x} ${y}) scale(${scale})"><g class="${slow ? 'gw-wxi-cloud-float-slow' : 'gw-wxi-cloud-float'}"><path d="M16 49.5c-5.1 0-9.2-4-9.2-9s4-9 9-9h.7c1.6-8.3 8.9-14.2 17.7-14.2 9.7 0 17.6 7.2 18.3 16.6h.8c6.5 0 11.8 4.7 11.8 10.7 0 5.4-4.7 9.8-10.5 9.8H16z" fill="${fill(back ? 'cloudBack' : 'cloud')}" stroke="rgba(255,255,255,.48)" stroke-width=".9"/>${back ? '' : '<ellipse cx="30" cy="27" rx="10" ry="6.2" fill="rgba(255,255,255,.28)"/><path d="M15 47.5h41" stroke="rgba(78,101,119,.12)" stroke-width="2.5" stroke-linecap="round"/>'}</g></g>`;
  const rain = (heavy = false) => (heavy ? [15, 24, 33, 42, 51, 59] : [20, 31, 42, 53]).map((x, index) => `<path d="M${x} 52.5l-3.2 7.2" stroke="${fill('rain')}" stroke-width="${heavy ? 3.1 : 2.7}" stroke-linecap="round" class="gw-wxi-rain" style="animation-delay:${-index * .15}s"/>`).join('');
  const snow = [[18, 56, 2.1], [29, 60, 1.7], [41, 55, 2], [53, 60, 1.6]].map(([x, y, r], index) => `<g class="gw-wxi-snow" style="animation-delay:${-index * .45}s"><circle cx="${x}" cy="${y}" r="${r}" fill="${fill('snow')}"/><path d="M${x - r - 1} ${y}h${(r + 1) * 2}M${x} ${y - r - 1}v${(r + 1) * 2}" stroke="#EAF8FF" stroke-width=".9" stroke-linecap="round"/></g>`).join('');
  const fog = `<g class="gw-wxi-fog">${[38, 46, 54, 62].map((y, index) => `<rect x="${10 + index % 2 * 5}" y="${y}" width="${52 - index % 2 * 9}" height="3.2" rx="1.6" fill="${fill('fog')}"/>`).join('')}</g>`;
  const orb = day ? sun(23, 22, 10) : moon(23, 23, 11) + stars;
  let art = '';
  switch (code) {
    case 'clear': art = day ? sun(36, 34, 13) : moon(32, 35, 15) + stars; break;
    case 'mostly_clear': art = orb + cloud(13, 16, .72, false, false); break;
    case 'partly': art = orb + cloud(10, 14, .8, false, false); break;
    case 'mostly_cloudy': art = (day ? sun(49, 20, 7.5) : moon(50, 21, 8.5)) + cloud(5, 7, .93); break;
    case 'cloudy': art = cloud(); break;
    case 'overcast': art = cloud(17, 5, .66, true) + cloud(4, 10, .92, false, false); break;
    case 'light_rain': case 'rain': art = cloud(4, 4, .95) + rain(); break;
    case 'heavy_rain': art = cloud(16, 2, .68, true) + cloud(4, 5, .95) + rain(true); break;
    case 'showers': art = (day ? sun(49, 18, 7) : moon(49, 19, 8)) + cloud(4, 6, .94) + rain(); break;
    case 'storm': art = cloud(16, 1, .68, true) + cloud(4, 5, .95) + '<path class="gw-wxi-bolt" d="M36 43h8l-6 9h5l-11 14 3-11h-6z" fill="#FFD34E" stroke="#FFF0A5" stroke-width="1" stroke-linejoin="round"/>' + rain(); break;
    case 'snow': art = cloud(4, 4, .95) + snow; break;
    case 'sleet': art = cloud(4, 4, .95) + rain() + snow; break;
    case 'fog': case 'mist': art = cloud(12, 0, .7) + fog; break;
    case 'haze': art = (day ? sun(36, 24, 10) : moon(35, 24, 11)) + fog; break;
    case 'wind': art = '<g class="gw-wxi-wind" fill="none" stroke-linecap="round"><path d="M10 27h31c7 0 7-10 1-10-3.7 0-5.2 2.1-5.8 4" stroke="#D9F7F0" stroke-width="3.5"/><path d="M8 38h42c7 0 7 10 1 10-3.7 0-5.2-2.1-5.8-4" stroke="#7DD5C9" stroke-width="3.5"/><path d="M13 50h20" stroke="#BDECE6" stroke-width="3"/></g>'; break;
    default: art = '<g opacity=".66"><circle cx="36" cy="36" r="16" fill="none" stroke="white" stroke-width="2"/><path d="M36 27v11M36 44v.2" stroke="white" stroke-width="3" stroke-linecap="round"/></g>';
  }
  return defs + art;
}

export function hydrateSignInWeatherVisual(card: HTMLElement) {
  const summary = card.querySelector<HTMLElement>('[data-signin-weather-summary]');
  if (!summary) return;
  const description = card.dataset.weatherCondition || '';
  const available = card.dataset.weather === 'available' || card.dataset.weather === 'cached';
  const condition = available ? conditionFrom(description) : 'unknown';
  const phase = card.dataset.phase || 'day';
  const day = card.dataset.weatherDaylight === 'true' || (card.dataset.weatherDaylight !== 'false' && phase !== 'night' && phase !== 'dusk');
  const resolved = condition === 'unknown' || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'subtle';
  card.dataset.weatherCode = condition;
  card.dataset.motionResolved = resolved;
  const atmosphere = card.querySelector<HTMLElement>('.gw-city-atmosphere');
  const classes = `pointer-events-none absolute inset-0 gw-city-atmosphere gw-city-atmosphere-${condition} gw-city-atmosphere-${resolved} gw-city-atmosphere-phase-${phase}`;
  if (atmosphere && atmosphere.className !== classes) atmosphere.className = classes;
  const local = card.closest<HTMLElement>('.sp-weather-card');
  if (local) {
    local.className = local.className.replace(/sp-weather-condition-[\w-]+/g, `sp-weather-condition-${condition}`);
    local.dataset.weatherCondition = condition;
    local.dataset.weatherEffects = resolved;
  }
  let visual = summary.querySelector<HTMLElement>('.sp-live-weather-visual');
  if (!available) { visual?.remove(); return; }
  if (!visual) {
    visual = document.createElement('span'); visual.className = 'gw-global-weather-visual sp-live-weather-visual';
    visual.setAttribute('aria-hidden', 'true'); summary.insertBefore(visual, summary.firstChild);
  }
  visual.dataset.condition = condition; visual.dataset.phase = phase; visual.dataset.daylight = day ? 'day' : 'night';
  const key = `${condition}:${day}:${resolved}`;
  if (visual.dataset.visualKey === key) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 72 72'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', `gw-global-weather-icon gw-global-weather-icon-motion-${resolved}`);
  svg.setAttribute('data-motion-resolved', resolved);
  // IDs are from the fixed, repository-owned city allowlist.
  const id = `sp-wx-${(card.dataset.cityId || 'local').replace(/[^a-z]/g, '')}`;
  svg.innerHTML = artwork(condition, day, id);
  visual.replaceChildren(svg); visual.dataset.visualKey = key;
}

export function connectSignInWeatherMotion(root: HTMLElement) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const update = () => root.querySelectorAll<HTMLElement>('article[data-city-id]').forEach(hydrateSignInWeatherVisual);
  motion.addEventListener('change', update); document.addEventListener('visibilitychange', update);
  update();
  return () => { motion.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
}
