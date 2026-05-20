export type DanceActivity = 'class' | 'social' | 'event' | 'recruit';
export type DanceGenreFamily = 'partner' | 'street' | 'art' | 'commercial' | 'unknown';

export interface DanceTaxonomyInput {
  keyword?: string | null;
  source_url?: string | null;
  extracted_text?: string | null;
  structured_data?: {
    title?: string | null;
    event_type?: string | null;
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
  const tags = inferTags(activity, input);

  return {
    activity_type: activity,
    activity_label: activityLabels[activity],
    ...genre,
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

  return {
    ...sd,
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
