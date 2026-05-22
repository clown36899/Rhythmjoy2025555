import crypto from 'node:crypto';
import {
  allowedCollectionScopes,
  findSourceByUrl,
  getExcludedSourceReason,
} from './collection-registry.mjs';

const activityLabels = {
  class: '강습',
  social: '소셜',
  event: '행사',
  recruit: '모집',
};

const familyLabels = {
  partner: '커플·파트너',
  street: '스트릿',
  art: '무용·공연예술',
  commercial: '상업·퍼포먼스',
  unknown: '장르 미정',
};

const scopeLabels = {
  swing: '스윙',
  salsa: '살사',
  bachata: '바차타',
  tango: '탱고',
  street: '스트릿',
  unknown: '장르 미정',
};

const genreLabels = {
  swing: '스윙',
  lindyhop: '린디합',
  balboa: '발보아',
  blues: '블루스',
  solojazz: '솔로재즈',
  jitterbug: '지터벅',
  wcs: 'WCS',
  salsa: '살사',
  bachata: '바차타',
  tango: '탱고',
  hiphop: '힙합',
  waacking: '왁킹',
  popping: '팝핑',
  locking: '락킹',
  house: '하우스',
  breaking: '브레이킹',
  krump: '크럼프',
  contemporary: '현대무용',
  ballet: '발레',
  jazzdance: '재즈댄스',
  korean_dance: '한국무용',
  tap: '탭댄스',
  musical: '뮤지컬댄스',
  kpop: 'K-pop',
  coverdance: '커버댄스',
  heels: '힐댄스',
  girlish: '걸리쉬',
  choreo_lab: '코레오그래피',
  unknown: '장르 미정',
};

const genreRules = [
  ['lindyhop', 'partner', [/린디\s*합/i, /lindy\s*hop/i]],
  ['balboa', 'partner', [/발보아/i, /balboa/i]],
  ['blues', 'partner', [/블루스/i, /\bblues?\b/i]],
  ['solojazz', 'partner', [/솔로\s*재즈/i, /solo\s*jazz/i, /jazz\s*social/i]],
  ['jitterbug', 'partner', [/지터벅/i, /jitterbug/i]],
  ['wcs', 'partner', [/웨스트\s*코스트/i, /웨코/i, /\bwcs\b/i, /west\s*coast\s*swing/i, /westie/i]],
  ['swing', 'partner', [/스윙/i, /\bswing\b/i]],
  ['bachata', 'partner', [/바차타/i, /\bbachata\b/i]],
  ['salsa', 'partner', [/살사/i, /\bsalsa\b/i, /강턴/i, /홍턴/i, /보니따/i, /하바나/i, /까리베/i]],
  ['tango', 'partner', [/탱고/i, /\btango\b/i, /밀롱가/i, /milonga/i, /프랙티카/i, /practica/i, /루미노소/i, /까사밀롱가/i]],
  ['hiphop', 'street', [/힙합/i, /hip\s*hop/i]],
  ['waacking', 'street', [/왁킹/i, /waack/i]],
  ['popping', 'street', [/팝핑/i, /popping/i]],
  ['locking', 'street', [/락킹/i, /locking/i]],
  ['house', 'street', [/하우스/i, /\bhouse\b/i]],
  ['breaking', 'street', [/브레이킹/i, /비보잉/i, /breaking/i, /bboy/i, /b-girl/i]],
  ['krump', 'street', [/크럼프/i, /krump/i]],
  ['contemporary', 'art', [/현대\s*무용/i, /컨템포러리/i, /contemporary/i]],
  ['ballet', 'art', [/발레/i, /ballet/i]],
  ['jazzdance', 'art', [/재즈\s*댄스/i, /jazz\s*dance/i]],
  ['korean_dance', 'art', [/한국\s*무용/i, /전통\s*무용/i]],
  ['tap', 'art', [/탭\s*댄스/i, /\btap\b/i]],
  ['musical', 'art', [/뮤지컬/i, /musical/i]],
  ['kpop', 'commercial', [/케이팝/i, /\bk-?pop\b/i]],
  ['coverdance', 'commercial', [/커버\s*댄스/i, /\bcover\s*dance\b/i]],
  ['heels', 'commercial', [/힐\s*댄스/i, /\bheels?\b/i]],
  ['girlish', 'commercial', [/걸리쉬/i, /girlish/i]],
  ['choreo_lab', 'commercial', [/코레오/i, /choreo/i, /choreography/i]],
];

const tagRules = [
  ['audition', [/오디션/i, /audition/i]],
  ['team_recruit', [/팀원\s*모집/i, /팀\s*모집/i, /team\s*recruit/i]],
  ['crew_recruit', [/크루\s*모집/i, /crew\s*recruit/i]],
  ['participant', [/참가자\s*모집/i, /참가\s*모집/i, /배틀\s*참가/i, /participant/i]],
  ['choreo', [/코레오/i, /안무/i, /choreo/i, /choreography/i]],
  ['technique', [/테크닉/i, /technique/i, /foundation/i]],
  ['basic', [/베이직/i, /입문/i, /초급/i, /beginner/i, /\bbasic\b/i]],
  ['partnering', [/파트너링/i, /커넥션/i, /리드/i, /팔로우/i, /partnering/i]],
  ['freestyle', [/프리스타일/i, /freestyle/i]],
  ['workshop', [/워크샵/i, /워크숍/i, /특강/i, /원데이/i, /workshop/i]],
  ['party', [/파티/i, /party/i, /night/i, /나이트/i]],
  ['battle', [/배틀/i, /battle/i]],
  ['dj', [/\bdj\b/i, /디제이/i]],
  ['performance', [/공연/i, /쇼케이스/i, /performance/i, /showcase/i]],
  ['open_class', [/오픈\s*클래스/i, /open\s*class/i]],
  ['session', [/세션/i, /session/i]],
  ['popup', [/팝업/i, /pop-up/i, /special\s*class/i]],
];

export function todayISO(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeSourceUrl(url = '') {
  try {
    const parsed = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'igsh', 'igshid'].forEach((key) => parsed.searchParams.delete(key));
    parsed.hash = '';
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

export function makeDeterministicId(sourceUrl, date, suffix = '') {
  const raw = `${normalizeSourceUrl(sourceUrl)}|${String(date || '').slice(0, 10)}${suffix ? `|${suffix}` : ''}`;
  return crypto.createHash('md5').update(raw).digest('hex').slice(0, 16);
}

export function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/blues?/g, '블루스')
    .replace(/dance/g, '댄스')
    .replace(/festival/g, '페스티벌')
    .replace(/dj\s*/gi, '')
    .replace(/[^\w가-힣]/g, '');
}

export function textSimilarity(a, b) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const grams = (value) => {
    if (value.length <= 2) return new Set([value]);
    const result = new Set();
    for (let i = 0; i <= value.length - 2; i += 1) result.add(value.slice(i, i + 2));
    return result;
  };
  const aGrams = grams(left);
  const bGrams = grams(right);
  const intersection = [...aGrams].filter((gram) => bGrams.has(gram)).length;
  const union = new Set([...aGrams, ...bGrams]).size;
  return union ? intersection / union : 0;
}

function anyMatch(text, rules) {
  return rules.some((rule) => rule.test(text));
}

function textOf(candidate) {
  const sd = candidate.structured_data || {};
  return [
    candidate.keyword,
    candidate.source_url,
    candidate.extracted_text,
    sd.title,
    sd.event_type,
    sd.activity_type,
    sd.dance_scope,
    sd.dance_genre,
    sd.subgenre,
    sd.location,
    sd.venue_name,
    sd.note,
    ...(Array.isArray(sd.djs) ? sd.djs : []),
  ].filter(Boolean).join(' ');
}

function inferActivity(text, explicit) {
  if (['class', 'social', 'event', 'recruit'].includes(explicit)) return explicit;
  if (/(참가자|팀원|크루|멤버|댄서|출연진)\s*모집|오디션|audition|crew\s*recruit|team\s*recruit/i.test(text)) return 'recruit';
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원데이|오픈\s*클래스|입문|초급|중급|class|lesson|workshop/i.test(text)) return 'class';
  if (/소셜|social|프랙티카|practica|밀롱가|milonga|\bdj\b/i.test(text)) return 'social';
  return 'event';
}

function inferGenre(text) {
  const matched = genreRules.find(([, , patterns]) => anyMatch(text, patterns));
  if (!matched) return { genre: 'unknown', family: 'unknown', confidence: 'low' };
  return { genre: matched[0], family: matched[1], confidence: 'high' };
}

function scopeFromGenre(genre) {
  if (['swing', 'lindyhop', 'balboa', 'blues', 'solojazz', 'jitterbug', 'wcs'].includes(genre)) return 'swing';
  if (genre === 'salsa') return 'salsa';
  if (genre === 'bachata') return 'bachata';
  if (genre === 'tango') return 'tango';
  if (['hiphop', 'waacking', 'popping', 'locking', 'house', 'breaking', 'krump', 'street'].includes(genre)) return 'street';
  return 'unknown';
}

function inferTags(text, activity, existingTags = []) {
  const tags = new Set(existingTags.filter(Boolean));
  tagRules.forEach(([tag, patterns]) => {
    if (anyMatch(text, patterns)) tags.add(tag);
  });
  if (activity === 'recruit' && tags.size === 0) tags.add('team_recruit');
  return [...tags];
}

export function inferCandidateTaxonomy(candidate) {
  const source = findSourceByUrl(candidate.source_url);
  const sd = candidate.structured_data || {};
  const text = textOf(candidate);
  const activity = inferActivity(text, sd.activity_type);
  const inferredGenre = inferGenre(text);
  const danceGenre = sd.dance_genre || (inferredGenre.genre === 'unknown' ? source?.genre : inferredGenre.genre) || 'unknown';
  const genreFamily = sd.genre_family || (inferredGenre.family === 'unknown' ? source?.family : inferredGenre.family) || 'unknown';
  const danceScope = sd.dance_scope || scopeFromGenre(danceGenre) || source?.scope || 'unknown';
  const tags = inferTags(text, activity, Array.isArray(sd.tags) ? sd.tags : []);

  return {
    activity_type: activity,
    activity_label: activityLabels[activity] || activity,
    genre_family: genreFamily,
    genre_family_label: familyLabels[genreFamily] || genreFamily,
    dance_genre: danceGenre,
    dance_genre_label: genreLabels[danceGenre] || danceGenre,
    dance_scope: danceScope,
    dance_scope_label: scopeLabels[danceScope] || danceScope,
    tags,
    taxonomy_confidence: inferredGenre.confidence,
  };
}

export function hasBadPosterUrl(url = '') {
  const value = String(url || '');
  return /(?:p240x240|s240x240|s640x640|stp=c\d|\/s\d+x\d+\/)/i.test(value);
}

export function getCollectionExclusionReason(taxonomy) {
  const family = taxonomy.genre_family || 'unknown';
  const genre = taxonomy.dance_genre || 'unknown';
  const scope = taxonomy.dance_scope || 'unknown';
  if (family === 'art') return `수집 범위 제외: ${taxonomy.genre_family_label || '무용·공연예술'}`;
  if (family === 'commercial') return `수집 범위 제외: ${taxonomy.genre_family_label || '상업·퍼포먼스'}`;
  if (!allowedCollectionScopes.includes(scope)) return `수집 범위 제외: ${taxonomy.dance_scope_label || scope}`;
  if (family === 'unknown' || genre === 'unknown') return '수집 범위 제외: 장르 미정';
  return null;
}

export function validateCandidate(candidate, { today = todayISO() } = {}) {
  const errors = [];
  const warnings = [];
  const sourceUrl = normalizeSourceUrl(candidate.source_url);
  const sd = candidate.structured_data || {};
  const date = String(sd.date || candidate.date || '').slice(0, 10);
  const text = textOf(candidate);
  const taxonomy = inferCandidateTaxonomy(candidate);
  const source = findSourceByUrl(sourceUrl);
  const sourceExcludedReason = getExcludedSourceReason(sourceUrl);
  const scopeExcludedReason = getCollectionExclusionReason(taxonomy);

  if (!sourceUrl) errors.push('source_url required');
  if (sourceExcludedReason) errors.push(sourceExcludedReason);
  if (!date) errors.push('structured_data.date required');
  if (date && date < today) errors.push(`past event date: ${date} < ${today}`);
  if (!candidate.poster_url && !candidate.imageData) errors.push('poster_url or imageData required');
  if (candidate.poster_url && hasBadPosterUrl(candidate.poster_url)) errors.push('poster_url looks cropped or thumbnail-sized');
  if (scopeExcludedReason) errors.push(scopeExcludedReason);
  if (source?.discoveryOnly) warnings.push('discovery-only source: verify official source URL before saving');
  if (taxonomy.activity_type === 'social' && !Array.isArray(sd.djs) && !/\bdj\b|디제이|밀롱가|프랙티카|소셜|social/i.test(text)) {
    warnings.push('social candidate lacks visible DJ or concrete social context');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    taxonomy,
    source,
    normalizedSourceUrl: sourceUrl,
    date,
  };
}

export function prepareCandidate(rawCandidate, config = {}) {
  const normalizedSourceUrl = normalizeSourceUrl(rawCandidate.source_url);
  const taxonomy = inferCandidateTaxonomy({ ...rawCandidate, source_url: normalizedSourceUrl });
  const structuredData = {
    ...(rawCandidate.structured_data || {}),
    ...taxonomy,
  };
  const date = String(structuredData.date || '').slice(0, 10);
  const id = rawCandidate.id || makeDeterministicId(normalizedSourceUrl, date, rawCandidate.id_suffix || '');
  const candidate = {
    ...rawCandidate,
    id,
    source_url: normalizedSourceUrl,
    structured_data: structuredData,
    is_collected: rawCandidate.is_collected || false,
  };

  return {
    candidate,
    validation: validateCandidate(candidate, config),
  };
}

export function buildNetlifyPayload(rawCandidate, config = {}) {
  const { candidate, validation } = prepareCandidate(rawCandidate, config);
  if (!validation.ok) {
    const error = new Error(`Invalid ingestion candidate: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }
  return candidate;
}
