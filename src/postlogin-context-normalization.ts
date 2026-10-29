/** Strict, privacy-minimizing boundary for untrusted post-login feed responses.
 * A HTTP 200 is not evidence that a JSON body matches the service contract.
 * Return null rather than printing "undefined" or rendering untrusted links.
 */
export type Headline = {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string | null;
};

export type PostLoginContext = {
  generatedAt: string;
  status: 'live' | 'partial' | 'unavailable';
  activeSourceCount: number;
  configuredSourceCount: number;
  successfulFeedCount: number;
  news: Headline[];
  intelligence: Headline[];
  inspiration: { title: string; message: string; action: string };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000;

const safeString = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

function headline(value: unknown): Headline | null {
  if (!isRecord(value) || !safeString(value.id, 500) || !safeString(value.title, 450)
    || !safeString(value.source, 120) || !safeString(value.category, 120)
    || !safeString(value.url, 2048)) return null;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return {
      id: value.id,
      title: value.title,
      url: url.toString(),
      source: value.source,
      category: value.category,
      publishedAt: typeof value.publishedAt === 'string' && Number.isFinite(Date.parse(value.publishedAt))
        ? value.publishedAt : null,
    };
  } catch {
    return null;
  }
}

/** Each list uses headline.id as a React key. Treat a duplicate upstream ID as
 * untrusted input, keeping the first valid item in feed order rather than
 * rendering two records with the same DOM identity.
 */
function uniqueHeadlines(values: unknown[]): Headline[] {
  const seen = new Set<string>();
  const result: Headline[] = [];
  for (const value of values) {
    const entry = headline(value);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

/** All required feed metadata must be present. Bad headline URLs are dropped,
 * not allowed to turn the entire authenticated workspace into an error.
 */
export function normalizePostLoginContext(value: unknown): PostLoginContext | null {
  if (!isRecord(value) || !safeString(value.generatedAt, 64)
    || !Number.isFinite(Date.parse(value.generatedAt))
    || !['live', 'partial', 'unavailable'].includes(String(value.status))
    || !isCount(value.activeSourceCount)
    || !isCount(value.configuredSourceCount)
    || !isCount(value.successfulFeedCount)
    || !Array.isArray(value.news) || !Array.isArray(value.intelligence)
    || value.news.length > 100 || value.intelligence.length > 100) return null;

  const focus = isRecord(value.inspiration) ? value.inspiration : {};
  return {
    generatedAt: value.generatedAt,
    status: value.status as PostLoginContext['status'],
    activeSourceCount: value.activeSourceCount,
    configuredSourceCount: value.configuredSourceCount,
    successfulFeedCount: value.successfulFeedCount,
    news: uniqueHeadlines(value.news),
    intelligence: uniqueHeadlines(value.intelligence),
    inspiration: {
      title: safeString(focus.title, 180) ? focus.title : 'A clear start',
      message: safeString(focus.message, 800) ? focus.message : 'Start with the work that removes the biggest obstacle for the team.',
      action: safeString(focus.action, 400) ? focus.action : 'Choose one measurable outcome for today.',
    },
  };
}
