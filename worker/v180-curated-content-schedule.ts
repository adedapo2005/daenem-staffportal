// Public Sign-In editorial rotation for the *default* approved curated copy.
// Never override customized Owner Studio items or claim a generative AI provider.
// All content here is general operational guidance: no invented news, data or quotations.
type Spotlight = { id: string; title: string; body: string; category: string };
type Inspiration = { id: string; message: string; attribution: string; category: string };
type PublicEditorial = { spotlight: Spotlight; inspiration: Inspiration; provider: string; providerConnected: boolean };

const spotlights = [
  ['Clear Information Keeps Every Operation Moving', 'Keep the signal clean, make decisions early, and leave the next team a better view than the one you inherited.'],
  ['Make Every Handover Clear', 'Record what changed, what is pending, and who owns the next action. A clear handover keeps every shift moving.'],
  ['Give Decisions Their Context', 'Link each request to its source, owner and next step. Clear records help the team act with confidence.'],
  ['Enter Once, Use Everywhere', 'Capture work in its approved record so teams can review, fulfil and report without typing the same details again.'],
  ['Protect the Next Shift', 'Raise safety, equipment or location concerns early. Leave enough detail for the next person to act without guessing.'],
  ['Keep Every Promise Visible', 'Confirm the next action, the responsible person and the agreed time. Follow-through should never depend on memory alone.'],
  ['Check Before You Close', 'Verify dates, figures and ownership before marking work complete. A clear final check prevents avoidable rework.'],
] as const;

const inspirations = [
  'Progress becomes visible when learning is turned into a better way of working.',
  'Consistency gives good ideas the chance to become dependable results.',
  'A thoughtful handover is a quiet act of teamwork.',
  'The best improvement is one the next person can use confidently.',
  'Great work is careful, clear and useful to the people who depend on it.',
  'Small improvements matter when every shift can build on them.',
  'A reliable team makes room for questions, learning and better decisions.',
  'Keep the standard high, and make the next step easier for someone else.',
] as const;

export function rotateDefaultCuratedContent(payload: PublicEditorial, now = Date.now()) {
  if (payload.provider !== 'curated' || payload.providerConnected ||
      payload.spotlight.id !== 'staff-portal-welcome-spotlight' ||
      payload.inspiration.id !== 'inspiration-growth' || !Number.isFinite(now)) return null;

  // Ibadan uses Africa/Lagos (UTC+1, no daylight-saving adjustment).
  const lagosNow = now + 60 * 60_000;
  const day = Math.floor(lagosNow / 86_400_000);
  const block = Math.floor(lagosNow / (6 * 60 * 60_000));
  const [title, body] = spotlights[((day % spotlights.length) + spotlights.length) % spotlights.length];
  const message = inspirations[((block % inspirations.length) + inspirations.length) % inspirations.length];
  const start = Math.floor(lagosNow / (6 * 60 * 60_000)) * (6 * 60 * 60_000) - 60 * 60_000;
  const end = start + 6 * 60 * 60_000;
  return {
    spotlight: { ...payload.spotlight, id: `daenem-editorial-day-${day}`, title, body, category: 'Daily Practice' },
    inspiration: { ...payload.inspiration, id: `daenem-editorial-block-${block}`, message,
      attribution: 'DAENEM StaffPortal', category: 'Employee Inspiration' },
    intervalStartedAt: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
    contentMode: 'scheduled_curated' as const,
  };
}
