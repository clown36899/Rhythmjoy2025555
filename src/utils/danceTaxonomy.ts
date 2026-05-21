export type DanceActivity = 'class' | 'social' | 'event' | 'recruit';
export type DanceGenreFamily = 'partner' | 'street' | 'art' | 'commercial' | 'unknown';
export type DanceScope = 'swing' | 'salsa' | 'bachata' | 'tango' | 'street' | 'unknown';

export interface DanceTaxonomyInput {
  keyword?: string | null;
  source_url?: string | null;
  extracted_text?: string | null;
  structured_data?: {
    title?: string | null;
    event_type?: string | null;
    dance_scope?: DanceScope | null;
    activity_type?: DanceActivity | null;
    genre_family?: DanceGenreFamily | null;
    dance_genre?: string | null;
    subgenre?: string | null;
    tags?: string[] | null;
    djs?: string[] | null;
    location?: string | null;
    note?: string | null;
  } | null;
}

export interface DanceTaxonomyResult {
  activity_type: DanceActivity;
  activity_label: string;
  genre_family: DanceGenreFamily;
  genre_family_label: string;
  dance_genre: string;
  dance_genre_label: string;
  dance_scope: DanceScope;
  dance_scope_label: string;
  tags: string[];
  tag_labels: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface MatchRule {
  key: string;
  label: string;
  family: Exclude<DanceGenreFamily, 'unknown'>;
  patterns: RegExp[];
}

export interface DanceGenreOption {
  key: string;
  label: string;
  family: DanceGenreFamily;
  scope: DanceScope;
  aliases: string[];
  source?: 'preset' | 'event';
}

const activityLabels: Record<DanceActivity, string> = {
  class: '강습',
  social: '소셜',
  event: '행사',
  recruit: '모집',
};

const familyLabels: Record<DanceGenreFamily, string> = {
  partner: '커플·파트너',
  street: '스트릿',
  art: '무용·공연예술',
  commercial: '상업·퍼포먼스',
  unknown: '장르 미정',
};

const danceScopeLabels: Record<DanceScope, string> = {
  swing: '스윙',
  salsa: '살사',
  bachata: '바차타',
  tango: '탱고',
  street: '스트릿',
  unknown: '장르 미정',
};

export const calendarDanceScopeOptions: Array<{ key: Exclude<DanceScope, 'unknown'>; label: string; desc: string }> = [
  { key: 'swing', label: '스윙', desc: '린디합, 솔로재즈, 발보아, 블루스' },
  { key: 'salsa', label: '살사', desc: '살사 일정만' },
  { key: 'bachata', label: '바차타', desc: '바차타 일정만' },
  { key: 'tango', label: '탱고', desc: '탱고, 밀롱가, 프랙티카' },
  { key: 'street', label: '스트릿', desc: '힙합, 왁킹, 팝핑, 락킹' },
];

const collectionScopePartnerGenres = new Set([
  'swing',
  'lindyhop',
  'balboa',
  'blues',
  'solojazz',
  'jitterbug',
  'wcs',
  'salsa',
  'bachata',
  'tango',
]);

const collectionScopeStreetGenres = new Set([
  'hiphop',
  'waacking',
  'popping',
  'locking',
  'house',
  'breaking',
  'krump',
]);

const danceScopeGenreMap: Record<Exclude<DanceScope, 'unknown'>, Set<string>> = {
  swing: new Set(['swing', 'lindyhop', 'balboa', 'blues', 'solojazz', 'jitterbug', 'wcs']),
  salsa: new Set(['salsa']),
  bachata: new Set(['bachata']),
  tango: new Set(['tango']),
  street: collectionScopeStreetGenres,
};

const validDanceScopes = new Set<DanceScope>(['swing', 'salsa', 'bachata', 'tango', 'street', 'unknown']);

const genreRules: MatchRule[] = [
  { key: 'lindyhop', label: '린디합', family: 'partner', patterns: [/린디\s*합/i, /lindy\s*hop/i] },
  { key: 'balboa', label: '발보아', family: 'partner', patterns: [/발보아/i, /balboa/i] },
  { key: 'blues', label: '블루스', family: 'partner', patterns: [/블루스/i, /\bblues?\b/i] },
  { key: 'solojazz', label: '솔로재즈', family: 'partner', patterns: [/솔로\s*재즈/i, /solo\s*jazz/i, /jazz\s*social/i] },
  { key: 'jitterbug', label: '지터벅', family: 'partner', patterns: [/지터벅/i, /jitterbug/i] },
  { key: 'wcs', label: 'WCS', family: 'partner', patterns: [/웨스트\s*코스트/i, /웨코/i, /\bwcs\b/i, /west\s*coast\s*swing/i, /westie/i] },
  { key: 'swing', label: '스윙', family: 'partner', patterns: [/스윙/i, /\bswing\b/i] },
  { key: 'salsa', label: '살사', family: 'partner', patterns: [/살사/i, /\bsalsa\b/i] },
  { key: 'bachata', label: '바차타', family: 'partner', patterns: [/바차타/i, /\bbachata\b/i] },
  { key: 'tango', label: '탱고', family: 'partner', patterns: [/탱고/i, /\btango\b/i, /밀롱가/i, /milonga/i] },
  { key: 'dancesport', label: '댄스스포츠', family: 'partner', patterns: [/댄스\s*스포츠/i, /dancesport/i, /ballroom/i] },
  { key: 'hiphop', label: '힙합', family: 'street', patterns: [/힙합/i, /hip\s*hop/i] },
  { key: 'waacking', label: '왁킹', family: 'street', patterns: [/왁킹/i, /waack/i] },
  { key: 'popping', label: '팝핑', family: 'street', patterns: [/팝핑/i, /popping/i] },
  { key: 'locking', label: '락킹', family: 'street', patterns: [/락킹/i, /locking/i] },
  { key: 'house', label: '하우스', family: 'street', patterns: [/하우스/i, /\bhouse\b/i] },
  { key: 'breaking', label: '브레이킹', family: 'street', patterns: [/브레이킹/i, /비보잉/i, /breaking/i, /bboy/i, /b-girl/i] },
  { key: 'krump', label: '크럼프', family: 'street', patterns: [/크럼프/i, /krump/i] },
  { key: 'contemporary', label: '현대무용', family: 'art', patterns: [/현대\s*무용/i, /컨템포러리/i, /contemporary/i] },
  { key: 'ballet', label: '발레', family: 'art', patterns: [/발레/i, /ballet/i] },
  { key: 'jazzdance', label: '재즈댄스', family: 'art', patterns: [/재즈\s*댄스/i, /jazz\s*dance/i] },
  { key: 'korean_dance', label: '한국무용', family: 'art', patterns: [/한국\s*무용/i, /전통\s*무용/i] },
  { key: 'tap', label: '탭댄스', family: 'art', patterns: [/탭\s*댄스/i, /\btap\b/i] },
  { key: 'musical', label: '뮤지컬댄스', family: 'art', patterns: [/뮤지컬/i, /musical/i] },
  { key: 'kpop', label: 'K-pop', family: 'commercial', patterns: [/케이팝/i, /\bk-?pop\b/i] },
  { key: 'coverdance', label: '커버댄스', family: 'commercial', patterns: [/커버\s*댄스/i, /\bcover\s*dance\b/i] },
  { key: 'heels', label: '힐댄스', family: 'commercial', patterns: [/힐\s*댄스/i, /\bheels?\b/i] },
  { key: 'girlish', label: '걸리쉬', family: 'commercial', patterns: [/걸리쉬/i, /girlish/i] },
  { key: 'choreo_lab', label: '코레오그래피', family: 'commercial', patterns: [/코레오/i, /choreo/i, /choreography/i] },
];

export const presetDanceGenreOptions: DanceGenreOption[] = [
  { key: 'swing', label: '스윙', family: 'partner', scope: 'swing', aliases: ['swing', '스윙댄스', 'swing dance'], source: 'preset' },
  { key: 'lindyhop', label: '린디합', family: 'partner', scope: 'swing', aliases: ['린디 합', 'lindyhop', 'lindy hop'], source: 'preset' },
  { key: 'solojazz', label: '솔로재즈', family: 'partner', scope: 'swing', aliases: ['솔로 재즈', 'solo jazz', 'solo'], source: 'preset' },
  { key: 'balboa', label: '발보아', family: 'partner', scope: 'swing', aliases: ['balboa'], source: 'preset' },
  { key: 'blues', label: '블루스', family: 'partner', scope: 'swing', aliases: ['blues', 'blues dance'], source: 'preset' },
  { key: 'jitterbug', label: '지터벅', family: 'partner', scope: 'swing', aliases: ['jitterbug'], source: 'preset' },
  { key: 'wcs', label: 'WCS', family: 'partner', scope: 'swing', aliases: ['웨코', '웨스트코스트스윙', 'west coast swing', 'westie'], source: 'preset' },
  { key: 'salsa', label: '살사', family: 'partner', scope: 'salsa', aliases: ['salsa'], source: 'preset' },
  { key: 'bachata', label: '바차타', family: 'partner', scope: 'bachata', aliases: ['bachata'], source: 'preset' },
  { key: 'tango', label: '탱고', family: 'partner', scope: 'tango', aliases: ['tango', '아르헨티나탱고', '아르헨티나 탱고', '밀롱가', 'milonga', '프랙티카', 'practica'], source: 'preset' },
  { key: 'street', label: '스트릿', family: 'street', scope: 'street', aliases: ['street', 'street dance', '스트릿댄스'], source: 'preset' },
  { key: 'hiphop', label: '힙합', family: 'street', scope: 'street', aliases: ['hiphop', 'hip hop'], source: 'preset' },
  { key: 'waacking', label: '왁킹', family: 'street', scope: 'street', aliases: ['waacking', 'waack', '왁'], source: 'preset' },
  { key: 'popping', label: '팝핑', family: 'street', scope: 'street', aliases: ['popping', '팝핀'], source: 'preset' },
  { key: 'locking', label: '락킹', family: 'street', scope: 'street', aliases: ['locking', '락킨'], source: 'preset' },
  { key: 'house', label: '하우스', family: 'street', scope: 'street', aliases: ['house'], source: 'preset' },
  { key: 'breaking', label: '브레이킹', family: 'street', scope: 'street', aliases: ['breaking', '비보잉', 'bboy', 'b-boy', 'bgirl', 'b-girl'], source: 'preset' },
  { key: 'krump', label: '크럼프', family: 'street', scope: 'street', aliases: ['krump'], source: 'preset' },
];

const tagRules: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'audition', label: '오디션', patterns: [/오디션/i, /audition/i] },
  { key: 'team_recruit', label: '팀원모집', patterns: [/팀원\s*모집/i, /팀\s*모집/i, /프로젝트\s*팀/i, /team\s*recruit/i] },
  { key: 'crew_recruit', label: '크루모집', patterns: [/크루\s*모집/i, /crew\s*recruit/i] },
  { key: 'participant', label: '참가자모집', patterns: [/참가자\s*모집/i, /참가\s*모집/i, /배틀\s*참가/i, /participant/i] },
  { key: 'choreo', label: '코레오', patterns: [/코레오/i, /안무/i, /choreo/i, /choreography/i] },
  { key: 'technique', label: '테크닉', patterns: [/테크닉/i, /technique/i, /foundation/i] },
  { key: 'basic', label: '베이직', patterns: [/베이직/i, /입문/i, /초급/i, /beginner/i, /\bbasic\b/i] },
  { key: 'partnering', label: '파트너링', patterns: [/파트너링/i, /커넥션/i, /리드/i, /팔로우/i, /partnering/i] },
  { key: 'freestyle', label: '프리스타일', patterns: [/프리스타일/i, /freestyle/i] },
  { key: 'workshop', label: '워크샵', patterns: [/워크샵/i, /특강/i, /원데이/i, /workshop/i] },
  { key: 'party', label: '파티', patterns: [/파티/i, /party/i, /night/i, /나이트/i] },
  { key: 'battle', label: '배틀', patterns: [/배틀/i, /battle/i] },
  { key: 'dj', label: 'DJ', patterns: [/\bdj\b/i, /디제이/i] },
  { key: 'performance', label: '공연', patterns: [/공연/i, /쇼케이스/i, /performance/i, /showcase/i] },
  { key: 'open_class', label: '오픈클래스', patterns: [/오픈\s*클래스/i, /open\s*class/i] },
  { key: 'cover', label: '커버', patterns: [/커버/i, /\bcover\b/i] },
];

function textOf(input: DanceTaxonomyInput): string {
  const sd = input.structured_data || {};
  return [
    sd.title,
    sd.event_type,
    sd.dance_scope,
    sd.dance_genre,
    sd.subgenre,
    sd.location,
    sd.note,
    input.keyword,
    input.source_url,
    input.extracted_text,
    ...(Array.isArray(sd.djs) ? sd.djs : []),
  ].filter(Boolean).join(' ');
}

function tagTextOf(input: DanceTaxonomyInput): string {
  const sd = input.structured_data || {};
  return [
    sd.title,
    sd.subgenre,
    sd.location,
    sd.note,
    input.keyword,
    input.source_url,
    input.extracted_text,
    ...(Array.isArray(sd.djs) ? sd.djs : []),
  ].filter(Boolean).join(' ');
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function normalizeGenreText(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[·ㆍ・]/g, '')
    .replace(/[\s_\-.,/()[\]{}'"!?~:;|\\]+/g, '')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function optionSearchTerms(option: DanceGenreOption): string[] {
  return [option.key, option.label, ...option.aliases].map(normalizeGenreText).filter(Boolean);
}

function inferOptionFromText(value: string, fallbackScope: DanceScope = 'unknown'): DanceGenreOption {
  const inferred = inferDanceTaxonomy({ extracted_text: value });
  const scope = inferred.dance_scope === 'unknown' ? fallbackScope : inferred.dance_scope;
  const family = inferred.genre_family === 'unknown' && scope === 'street' ? 'street' : inferred.genre_family;
  const key = inferred.dance_genre === 'unknown' ? normalizeGenreText(value) : inferred.dance_genre;

  return {
    key: key || value.trim(),
    label: value.trim(),
    family,
    scope,
    aliases: [],
    source: 'event',
  };
}

export function buildDanceGenreOptions(existingGenres: string[] = []): DanceGenreOption[] {
  const optionMap = new Map<string, DanceGenreOption>();
  presetDanceGenreOptions.forEach((option) => {
    optionMap.set(option.key, option);
  });

  existingGenres
    .flatMap((genre) => genre.split(','))
    .map((genre) => genre.trim())
    .filter(Boolean)
    .forEach((genre) => {
      const resolved = resolveDanceGenreInput(genre, { options: Array.from(optionMap.values()) });
      if (resolved.matchType === 'preset') return;

      const inferred = inferOptionFromText(genre);
      const mapKey = inferred.key || normalizeGenreText(inferred.label);
      if (mapKey && !optionMap.has(mapKey)) {
        optionMap.set(mapKey, inferred);
      }
    });

  return Array.from(optionMap.values());
}

export function suggestDanceGenres(
  input: string,
  options: DanceGenreOption[] = presetDanceGenreOptions,
  scope?: DanceScope | null,
  limit = 8,
): Array<DanceGenreOption & { score: number; matchType: 'exact' | 'contains' | 'fuzzy' }> {
  const normalized = normalizeGenreText(input);
  const scopedOptions = scope && scope !== 'unknown'
    ? options.filter((option) => option.scope === scope || option.scope === 'unknown')
    : options;

  if (!normalized) {
    return scopedOptions.slice(0, limit).map((option) => ({ ...option, score: 0.5, matchType: 'contains' }));
  }

  return scopedOptions
    .map((option) => {
      const terms = optionSearchTerms(option);
      const exact = terms.some((term) => term === normalized);
      if (exact) return { ...option, score: 1, matchType: 'exact' as const };

      const contains = terms.some((term) => term.includes(normalized) || normalized.includes(term));
      if (contains) return { ...option, score: 0.82, matchType: 'contains' as const };

      const minDistance = Math.min(...terms.map((term) => levenshteinDistance(normalized, term)));
      const shortest = Math.min(...terms.map((term) => term.length).filter(Boolean));
      const maxLen = Math.max(normalized.length, shortest || 1);
      const fuzzyAllowed = normalized.length <= 3 ? minDistance <= 1 : minDistance <= 2;
      const score = fuzzyAllowed ? 1 - minDistance / maxLen : 0;
      return { ...option, score, matchType: 'fuzzy' as const };
    })
    .filter((option) => option.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ko'))
    .slice(0, limit);
}

export function resolveDanceGenreInput(
  value: string,
  config: {
    options?: DanceGenreOption[];
    fallbackScope?: DanceScope | null;
  } = {},
): {
  key: string;
  label: string;
  scope: DanceScope;
  family: DanceGenreFamily;
  matchType: 'preset' | 'existing' | 'custom' | 'empty';
  suggestion?: DanceGenreOption;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { key: 'unknown', label: '', scope: config.fallbackScope || 'unknown', family: 'unknown', matchType: 'empty' };
  }

  const options = config.options || presetDanceGenreOptions;
  const suggestions = suggestDanceGenres(trimmed, options, null, 1);
  const top = suggestions[0];
  if (top && (top.matchType === 'exact' || top.score >= 0.67 || (top.matchType === 'fuzzy' && normalizeGenreText(trimmed).length <= 3 && top.score >= 0.5))) {
    const resolvedScope = top.scope === 'unknown' ? (config.fallbackScope || top.scope) : top.scope;
    return {
      key: top.key,
      label: top.label,
      scope: resolvedScope,
      family: top.family === 'unknown' && resolvedScope === 'street' ? 'street' : top.family,
      matchType: top.source === 'event' ? 'existing' : 'preset',
      suggestion: top,
    };
  }

  const inferred = inferOptionFromText(trimmed, config.fallbackScope || 'unknown');
  return {
    key: inferred.key,
    label: inferred.label,
    scope: inferred.scope,
    family: inferred.family,
    matchType: 'custom',
    suggestion: top,
  };
}

function inferActivity(input: DanceTaxonomyInput, text: string): DanceActivity {
  const explicit = input.structured_data?.activity_type;
  if (explicit && ['class', 'social', 'event', 'recruit'].includes(explicit)) return explicit;

  const eventType = input.structured_data?.event_type || '';
  const recruitStrong = /(참가자|팀원|크루|멤버|댄서|출연진)\s*모집|오디션|audition|crew\s*recruit|team\s*recruit/i;
  if (recruitStrong.test(text)) return 'recruit';
  if (/강습|수업|레슨|클래스|워크샵|특강|원데이|오픈\s*클래스|입문|초급|중급|class|lesson|workshop/i.test(text) || eventType === '강습') return 'class';
  if (/소셜|social|프랙티카|practica|밀롱가|milonga|\bdj\b/i.test(text) || eventType === '소셜') return 'social';
  return 'event';
}

function inferGenre(text: string): Pick<DanceTaxonomyResult, 'genre_family' | 'genre_family_label' | 'dance_genre' | 'dance_genre_label' | 'confidence'> {
  const matched = genreRules.find((rule) => hasAny(text, rule.patterns));
  if (matched) {
    return {
      genre_family: matched.family,
      genre_family_label: familyLabels[matched.family],
      dance_genre: matched.key,
      dance_genre_label: matched.label,
      confidence: 'high',
    };
  }

  return {
    genre_family: 'unknown',
    genre_family_label: familyLabels.unknown,
    dance_genre: 'unknown',
    dance_genre_label: '장르 미정',
    confidence: 'low',
  };
}

function scopeFromGenre(genre: string | null | undefined): DanceScope {
  if (!genre) return 'unknown';
  for (const [scope, genres] of Object.entries(danceScopeGenreMap) as Array<[Exclude<DanceScope, 'unknown'>, Set<string>]>) {
    if (genres.has(genre)) return scope;
  }
  return 'unknown';
}

function inferDanceScope(input: DanceTaxonomyInput, text: string, genre: string): DanceScope {
  const explicit = input.structured_data?.dance_scope;
  if (explicit && validDanceScopes.has(explicit)) return explicit;

  const byGenre = scopeFromGenre(genre);
  if (byGenre !== 'unknown') return byGenre;

  if (/(탱고|tango|밀롱가|milonga|프랙티카|practica)/i.test(text)) return 'tango';
  if (/(바차타|bachata)/i.test(text)) return 'bachata';
  if (/(살사|salsa)/i.test(text)) return 'salsa';
  if (/(힙합|hip\s*hop|왁킹|waack|팝핑|popping|락킹|locking|하우스|house|브레이킹|breaking|비보잉|bboy|b-girl|크럼프|krump)/i.test(text)) return 'street';
  if (/(린디\s*합|lindy\s*hop|스윙|swing|지터벅|jitterbug|발보아|balboa|블루스|blues|솔로\s*재즈|solo\s*jazz|웨스트\s*코스트|웨코|\bwcs\b|west\s*coast\s*swing)/i.test(text)) return 'swing';

  return 'unknown';
}

function inferTags(activity: DanceActivity, input: DanceTaxonomyInput): string[] {
  const tags = new Set<string>();
  const tagText = tagTextOf(input);
  tagRules.forEach((rule) => {
    if (hasAny(tagText, rule.patterns)) tags.add(rule.key);
  });

  if (activity === 'recruit' && tags.size === 0) tags.add('team_recruit');
  if (activity === 'social' && Array.isArray(input.structured_data?.djs) && input.structured_data?.djs?.length) tags.add('dj');
  return Array.from(tags);
}

export function getDanceTagLabel(tag: string): string {
  return tagRules.find((rule) => rule.key === tag)?.label || tag.replaceAll('_', ' ');
}

export function getDanceActivityLabel(activity: DanceActivity): string {
  return activityLabels[activity] || '행사';
}

export function getDanceFamilyLabel(family: DanceGenreFamily): string {
  return familyLabels[family] || familyLabels.unknown;
}

export function getDanceGenreLabel(genre: string): string {
  return genreRules.find((rule) => rule.key === genre)?.label || (genre === 'unknown' ? '장르 미정' : genre);
}

export function getDanceScopeLabel(scope: DanceScope | string | null | undefined): string {
  return danceScopeLabels[(scope || 'unknown') as DanceScope] || danceScopeLabels.unknown;
}

export function normalizeDanceScope(value: string | null | undefined): Exclude<DanceScope, 'unknown'> {
  return value === 'salsa' || value === 'bachata' || value === 'tango' || value === 'street' ? value : 'swing';
}

export function inferDanceScopeForEvent(event: {
  title?: string | null;
  genre?: string | null;
  category?: string | null;
  dance_scope?: DanceScope | string | null;
  dance_genre?: string | null;
  activity_type?: DanceActivity | string | null;
  link1?: string | null;
  location?: string | null;
  venue_name?: string | null;
}): DanceScope {
  const explicit = event.dance_scope;
  if (explicit && validDanceScopes.has(explicit as DanceScope)) return explicit as DanceScope;

  const byGenre = scopeFromGenre(event.dance_genre);
  if (byGenre !== 'unknown') return byGenre;

  const text = [
    event.genre,
    event.title,
    event.category,
    event.activity_type,
    event.link1,
    event.location,
    event.venue_name,
  ].filter(Boolean).join(' ');

  const inferred = inferDanceScope({ extracted_text: text }, text, 'unknown');
  if (inferred !== 'unknown') return inferred;

  // Legacy calendar data was mostly swing before expansion. Keep it visible under swing
  // until explicit metadata is backfilled.
  return 'swing';
}

export function isEventInDanceScope(event: Parameters<typeof inferDanceScopeForEvent>[0], scope: DanceScope | string | null | undefined): boolean {
  return inferDanceScopeForEvent(event) === normalizeDanceScope(scope as string | null | undefined);
}

export function getDanceCollectionScopeExclusionReason(value: {
  genre_family?: DanceGenreFamily | string | null;
  dance_genre?: string | null;
  genre_family_label?: string | null;
  dance_genre_label?: string | null;
} | null | undefined): string | null {
  const family = value?.genre_family || 'unknown';
  const genre = value?.dance_genre || 'unknown';
  const familyLabel = value?.genre_family_label || getDanceFamilyLabel(family as DanceGenreFamily);
  const genreLabel = value?.dance_genre_label || getDanceGenreLabel(genre);

  if (family === 'art') return `수집 범위 제외: ${familyLabel}`;
  if (family === 'commercial') return `수집 범위 제외: ${familyLabel}`;
  if (family === 'street') return collectionScopeStreetGenres.has(genre) || genre === 'unknown'
    ? null
    : `수집 범위 제외: 스트릿 외 세부 장르(${genreLabel})`;
  if (family === 'partner') return collectionScopePartnerGenres.has(genre) || genre === 'unknown'
    ? null
    : `수집 범위 제외: 허용 파트너 장르 외(${genreLabel})`;
  return '수집 범위 제외: 장르 미정';
}

export function inferDanceTaxonomy(input: DanceTaxonomyInput): DanceTaxonomyResult {
  const text = textOf(input);
  const activity = inferActivity(input, text);
  const genre = inferGenre(text);
  const danceScope = inferDanceScope(input, text, genre.dance_genre);
  const tags = inferTags(activity, input);

  return {
    activity_type: activity,
    activity_label: activityLabels[activity],
    ...genre,
    dance_scope: danceScope,
    dance_scope_label: getDanceScopeLabel(danceScope),
    tags,
    tag_labels: tags.map(getDanceTagLabel),
    confidence: genre.confidence === 'low' && tags.length > 0 ? 'medium' : genre.confidence,
  };
}

export function mergeDanceTaxonomyStructuredData(input: DanceTaxonomyInput) {
  const sd = input.structured_data || {};
  const inferred = inferDanceTaxonomy(input);
  const existingTags = Array.isArray(sd.tags) ? sd.tags.filter(Boolean) : [];
  const tags = Array.from(new Set([...existingTags, ...inferred.tags]));
  const activityType = sd.activity_type || inferred.activity_type;
  const genreFamily = sd.genre_family || inferred.genre_family;
  const danceGenre = sd.dance_genre || inferred.dance_genre;
  const danceScope = sd.dance_scope || inferred.dance_scope;

  return {
    ...sd,
    dance_scope: danceScope,
    dance_scope_label: getDanceScopeLabel(danceScope),
    activity_type: activityType,
    activity_label: getDanceActivityLabel(activityType),
    genre_family: genreFamily,
    genre_family_label: getDanceFamilyLabel(genreFamily),
    dance_genre: danceGenre,
    dance_genre_label: getDanceGenreLabel(danceGenre),
    tags,
    tag_labels: tags.map(getDanceTagLabel),
    taxonomy_confidence: inferred.confidence,
  };
}
