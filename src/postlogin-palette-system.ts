export type PostLoginPaletteId =
  | 'ocean-azure-prestige'
  | 'teal-pearl'
  | 'emerald-luxe'
  | 'emerald-gold'
  | 'royal-orchid'
  | 'royal-violet'
  | 'midnight-jade'
  | 'atlantic-copper'
  | 'peacock-coral'
  | 'aubergine-chartreuse'
  | 'petrol-apricot'
  | 'oxblood-opal'
  | 'espresso-iris'
  | 'olive-porcelain'
  | 'ink-saffron'
  | 'cobalt-persimmon'
  | 'mineral-rose'
  | 'plum-glacier'
  | 'graphite-citron';

export type PostLoginPaletteGroup =
  | 'Approved default'
  | 'Earlier approved options'
  | 'Architectural contrasts'
  | 'Warm editorial'
  | 'Contemporary signatures';

export interface PostLoginPalette {
  id: PostLoginPaletteId;
  name: string;
  group: PostLoginPaletteGroup;
  note: string;
  anchor: string;
  primary: string;
  accent: string;
  highlight: string;
  tint: string;
  canvas: string;
  surface: string;
  ink: string;
  onPrimary: string;
  onAnchor: string;
  extra?: string;
}

export const POSTLOGIN_DEFAULT_PALETTE: PostLoginPaletteId = 'ocean-azure-prestige';

export const postLoginPalettes: readonly PostLoginPalette[] = [
  {
    id: 'ocean-azure-prestige',
    name: 'Ocean Sapphire - Azure Prestige',
    group: 'Approved default',
    note: 'The approved Option 2 + Option B direction: crisp, confident and executive without becoming cold.',
    anchor: '#173A63', primary: '#2563EB', accent: '#06B6D4', highlight: '#F59E0B',
    tint: '#EAF3FF', canvas: '#F1F5F9', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF', extra: '#7C3AED',
  },
  {
    id: 'teal-pearl', name: 'Teal & Pearl', group: 'Earlier approved options',
    note: 'Fresh teal with pearl surfaces and restrained citrus support.',
    anchor: '#0F2A44', primary: '#0F766E', accent: '#14B8A6', highlight: '#F59E0B',
    tint: '#E6F7F4', canvas: '#F8FAFC', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'emerald-luxe', name: 'Emerald Luxe', group: 'Earlier approved options',
    note: 'Deep marine, emerald and champagne for a warm executive presentation.',
    anchor: '#123B48', primary: '#0F766E', accent: '#43B8A9', highlight: '#D6B25E',
    tint: '#DDF5F1', canvas: '#F8FBFA', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'emerald-gold', name: 'Emerald & Gold', group: 'Earlier approved options',
    note: 'Emerald authority with carefully concentrated gold accents.',
    anchor: '#065F46', primary: '#059669', accent: '#14B8A6', highlight: '#FBBF24',
    tint: '#D1FAE5', canvas: '#FFFBEB', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#000000', onAnchor: '#FFFFFF',
  },
  {
    id: 'royal-orchid', name: 'Royal Orchid', group: 'Earlier approved options',
    note: 'Aubergine, imperial violet and rose gold with a distinctive editorial personality.',
    anchor: '#2E2145', primary: '#6F4BF2', accent: '#A181F7', highlight: '#DDAA92',
    tint: '#EFE9FF', canvas: '#FCFAFF', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'royal-violet', name: 'Royal Violet', group: 'Earlier approved options',
    note: 'Modern violet with cyan and magenta accents for a higher-energy workspace.',
    anchor: '#4F46E5', primary: '#6366F1', accent: '#06B6D4', highlight: '#EC4899',
    tint: '#EDE9FE', canvas: '#F8FAFC', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#000000', onAnchor: '#FFFFFF',
  },
  {
    id: 'midnight-jade', name: 'Midnight Jade', group: 'Earlier approved options',
    note: 'Grounded graphite and jade with bronze warmth for focused operational work.',
    anchor: '#182431', primary: '#1E8A70', accent: '#7CADA3', highlight: '#B77936',
    tint: '#DFF6F0', canvas: '#FAF7F2', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#000000', onAnchor: '#FFFFFF',
  },
  {
    id: 'atlantic-copper', name: 'Atlantic Copper', group: 'Architectural contrasts',
    note: 'Confident sapphire, lagoon and copper. A strong all-round premium alternative.',
    anchor: '#102F46', primary: '#2454D6', accent: '#17A7A1', highlight: '#C78A56',
    tint: '#E6F0F5', canvas: '#F7FAFC', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'peacock-coral', name: 'Peacock Coral', group: 'Architectural contrasts',
    note: 'Deep peacock, coral and pale brass: expressive without a rainbow interface.',
    anchor: '#113F4A', primary: '#087F8C', accent: '#EC806C', highlight: '#C6AD73',
    tint: '#E5F3F2', canvas: '#F9FBFA', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'aubergine-chartreuse', name: 'Aubergine Chartreuse', group: 'Architectural contrasts',
    note: 'Aubergine and electric citron, tempered with sea-glass: the boldest contrast.',
    anchor: '#34263F', primary: '#7141A8', accent: '#D7E66C', highlight: '#57B7AD',
    tint: '#F0EAF7', canvas: '#FCFAFD', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'petrol-apricot', name: 'Petrol Apricot', group: 'Architectural contrasts',
    note: 'Petrol blue, apricot and periwinkle: warm, contemporary and unusual.',
    anchor: '#123940', primary: '#116A78', accent: '#F2AD78', highlight: '#8799D6',
    tint: '#E7F0EF', canvas: '#FAFBF8', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'oxblood-opal', name: 'Oxblood Opal', group: 'Warm editorial',
    note: 'Oxblood, opal aqua and champagne: a distinctive luxury direction.',
    anchor: '#451D31', primary: '#8A3154', accent: '#73B8B1', highlight: '#D3AD78',
    tint: '#F4E9EB', canvas: '#FCF9F7', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'espresso-iris', name: 'Espresso Iris', group: 'Warm editorial',
    note: 'Espresso, iris and copper with pale sage: richly layered but calm.',
    anchor: '#352A2A', primary: '#6951BF', accent: '#BE865F', highlight: '#99BCAF',
    tint: '#F1ECE7', canvas: '#FCFAF6', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'olive-porcelain', name: 'Olive Porcelain', group: 'Warm editorial',
    note: 'Olive, ochre and powder blue: understated, architectural and composed.',
    anchor: '#343A2A', primary: '#5E6E32', accent: '#CE975D', highlight: '#9BBFD2',
    tint: '#EFF1E8', canvas: '#FCFBF7', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'ink-saffron', name: 'Ink Saffron', group: 'Warm editorial',
    note: 'Ink blue, saffron and jade: a sharper, brighter executive direction.',
    anchor: '#1B2A41', primary: '#344FA6', accent: '#E9B949', highlight: '#45A396',
    tint: '#EDF0F7', canvas: '#FBFCFE', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'cobalt-persimmon', name: 'Cobalt Persimmon', group: 'Contemporary signatures',
    note: 'Cobalt, persimmon and sea-green: lively, clear and confident.',
    anchor: '#192D5A', primary: '#325AD1', accent: '#E98B62', highlight: '#51ACA4',
    tint: '#EAF0FC', canvas: '#FBFCFF', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'mineral-rose', name: 'Mineral Rose', group: 'Contemporary signatures',
    note: 'Mineral slate, dusty rose and muted brass: softly distinctive.',
    anchor: '#293644', primary: '#3E687A', accent: '#C78991', highlight: '#B6A376',
    tint: '#EEF3F3', canvas: '#FAFBFC', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'plum-glacier', name: 'Plum Glacier', group: 'Contemporary signatures',
    note: 'Plum, glacier cyan and antique gold: cool colour with a warm counterpoint.',
    anchor: '#382A48', primary: '#7650AF', accent: '#69BACC', highlight: '#B79663',
    tint: '#F0EDF7', canvas: '#FBFAFD', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
  {
    id: 'graphite-citron', name: 'Graphite Citron', group: 'Contemporary signatures',
    note: 'Graphite, citron and muted mauve: an unusual editorial-tech combination.',
    anchor: '#222B32', primary: '#3F6672', accent: '#D8DF72', highlight: '#B18FA5',
    tint: '#EDF1EF', canvas: '#FBFCF9', surface: '#FFFFFF', ink: '#1F2B3C',
    onPrimary: '#FFFFFF', onAnchor: '#FFFFFF',
  },
] as const;

const paletteMap = new Map(postLoginPalettes.map((palette) => [palette.id, palette]));

export function isPostLoginPaletteId(value: unknown): value is PostLoginPaletteId {
  return paletteMap.has(String(value) as PostLoginPaletteId);
}

export function normalizePostLoginPaletteId(value: unknown): PostLoginPaletteId {
  return isPostLoginPaletteId(value) ? value : POSTLOGIN_DEFAULT_PALETTE;
}

export function postLoginPaletteById(value: unknown): PostLoginPalette {
  return paletteMap.get(normalizePostLoginPaletteId(value)) || postLoginPalettes[0];
}

export function postLoginPaletteVariables(value: unknown): Record<string, string> {
  const palette = postLoginPaletteById(value);
  return {
    '--stage1-anchor': palette.anchor,
    '--stage1-primary': palette.primary,
    '--stage1-accent': palette.accent,
    '--stage1-highlight': palette.highlight,
    '--stage1-tint': palette.tint,
    '--stage1-canvas': palette.canvas,
    '--stage1-surface': palette.surface,
    '--stage1-ink': palette.ink,
    '--stage1-on-primary': palette.onPrimary,
    '--stage1-on-anchor': palette.onAnchor,
    '--stage1-extra': palette.extra || palette.accent,
  };
}
