interface PostLoginContextEnv {
  SOCIAL_CACHE?: KVNamespace;
}

type FeedLane = 'news' | 'intelligence';
type FeedDefinition = { id: string; name: string; url: string; category: string; lane: FeedLane };
type Headline = { id: string; title: string; url: string; source: string; category: string; publishedAt: string | null };

const CACHE_KEY = 'staffportal:postlogin-context:v116';
const CACHE_TTL_SECONDS = 600;
const FEED_TIMEOUT_MS = 5_500;

const FEEDS: FeedDefinition[] = [
  { id: 'punch', name: 'Punch', url: 'https://punchng.com/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'guardian-ng', name: 'The Guardian Nigeria', url: 'https://guardian.ng/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'premium-times', name: 'Premium Times', url: 'https://www.premiumtimesng.com/feed', category: 'Nigeria', lane: 'news' },
  { id: 'channels', name: 'Channels Television', url: 'https://www.channelstv.com/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'vanguard', name: 'Vanguard', url: 'https://www.vanguardngr.com/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'businessday', name: 'BusinessDay', url: 'https://businessday.ng/feed/', category: 'Business', lane: 'news' },
  { id: 'techcabal', name: 'TechCabal', url: 'https://techcabal.com/feed/', category: 'Technology', lane: 'news' },
  { id: 'nairametrics', name: 'Nairametrics', url: 'https://nairametrics.com/feed/', category: 'Finance', lane: 'news' },
  { id: 'thecable', name: 'TheCable', url: 'https://www.thecable.ng/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'daily-trust', name: 'Daily Trust', url: 'https://dailytrust.com/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'leadership', name: 'Leadership', url: 'https://leadership.ng/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'tribune', name: 'Nigerian Tribune', url: 'https://tribuneonlineng.com/feed/', category: 'Nigeria', lane: 'news' },
  { id: 'bbc-world', name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'World', lane: 'intelligence' },
  { id: 'bbc-africa', name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', category: 'Africa', lane: 'intelligence' },
  { id: 'aljazeera', name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'World', lane: 'intelligence' },
  { id: 'un-news', name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', category: 'Global policy', lane: 'intelligence' },
  { id: 'google-infrastructure', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+infrastructure&hl=en-NG&gl=NG&ceid=NG:en', category: 'Infrastructure', lane: 'intelligence' },
  { id: 'google-construction', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+construction+industry&hl=en-NG&gl=NG&ceid=NG:en', category: 'Construction', lane: 'intelligence' },
  { id: 'google-logistics', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+logistics+supply+chain&hl=en-NG&gl=NG&ceid=NG:en', category: 'Logistics', lane: 'intelligence' },
  { id: 'google-automotive', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+automotive+market&hl=en-NG&gl=NG&ceid=NG:en', category: 'Automotive', lane: 'intelligence' },
  { id: 'google-food', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+food+bakery+market&hl=en-NG&gl=NG&ceid=NG:en', category: 'Food and bakery', lane: 'intelligence' },
  { id: 'google-property', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+property+housing&hl=en-NG&gl=NG&ceid=NG:en', category: 'Property', lane: 'intelligence' },
  { id: 'google-energy', name: 'Google News', url: 'https://news.google.com/rss/search?q=Nigeria+energy+business&hl=en-NG&gl=NG&ceid=NG:en', category: 'Energy', lane: 'intelligence' },
  { id: 'google-technology', name: 'Google News', url: 'https://news.google.com/rss/search?q=Africa+technology+business&hl=en-NG&gl=NG&ceid=NG:en', category: 'Technology', lane: 'intelligence' },
];

const FOCUS = [
  { title: 'Make progress visible', message: 'Clarity builds trust. Keep the next decision, owner and expected outcome visible to the people doing the work.', action: 'Close one information gap before midday.' },
  { title: 'Protect the standard', message: 'Excellent work is repeatable work: clear inputs, careful execution and evidence that the result is complete.', action: 'Finish one task to release quality before starting another.' },
  { title: 'Move as one team', message: 'A timely handoff is an act of respect. Give the next person the context they need to continue without delay.', action: 'Improve one handoff with a concise note or attachment.' },
  { title: 'Solve the real constraint', message: 'Busy work can hide the bottleneck. Find the obstacle that is slowing the outcome and remove it first.', action: 'Name today’s main constraint and take one direct action.' },
  { title: 'Use evidence, not assumption', message: 'Strong decisions begin with reliable records. Check the source, confirm the scope and leave an audit trail.', action: 'Verify one important figure before it moves forward.' },
  { title: 'Keep the customer in view', message: 'Every internal step should make the final experience more dependable, useful or memorable.', action: 'Connect one task to the customer outcome it supports.' },
  { title: 'Improve the system', message: 'When a problem repeats, the process needs attention. Fix the pattern as well as the immediate issue.', action: 'Record one reusable improvement from today’s work.' },
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=120', 'x-content-type-options': 'nosniff' } });
}

function decode(value: string) {
  return value.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decode(match[1]) : '';
}

function link(block: string) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
  return decode(atom || tag(block, 'link'));
}

function source(block: string, fallback: string) {
  return tag(block, 'source') || tag(block, 'dc:creator') || fallback;
}

function headlineId(feed: FeedDefinition, title: string) {
  let hash = 2166136261;
  for (const character of `${feed.id}:${title}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `${feed.id}-${(hash >>> 0).toString(36)}`;
}

function parseFeed(xml: string, feed: FeedDefinition): Headline[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, 4).flatMap((block) => {
    const title = tag(block, 'title');
    const url = link(block);
    if (!title || !/^https?:\/\//i.test(url)) return [];
    const rawDate = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
    const parsedDate = rawDate ? new Date(rawDate) : null;
    return [{
      id: headlineId(feed, title), title, url,
      source: source(block, feed.name), category: feed.category,
      publishedAt: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    }];
  });
}

async function fetchFeed(feed: FeedDefinition) {
  try {
    const response = await fetch(feed.url, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'user-agent': 'DAENEM-StaffPortal/1.0' }, signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
    if (!response.ok) return { feed, items: [] as Headline[] };
    const xml = await response.text();
    if (xml.length > 1_500_000) return { feed, items: [] as Headline[] };
    return { feed, items: parseFeed(xml, feed) };
  } catch { return { feed, items: [] as Headline[] }; }
}

function uniqueRecent(items: Headline[], limit: number) {
  const seen = new Set<string>();
  return items
    .sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function validCached(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const generatedAt = (value as Record<string, unknown>).generatedAt;
  return typeof generatedAt === 'string' && Number.isFinite(Date.parse(generatedAt));
}

export async function postLoginContext(env: PostLoginContextEnv) {
  if (env.SOCIAL_CACHE) {
    try {
      const cached = await env.SOCIAL_CACHE.get(CACHE_KEY);
      if (cached) {
        const value: unknown = JSON.parse(cached);
        if (validCached(value) && Date.now() - Date.parse(String(value.generatedAt)) < CACHE_TTL_SECONDS * 1000) return json(value);
      }
    } catch { /* A feed refresh remains available when cache is unavailable. */ }
  }

  const results = await Promise.all(FEEDS.map(fetchFeed));
  const successful = results.filter((result) => result.items.length > 0);
  const news = uniqueRecent(results.filter((result) => result.feed.lane === 'news').flatMap((result) => result.items), 18);
  const intelligence = uniqueRecent(results.filter((result) => result.feed.lane === 'intelligence').flatMap((result) => result.items), 18);
  const sources = new Set([...news, ...intelligence].map((item) => item.source));
  const dayIndex = Math.floor(Date.now() / 86_400_000) % FOCUS.length;
  const body = {
    generatedAt: new Date().toISOString(),
    status: news.length && intelligence.length ? 'live' : news.length || intelligence.length ? 'partial' : 'unavailable',
    activeSourceCount: sources.size,
    configuredSourceCount: FEEDS.length,
    successfulFeedCount: successful.length,
    news,
    intelligence,
    inspiration: FOCUS[dayIndex],
  };
  if (env.SOCIAL_CACHE && (news.length || intelligence.length)) {
    try { await env.SOCIAL_CACHE.put(CACHE_KEY, JSON.stringify(body), { expirationTtl: CACHE_TTL_SECONDS }); }
    catch { /* The live response remains usable without cache persistence. */ }
  }
  return json(body);
}
