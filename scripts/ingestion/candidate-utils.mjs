import crypto from 'node:crypto';
import {
  allowedCollectionScopes,
  findSourceForCandidate,
  getExcludedSourceReason,
} from './collection-registry.mjs';
import { getIngestionCandidateExclusionReason } from '../../server/cafe24/ingestion-candidate-policy.js';
import { getGraduationEventMetadata } from '../../src/utils/graduationEvent.mjs';

const activityLabels = {
  class: '강습',
  social: '소셜',
  event: '행사',
  recruit: '모집',
  sale: '판매이벤트',
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
  ['oneday', [/원\s*데이/i, /원데이/i, /\b1\s*day\b/i, /\bone\s*day\b/i, /\boneday\b/i, /일일\s*(?:클래스|강습|수업|체험)/i, /하루(?:만|짜리)?\s*(?:클래스|강습|수업|체험|배워)/i, /체험\s*(?:클래스|강습|수업)/i]],
  ['audition', [/오디션/i, /audition/i]],
  ['team_recruit', [/팀원\s*모집/i, /팀\s*모집/i, /team\s*recruit/i]],
  ['crew_recruit', [/크루\s*모집/i, /crew\s*recruit/i]],
  ['participant', [/참가자\s*모집/i, /참가\s*모집/i, /배틀\s*참가/i, /participant/i]],
  ['choreo', [/코레오/i, /안무/i, /choreo/i, /choreography/i]],
  ['technique', [/테크닉/i, /technique/i, /foundation/i]],
  ['basic', [/베이직/i, /입문/i, /초급/i, /beginner/i, /\bbasic\b/i]],
  ['partnering', [/파트너링/i, /커넥션/i, /리드/i, /팔로우/i, /partnering/i]],
  ['freestyle', [/프리스타일/i, /freestyle/i]],
  ['workshop', [/워크샵/i, /워크숍/i, /특강/i, /원\s*데이/i, /원데이/i, /\bone\s*day\b/i, /\boneday\b/i, /workshop/i]],
  ['party', [/파티/i, /party/i, /night/i, /나이트/i]],
  ['battle', [/배틀/i, /battle/i]],
  ['dj', [/\bdj\b/i, /디제이/i]],
  ['performance', [/공연/i, /쇼케이스/i, /performance/i, /showcase/i]],
  ['open_class', [/오픈\s*클래스/i, /open\s*class/i, /체험\s*(?:클래스|강습|수업)/i, /처음이라면/i]],
  ['session', [/세션/i, /session/i]],
  ['popup', [/팝업/i, /pop-up/i, /special\s*class/i]],
  ['sale_event', [/판매\s*이벤트/i, /이벤트\s*판매/i, /특가/i, /할인/i, /\bsale\b/i, /\bpromotion\b/i]],
  ['season_pass', [/정기\s*(?:할인)?권/i, /시즌\s*(?:권|패스)/i, /월(?:간)?\s*(?:권|정액)/i, /다회권/i, /\d+\s*회권/i, /프리\s*패스/i, /티켓\s*북/i, /패키지\s*권/i, /멤버십/i, /membership/i, /\bpass\b/i]],
  ['free_event', [/무료\s*(?:이벤트|행사|파티|강습|클래스|수업|체험)/i, /\bfree\b/i]],
];

const seasonPassEvidencePattern = /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b/i;
const contentSectionMarkerPattern = /(?:^|[\n\r]|\s)([■▪●◆◇□▶▣])\s*/gu;

/**
 * Keep a pass-sale block independent from other events in the same source post.
 * Daum/Naver cafe notices commonly concatenate multiple bullet-headed notices,
 * and a pass block must not inherit a neighbouring social's date or DJ.
 */
export function extractSeasonPassEvidenceSections(text = '') {
  const raw = String(text || '').normalize('NFKC').trim();
  if (!raw || !seasonPassEvidencePattern.test(raw)) return [];

  const markerMatches = [...raw.matchAll(contentSectionMarkerPattern)];
  const markedSections = markerMatches.map((match, index) => {
    const markerOffset = String(match[0] || '').lastIndexOf(match[1]);
    const start = match.index + Math.max(0, markerOffset);
    const next = markerMatches[index + 1];
    const nextMarkerOffset = next ? String(next[0] || '').lastIndexOf(next[1]) : 0;
    const end = next ? next.index + Math.max(0, nextMarkerOffset) : raw.length;
    return raw.slice(start, end).trim();
  }).filter((section) => seasonPassEvidencePattern.test(section));

  const paragraphSections = raw
    .split(/\n\s*\n+/)
    .map((section) => section.trim())
    .filter((section) => section && seasonPassEvidencePattern.test(section));
  const focused = markedSections.length ? markedSections : paragraphSections;
  const sections = focused.length ? focused : [raw];
  const uniqueSections = [...new Map(sections.map((section) => [
    section.replace(/\s+/g, ' ').trim(),
    section,
  ])).values()];

  return uniqueSections.filter((section, index, all) => {
    const compact = section.replace(/\s+/g, ' ').trim();
    if (compact.length >= 120) return true;
    return !all.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherCompact = other.replace(/\s+/g, ' ').trim();
      return otherCompact.length > compact.length && otherCompact.includes(compact);
    });
  });
}

export function classifyConfirmedBenefitEvent(candidate = {}) {
  const sd = candidate.structured_data || {};
  const text = [
    sd.title,
    candidate.extracted_text,
    sd.description,
    sd.price,
  ].filter(Boolean).join(' ').normalize('NFKC');
  const seasonPassText = text
    .replace(/(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십)[^.!?\n]{0,40}(?:판매|구매|신청|운영)?\s*(?:하지\s*않|안\s*함|없(?:음|습니다|다)|불가|종료|마감|중단|폐지|품절)/gi, ' ')
    .replace(/(?:판매|구매|신청|운영)\s*(?:하지\s*않|안\s*함|없(?:음|습니다|다)|불가|종료|마감|중단|폐지|품절)[^.!?\n]{0,20}(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십)/gi, ' ');
  if (/(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십)[^.!?\n]{0,60}(?:판매|신청|모집|오픈|출시|구매|이벤트|가격|요금|안내)|(?:판매|신청|구매)\s*(?:가능한\s*)?(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십)|(?:입장권|티켓)\s*\d+\s*(?:장|회)\s*(?:묶음|패키지)\s*(?:판매|구매|신청|오픈|가격|안내)/i.test(seasonPassText)) {
    return 'season_pass';
  }
  const discountText = text
    .replace(/(?:할인|특가|얼리\s*버드|쿠폰|프로모션|혜택)[^.!?\n]{0,14}(?:없(?:음|습니다|다)|아님|제외|불가|종료|마감|소진)/gi, ' ')
    .replace(/\b(?:discount|promotion|early\s*bird|coupon)\s*(?:is\s+)?(?:not|unavailable|excluded|closed|ended|sold\s*out)\b/gi, ' ');
  if (/(?:\d{1,2}\s*%|\d[\d,]*\s*원)\s*할인|할인\s*(?:판매|이벤트|행사|쿠폰|코드|혜택|가격|가|적용|중|제공)|(?:얼리\s*버드|조기\s*등록)[^.!?\n]{0,32}(?:할인|특가|혜택|\d{1,2}\s*%)|(?:할인|특가|혜택)[^.!?\n]{0,32}(?:얼리\s*버드|조기\s*등록)|(?:특가|쿠폰|프로모션)\s*(?:할인|판매|이벤트|가격|혜택|오픈|중)?|(?:회원|첫\s*방문|단체|학생)\s*(?:은|는|이|가|대상)?\s*\d{1,2}\s*%\s*할인|\b(?:discount|promotion|coupon)\b/i.test(discountText)) {
    return 'discount_event';
  }
  const benefitText = text
    .replace(/무료\s*(?:라인\s*)?(?:강습|클래스|수업|체험|입장|행사|이벤트|파티)?\s*(?:은|는|이|가)?\s*(?:없(?:음|습니다|다|는)|아님|제외|불가|종료|마감)/gi, ' ')
    .replace(/\bfree\s+(?:class|lesson|event|party|admission)?\s*(?:is\s+)?(?:not|unavailable|excluded|closed|ended)\b/gi, ' ')
    .replace(/무료\s*(?:혜택|제공|증정|체험|입장|관람|강습|클래스|수업|이벤트|행사|파티|주차|음료|물|락커|보관|상담|와이파이|wifi|대여|대관)?\s*(?:은|는|이|가)?\s*(?:종료|마감|소진)/gi, ' ');
  if (/(?:참가비|입장료|수강료|이용료|가격|비용|금액)\s*[:：]?\s*(?:완전\s*)?(?:0\s*원|무료)|(?:누구나|모두|전원|참여|참가|입장|관람|수강)\s*(?:은|는|이|가|가능)?\s*무료|무료\s*(?:(?:스윙\s*댄스|스윙|린디합|발보아|블루스|솔로\s*재즈|살사|바차타|탱고|스트릿\s*댄스|원\s*데이|맛보기|라인)\s*){0,2}(?:체험|입장|관람|강습(?!권)|클래스|수업|이벤트|행사|파티|참가|참여|워크숍|워크샵)|(?:체험|입장|관람|강습|클래스|수업|이벤트|행사|파티|참가|참여|워크숍|워크샵)\s*(?:은|는|이|가)?\s*무료|\bfree\s+(?:class|lesson|event|party|admission|entry|workshop|participation)\b|(?:admission|entry|class|lesson|event|party|workshop|participation)\s*[:：-]?\s*free\b/i.test(benefitText)) {
    return 'free_event';
  }
  return null;
}

function validIsoDate(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const parsed = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (
    parsed.getUTCFullYear() !== numericYear
    || parsed.getUTCMonth() + 1 !== numericMonth
    || parsed.getUTCDate() !== numericDay
  ) return '';
  return `${String(numericYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`;
}

export function extractBenefitValidityEndDate(value = '', { today = todayISO() } = {}) {
  const text = String(value || '').normalize('NFKC');
  const referenceYear = Number(String(today || todayISO()).slice(0, 4));
  const ranges = [];
  const addRange = (startYear, startMonth, startDay, endYear, endMonth, endDay) => {
    let resolvedStartYear = Number(startYear) || referenceYear;
    let resolvedEndYear = Number(endYear) || resolvedStartYear;
    if (!endYear && Number(endMonth) < Number(startMonth)) resolvedEndYear += 1;
    const start = validIsoDate(resolvedStartYear, startMonth, startDay);
    const end = validIsoDate(resolvedEndYear, endMonth, endDay);
    if (start && end && end >= start) ranges.push(end);
  };

  for (const match of text.matchAll(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(?:~|～|−|–|—|-|부터)\s*(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g)) {
    addRange(match[1], match[2], match[3], match[4], match[5], match[6]);
  }
  for (const match of text.matchAll(/(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})\s*(?:~|～|−|–|—|부터)\s*(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})/g)) {
    addRange(match[1], match[2], match[3], match[4], match[5], match[6]);
  }
  return ranges.sort().at(-1) || '';
}

export function isEvergreenBenefitCandidate(candidate = {}, { today = todayISO() } = {}) {
  const benefitKind = classifyConfirmedBenefitEvent(candidate);
  if (!['season_pass', 'discount_event'].includes(benefitKind || '')) return false;
  const sd = candidate.structured_data || {};
  const text = [
    sd.title,
    candidate.extracted_text,
    sd.description,
    sd.price,
  ].filter(Boolean).join(' ').normalize('NFKC');
  if (/(?:판매|신청|구매|운영|발급)\s*(?:종료|마감|중단)|(?:정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b)[^.!?\n]{0,24}(?:종료|마감|중단|폐지|품절|sold\s*out|closed|ended)/i.test(text)) {
    return false;
  }
  const validityEndDate = extractBenefitValidityEndDate(text, { today });
  if (validityEndDate && validityEndDate < today) return false;
  // 여기서는 상품 성격만 분류한다. 실제 수집 가능 여부는 공통 미래 날짜 정책에서 별도로 판정한다.
  if (benefitKind === 'season_pass') return true;
  if (benefitKind === 'discount_event') {
    return /상시\s*(?:할인|특가|혜택|적용)|연중\s*(?:할인|혜택)|언제든\s*(?:할인|적용)|(?:현재\s*)?(?:할인|프로모션)\s*(?:중|적용\s*중|진행\s*중)|(?:회원|정기권)\s*상시\s*할인/i.test(text);
  }
  return false;
}

export const isEvergreenSeasonPassCandidate = isEvergreenBenefitCandidate;

export const siteGenresByCategory = {
  social: ['소셜', '졸공'],
  event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
  class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
};

const blockedKeywordRules = [
  ['엠티/MT', /엠\s*티|(?:^|[^A-Za-z])m\.?\s*t(?:[^A-Za-z]|$)/i],
];

const regionSuffixRe = /\s*[()（）]\s*(신촌|합정|선릉|사당|강남|강북|홍대|상수|망원|연남|서교|마포|신림|봉천|건대|성수|이태원|서울|부산|대구|인천|대전|광주|수원|분당|판교)\s*[()（）]\s*$/i;
const parenContentRe = /\s*[()（）][^()（）]{1,12}[()（）]\s*$/;

const canonicalVenueAliases = [
  [/^경성홀(?:신촌)?$/i, '경성홀'],
  [/^(?:해피홀|happyhall)(?:신촌)?$/i, '해피홀'],
  [/^(?:소셜클럽|쏘셜클럽|sosyalclub)(?:합정)?$/i, '소셜클럽'],
  [/^스윙타임(?:바|빠)?(?:선릉)?$/i, '스윙타임'],
  [/^인더무드(?:신림)?$/i, '인더무드신림'],
  [/^봉천살롱(?:봉천)?$/i, '봉천살롱'],
  [/^(?:사보이볼룸|사보이홀|사보이)(?:사당)?$/i, '사보이볼룸'],
];

function compactVenueText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\-_.,·]/g, '');
}

function stripTrailingQualifier(value = '') {
  return String(value || '')
    .trim()
    .replace(regionSuffixRe, '')
    .replace(parenContentRe, '')
    .trim();
}

export function toMapSafeVenueName(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const stripped = stripTrailingQualifier(raw) || raw;
  const compact = compactVenueText(stripped);
  const matched = canonicalVenueAliases.find(([pattern]) => pattern.test(compact));
  return matched?.[1] || stripped;
}

function regexWithoutState(pattern) {
  if (!(pattern instanceof RegExp)) return null;
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}

function venueAliasMatchesDj(pattern, djs = []) {
  const matcher = regexWithoutState(pattern);
  if (!matcher) return false;
  return djs.some((dj) => {
    const value = String(dj || '').trim();
    const match = value.match(matcher);
    return Boolean(match && match.index === 0 && match[0].length === value.length);
  });
}

function hasExplicitVenueAliasContext(text = '', matchedAlias = '') {
  const alias = String(matchedAlias || '').trim();
  if (!alias) return false;
  const escapedAlias = escapeRegex(alias);
  return [
    new RegExp(`(?:장소|venue|location|개최지|공간)\\s*[:：-]?\\s*${escapedAlias}`, 'i'),
    new RegExp(`${escapedAlias}\\s*(?:스윙\\s*)?(?:홀|바|빠|bar|ballroom|salon)`, 'i'),
  ].some((pattern) => pattern.test(String(text || '')));
}

const variableVenueEvidenceRe = /(?:장소|강습장|수업장)\s*[:：-]?\s*(?:강습|수업|클래스|프로그램)?\s*(?:별|마다)\s*(?:상이|다름|별도)|(?:강습|수업|클래스|프로그램)\s*(?:별|마다)\s*(?:장소|강습장|수업장)\s*(?:상이|다름|별도)|장소\s*(?:추후|별도)\s*(?:공지|안내)/i;

function explicitVenueNameFromText(text = '') {
  const value = String(text || '').normalize('NFKC');
  const patterns = [
    /(?:^|[\n\r])\s*(?:📍\s*)?(?:장소|강습장|수업장|개최지|venue|location)\s*[:：-]?\s*([^\n\r]{2,100})/gim,
    /(?:^|[\n\r])\s*📍\s*([^\n\r]{2,100})/gm,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const venue = String(match[1] || '')
        .replace(/\s*(?:📅|⏰|📢|💰|🎧|☎|문의|신청|입장료|참가비|시간)[\s\S]*$/i, '')
        .replace(/\s+#\S[\s\S]*$/, '')
        .replace(/\s+(?:에서\s*(?:만나요|진행(?:됩니다|합니다)?|열립니다)|진행(?:됩니다|합니다)?)\s*[.!]?$/i, '')
        .replace(/^[\s:：\-–—|]+|[\s,.;:：\-–—|]+$/g, '')
        .trim();
      if (!venue || venue.length > 64) continue;
      if (/https?:\/\/|www\.|@|(?:추후|별도)\s*(?:공지|안내)|장소\s*미정|미정|강습별\s*상이|수업별\s*상이|DM\s*문의|프로필\s*링크/i.test(venue)) continue;
      return toMapSafeVenueName(venue);
    }
  }
  return '';
}

export function resolveSourceVenueEvidence({
  text = '',
  sourceVenue = '',
  mappedVenue = '',
  aliases = [],
  djs = [],
} = {}) {
  const value = String(text || '');
  const configuredVenue = String(sourceVenue || mappedVenue || '').trim();
  const matches = aliases
    .map(([pattern, venue]) => {
      const matcher = regexWithoutState(pattern);
      const match = matcher ? value.match(matcher) : null;
      return match ? { pattern, venue, matchedAlias: match[0] } : null;
    })
    .filter(Boolean);
  const matched = matches.find((item) => {
    const aliasIsDjOnly = venueAliasMatchesDj(item.pattern, djs)
      && compactVenueText(configuredVenue) !== compactVenueText(item.venue)
      && !hasExplicitVenueAliasContext(value, item.matchedAlias);
    return !aliasIsDjOnly;
  });

  if (matched) {
    return { venue: matched.venue, provenance: 'source_text' };
  }

  if (variableVenueEvidenceRe.test(value)) {
    return { venue: '', provenance: 'explicit_variable' };
  }
  const explicitVenue = explicitVenueNameFromText(value);
  if (explicitVenue) return { venue: explicitVenue, provenance: 'source_text' };
  if (sourceVenue) return { venue: sourceVenue, provenance: 'source_registry' };
  if (mappedVenue) return { venue: mappedVenue, provenance: 'source_registry' };
  return { venue: '', provenance: 'unresolved' };
}

function normalizeCandidateVenueStructuredData(structuredData = {}) {
  const location = toMapSafeVenueName(structuredData.location || structuredData.venue_name || '');
  const venueName = toMapSafeVenueName(structuredData.venue_name || location);
  return {
    ...structuredData,
    ...(location ? { location } : {}),
    ...(venueName ? { venue_name: venueName } : {}),
  };
}

export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function publicationDateKey(value = '') {
  const raw = String(value || '').trim();
  const explicit = raw.match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (explicit) return isoDateForIngestion(explicit[1], explicit[2], explicit[3]);
  const short = raw.match(/(?:^|\D)(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\D|$)/);
  if (short) return isoDateForIngestion(2000 + Number(short[1]), short[2], short[3]);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

/**
 * Yearless dates must be interpreted near the source publication date, never
 * rolled forward relative to the day the collector happens to revisit a post.
 */
export function alignYearlessDatesToPublication(dates = [], text = '', publishedAt = '') {
  const publicationDate = publicationDateKey(publishedAt);
  if (!publicationDate) return dates;
  const sourceText = String(text || '').normalize('NFKC');
  const publicationMs = Date.parse(`${publicationDate}T00:00:00+09:00`);
  const publicationYear = Number(publicationDate.slice(0, 4));

  return dates.map((date) => {
    const [candidate, year, month, day] = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (!month || !day) return date;
    const explicitCandidatePattern = new RegExp(
      `${year}\\s*[.\\-/년]\\s*0?${Number(month)}\\s*[.\\-/월]\\s*0?${Number(day)}(?:\\s*일)?(?:\\D|$)`,
    );
    if (explicitCandidatePattern.test(sourceText)) return candidate;
    return [publicationYear - 1, publicationYear, publicationYear + 1]
      .map((year) => isoDateForIngestion(year, month, day))
      .sort((left, right) => (
        Math.abs(Date.parse(`${left}T00:00:00+09:00`) - publicationMs)
        - Math.abs(Date.parse(`${right}T00:00:00+09:00`) - publicationMs)
      ))[0];
  });
}

export function isCollectableDate(date = '', {
  today = todayISO(),
} = {}) {
  return Boolean(date) && date >= today;
}

export function stripNaverCafeMemberPrefix(value = '') {
  return String(value || '')
    .replace(/^\s*\d+\s*F\s+[A-Za-z0-9가-힣._-]{1,20}\s+/i, '')
    .trim();
}

export function stripRepeatedDjContext(value = '') {
  return String(value || '')
    .replace(
      /^(?:사보이\s*지기|운영진|관리자|매니저)\s*[★☆✦✧♥♡❤💙💛💜]+\s*([A-Za-z0-9가-힣._&+\-/]{1,20})\s*[★☆✦✧♥♡❤💙💛💜]+\s*(?:님)?(?:\s.*)?$/i,
      '$1',
    )
    .replace(
      /^([A-Za-z0-9가-힣._&+\-/]{1,20})\s+스윙타운\s+(?:D\s*J|디제이)\s+\1(?:\s.*)?$/i,
      '$1',
    )
    .replace(/\s+(?:balboa|ballba|lindy\s*hop|swing|slow)\s+social\b.*$/i, '')
    .trim();
}

export function normalizeSourceUrl(url = '') {
  try {
    const parsed = new URL(url);
    const naverArticleMatch = parsed.hostname === 'cafe.naver.com'
      ? parsed.pathname.match(/\/cafes\/(\d+)\/articles\/(\d+)/)
      : null;
    if (naverArticleMatch) {
      parsed.pathname = `/f-e/cafes/${naverArticleMatch[1]}/articles/${naverArticleMatch[2]}`;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    }
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

export function keepFirstEventDateOnly(values = [], dateSelector = (value) => value) {
  return [...(Array.isArray(values) ? values : [])]
    .filter((value) => String(dateSelector(value) || '').slice(0, 10))
    .sort((a, b) => String(dateSelector(a) || '').slice(0, 10).localeCompare(String(dateSelector(b) || '').slice(0, 10)))
    .slice(0, 1);
}

export function mergeSocialScheduleFallbacks(primaryItems = [], fallbackItems = []) {
  const primary = Array.isArray(primaryItems) ? primaryItems : [];
  const fallback = Array.isArray(fallbackItems) ? fallbackItems : [];
  const coveredDates = new Set(primary.map((item) => String(item?.date || '').slice(0, 10)).filter(Boolean));
  const seen = new Set(primary.map((item) => [
    String(item?.date || '').slice(0, 10),
    String(item?.day || ''),
    Array.isArray(item?.djs) ? item.djs.join(',') : '',
  ].join('|')));

  return [
    ...primary,
    ...fallback.filter((item) => {
      const date = String(item?.date || '').slice(0, 10);
      if (!date || coveredDates.has(date)) return false;
      const key = [date, String(item?.day || ''), Array.isArray(item?.djs) ? item.djs.join(',') : ''].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  ];
}

function isoDateForIngestion(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function weekdayLabelForDate(date = '') {
  const index = new Date(`${date}T00:00:00+09:00`).getDay();
  return ['일', '월', '화', '수', '목', '금', '토'][index] || '';
}

function explicitWeekdayForCandidateDate(text = '', date = '') {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const month = String(Number(match[2]));
  const day = String(Number(match[3]));
  const escapedMonth = month.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedDay = day.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedMonth}\\s*월\\s*${escapedDay}\\s*일?\\s*[()（）\\[\\]\\s,./-]{1,8}([월화수목금토일])(?:요일|요)?`),
    new RegExp(`${escapedMonth}\\s*[./-]\\s*${escapedDay}\\s*[()（）\\[\\]\\s,./-]{1,8}([월화수목금토일])(?:요일|요)?`),
  ];
  return patterns.map((pattern) => String(text).match(pattern)?.[1] || '').find(Boolean) || '';
}

/**
 * Split one social notice into independent dated sessions when the title carries
 * a compact date list (for example "7월 25,26일") and the body has weekday
 * sections with different operating details.
 */
export function extractIndependentSocialDateSections({
  title = '',
  text = '',
  today = todayISO(),
} = {}) {
  const normalizedTitle = String(title || '').normalize('NFKC');
  const normalizedText = String(text || '').normalize('NFKC');
  const titleMatch = normalizedTitle.match(/(\d{1,2})\s*월\s*((?:\d{1,2}\s*(?:일)?\s*(?:[,，·ㆍ/&]|및|와|과)?\s*){2,8})/);
  if (!titleMatch) return [];

  const month = Number(titleMatch[1]);
  const days = [...titleMatch[2].matchAll(/\d{1,2}/g)]
    .map((match) => Number(match[0]))
    .filter((day) => day >= 1 && day <= 31);
  if (month < 1 || month > 12 || days.length < 2) return [];

  const todayYear = Number(String(today).slice(0, 4));
  const todayMonth = Number(String(today).slice(5, 7));
  const year = month + 1 < todayMonth ? todayYear + 1 : todayYear;
  const dates = [...new Set(days.map((day) => isoDateForIngestion(year, month, day)))];

  const sectionPattern = /(?:^|[\n\r]\s*|(?:^|\s)[-•▪■]\s*)((?:월|화|수|목|금|토|일)요일)\s*[:：-]?\s*([\s\S]*?)(?=(?:[\n\r]\s*|(?:^|\s)[-•▪■]\s*)((?:월|화|수|목|금|토|일)요일)\s*[:：-]?|$)/g;
  const sections = [...normalizedText.matchAll(sectionPattern)].map((match) => ({
    day: match[1].slice(0, 1),
    dayLabel: match[1],
    segment: String(match[2] || '').trim(),
  }));
  if (sections.length < 2) return [];

  const result = [];
  const usedDates = new Set();
  for (const section of sections) {
    const matchingDate = dates.find((date) => !usedDates.has(date) && weekdayLabelForDate(date) === section.day);
    if (!matchingDate) continue;
    usedDates.add(matchingDate);
    if (matchingDate < today) continue;
    result.push({
      date: matchingDate,
      day: section.day,
      dayLabel: section.dayLabel,
      titleEvidence: normalizedTitle.trim(),
      normalizedDateEvidence: `${Number(matchingDate.slice(0, 4))}년 ${Number(matchingDate.slice(5, 7))}월 ${Number(matchingDate.slice(8, 10))}일`,
      segment: section.segment,
    });
  }
  return result.length >= 1 && usedDates.size >= 2 ? result : [];
}

/**
 * Keep multi-image source attachments in their authored order. Event notices
 * commonly pair the first dated section with the first attachment, so sorting
 * by pixel area can silently swap posters between dates.
 */
export function selectSourceOrderedPosterUrls(images = [], limit = 3) {
  const seen = new Set();
  const max = Math.max(0, Number(limit || 0));
  return (Array.isArray(images) ? images : [])
    .filter((image) => {
      const src = String(image?.src || '');
      const alt = String(image?.alt || '');
      return src
        && Number(image?.w || 0) >= 300
        && Number(image?.h || 0) >= 300
        && !/profile|avatar|emoji|emoticon|static\/cafe|btn_|logo/i.test(`${src} ${alt}`);
    })
    .map((image) => String(image.src))
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .slice(0, max);
}

/**
 * Extract date-scoped DJ sections from weekly social notices. This deliberately
 * ignores time expressions and leaves DJ-name cleanup to the source collector.
 */
export function extractDatedDjSections({
  text = '',
  today = todayISO(),
} = {}) {
  const raw = String(text || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/(?<![A-Za-z0-9가-힣])(?:DJ|디제이)/i.test(raw)) return [];

  const todayYear = Number(String(today).slice(0, 4));
  const todayMonth = Number(String(today).slice(5, 7));
  const sections = [];
  const pattern = /(?:^|[\s[(（])(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2})\s*(?:일)?\s*(?:\(\s*([월화수목금토일])\s*\))?\s*([\s\S]{0,900}?)(?=(?:[\s[(（]\d{1,2}\s*(?:[./]|월)\s*\d{1,2})|$)/gi;

  for (const match of raw.matchAll(pattern)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    const year = month + 1 < todayMonth ? todayYear + 1 : todayYear;
    const date = isoDateForIngestion(year, month, day);
    if (!isCollectableDate(date, { today })) continue;

    const segment = String(match[4] || '').trim();
    if (!/(?<![A-Za-z0-9가-힣])(?:DJ|디제이)/i.test(segment)) continue;
    const dateLabel = String(match[0] || '')
      .slice(0, Math.max(0, String(match[0] || '').length - String(match[4] || '').length))
      .trim();
    sections.push({
      date,
      day: match[3] || weekdayLabelForDate(date),
      dateLabel,
      segment,
    });
  }

  return sections;
}

const explicitClosureActionPattern = /(?:휴관|휴무)(?!일)\s*(?:합니다|해요|입니다|예정(?:입니다)?|확정(?:입니다)?|함)|휴업\s*(?:합니다|해요|입니다|예정(?:입니다)?|함)?|쉬어\s*갑니다|쉽니다|쉬어요|(?:소셜|행사|운영)[^.\n]{0,30}(?:없습니다|없어요|취소(?:합니다|됐습니다|되었습니다|예정)?|중단(?:합니다|됩니다)?)|(?:소셜|행사|운영)\s*취소/i;
const explicitClosureHeadingPattern = /(?:휴관|휴무|휴업)\s*(?:안내|공지)/i;

function validCalendarDate(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day;
}

function resolveExplicitClosureDate({ year, month, day, today, publishedAt }) {
  if (!validCalendarDate(Number(year || 0), month, day) && year) return '';
  if (year) return isoDateForIngestion(year, month, day);

  const referenceDate = publicationDateKey(publishedAt) || today;
  const referenceYear = Number(referenceDate.slice(0, 4));
  const referenceMs = Date.parse(`${referenceDate}T00:00:00+09:00`);
  return [referenceYear - 1, referenceYear, referenceYear + 1]
    .filter((candidateYear) => validCalendarDate(candidateYear, month, day))
    .map((candidateYear) => isoDateForIngestion(candidateYear, month, day))
    .sort((left, right) => (
      Math.abs(Date.parse(`${left}T00:00:00+09:00`) - referenceMs)
      - Math.abs(Date.parse(`${right}T00:00:00+09:00`) - referenceMs)
    ))[0] || '';
}

function closureDateInsideWindow(date, {
  today,
  backtest,
  lookbackDays,
  maxFutureDays,
}) {
  const dateMs = Date.parse(`${date}T00:00:00+09:00`);
  const todayMs = Date.parse(`${today}T00:00:00+09:00`);
  if (!Number.isFinite(dateMs) || !Number.isFinite(todayMs)) return false;
  if (backtest) {
    return dateMs <= todayMs && dateMs >= todayMs - (lookbackDays * 86_400_000);
  }
  return dateMs >= todayMs && dateMs <= todayMs + (maxFutureDays * 86_400_000);
}

/**
 * Extract date-scoped closures from a mixed schedule notice. A closure heading
 * before the next date must not turn the preceding active social into a
 * closure. Date ranges inherit the closure state of either range endpoint.
 */
export function extractExplicitClosureDates({
  text = '',
  today = todayISO(),
  publishedAt = '',
  backtest = false,
  lookbackDays = 180,
  maxFutureDays = 180,
} = {}) {
  const raw = String(text || '').normalize('NFKC');
  const anchors = [];
  const datePattern = /(?:(20\d{2})\s*(?:[.\-/]|년)\s*)?(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2})\s*(?:일)?/g;
  for (const match of raw.matchAll(datePattern)) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = resolveExplicitClosureDate({
      year: match[1] ? Number(match[1]) : 0,
      month,
      day,
      today,
      publishedAt,
    });
    if (!date || !closureDateInsideWindow(date, {
      today,
      backtest,
      lookbackDays,
      maxFutureDays,
    })) continue;
    anchors.push({ date, start: match.index, end: match.index + match[0].length });
  }
  if (!anchors.length) return [];

  const closed = anchors.map((anchor, index) => {
    const next = anchors[index + 1];
    const section = raw.slice(anchor.start, next?.start ?? raw.length);
    if (explicitClosureActionPattern.test(section)) return true;

    const lineStart = raw.lastIndexOf('\n', anchor.start - 1) + 1;
    const localDateHeading = section.slice(0, 80);
    const headingMatch = localDateHeading.match(explicitClosureHeadingPattern);
    if (headingMatch) {
      const beforeHeading = localDateHeading.slice(0, headingMatch.index);
      if (!/(?:DJ|디제이|정상\s*(?:진행|운영)|오픈|open)/i.test(beforeHeading)) return true;
    }

    const previousLineEnd = Math.max(0, lineStart - 1);
    const previousLineStart = raw.lastIndexOf('\n', previousLineEnd - 1) + 1;
    const previousLine = raw.slice(previousLineStart, previousLineEnd).trim();
    return /^(?:📌|🚨)?\s*(?:휴관|휴무|휴업)\s*(?:안내|공지)?\s*$/i.test(previousLine);
  });

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const bridge = raw.slice(anchors[index].end, anchors[index + 1].start);
    const isRange = /(?:~|〜|–|—|-|부터)/.test(bridge)
      && !/\n/.test(bridge)
      && /^[\s()[\]（）월화수목금토일요일.~〜–—-]*$/.test(bridge);
    if (isRange && (closed[index] || closed[index + 1])) {
      closed[index] = true;
      closed[index + 1] = true;
    }
  }

  const dates = new Set(anchors.filter((_, index) => closed[index]).map((anchor) => anchor.date));
  for (let index = 0; index < anchors.length - 1; index += 1) {
    if (!closed[index] || !closed[index + 1]) continue;
    const bridge = raw.slice(anchors[index].end, anchors[index + 1].start);
    const isRange = /(?:~|〜|–|—|-|부터)/.test(bridge)
      && !/\n/.test(bridge)
      && /^[\s()[\]（）월화수목금토일요일.~〜–—-]*$/.test(bridge);
    if (!isRange) continue;
    const startMs = Date.parse(`${anchors[index].date}T00:00:00+09:00`);
    const endMs = Date.parse(`${anchors[index + 1].date}T00:00:00+09:00`);
    const rangeDays = Math.round((endMs - startMs) / 86_400_000);
    if (rangeDays < 1 || rangeDays > 31) continue;
    for (let offset = 1; offset < rangeDays; offset += 1) {
      dates.add(todayISO(new Date(startMs + (offset * 86_400_000))));
    }
  }

  return [...dates].sort();
}

export function isHighConfidenceDatedSocialSchedule(items = []) {
  const validItems = (Array.isArray(items) ? items : []).filter((item) => (
    /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || ''))
    && Array.isArray(item?.djs)
    && item.djs.length > 0
  ));
  return validItems.length >= 1
    && new Set(validItems.map((item) => item.date)).size === validItems.length
    && validItems.length === items.length;
}

function parseNeoWeeklySchedule({
  text = '',
  today = todayISO(),
} = {}) {
  const raw = String(text || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/위클리\s*네오/i.test(raw) || !/(?:금|일)\s*햅/i.test(raw)) {
    return { items: [], closureDates: [] };
  }

  const todayYear = Number(String(today).slice(0, 4));
  const todayMonth = Number(String(today).slice(5, 7));
  const dates = [];
  const closureDates = new Set();
  const dateSectionPattern = /(?:^|[\s[(（])(\d{1,2})\s*(?:[./]|월)\s*[\[【]?\s*(\d{1,2})\s*(?:일)?\s*(?:\(\s*([월화수목금토일])\s*\))?\s*([\s\S]{0,900}?)(?=(?:[\s[(（]\d{1,2}\s*(?:[./]|월)\s*[\[【]?\s*\d{1,2})|$)/gi;

  for (const match of raw.matchAll(dateSectionPattern)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = month + 1 < todayMonth ? todayYear + 1 : todayYear;
    const date = isoDateForIngestion(year, month, day);
    if (!isCollectableDate(date, { today })) continue;
    const dateLabel = String(match[0] || '')
      .slice(0, Math.max(0, String(match[0] || '').length - String(match[4] || '').length))
      .trim();
    dates.push({
      date,
      day: match[3] || weekdayLabelForDate(date),
      dateLabel,
      normalizedDateEvidence: `${year}년 ${month}월 ${day}일`,
    });
    if (/(?:강습|소셜|운영)[^.\n]{0,30}(?:쉬어\s*갑니다|쉽니다|쉬어요|휴무|없습니다|없어요|취소)/i.test(match[4] || '')) {
      closureDates.add(date);
    }
  }

  const uniqueDates = [...new Map(dates.map((item) => [item.date, item])).values()];
  const items = [];
  for (const match of raw.matchAll(/(?:🎧\s*)?([금일])\s*햅\s*(?:D\s*J|디제이)\s*[:：]?\s*([A-Za-z0-9가-힣._&+\-/]{1,28})/gi)) {
    const day = match[1];
    const dateItem = uniqueDates.find((item) => item.day === day && !closureDates.has(item.date));
    if (!dateItem || items.some((item) => item.date === dateItem.date)) continue;
    items.push({
      ...dateItem,
      djs: [match[2]],
      djLabel: String(match[0] || '').trim(),
      venueEvidence: raw.includes('해피홀') ? '해피홀' : '',
    });
  }

  return {
    items: items.sort((a, b) => a.date.localeCompare(b.date)),
    closureDates: [...closureDates].sort(),
  };
}

export function extractNeoWeeklySocialSchedule(options = {}) {
  return parseNeoWeeklySchedule(options).items;
}

export function extractNeoWeeklyClosureDates(options = {}) {
  return parseNeoWeeklySchedule(options).closureDates;
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

export function extractInstagramCaptionHeadline(value = '') {
  const raw = String(value || '').normalize('NFKC');
  const match = raw.match(/(?:on\s+Instagram|Instagram(?:의)?\s+[^:：]{1,120})\s*[:：]\s*["“”']?\s*([\s\S]{6,240})/i);
  if (!match?.[1]) return '';
  return String(match[1])
    .split(/\n| {2,}/)
    .map((line) => line.replace(/^["“”']+|["“”']+$/g, '').replace(/\s+/g, ' ').trim())
    .find((line) => line.length >= 6 && line.length <= 100 && !/^\d+\s*(?:likes?|comments?)/i.test(line))
    || '';
}

export function isInstagramCaptionClassHeadline(value = '') {
  return /(?:워크샵|워크숍|특강|workshop|클래스|class|강습|수업|레슨)/i.test(
    extractInstagramCaptionHeadline(value),
  );
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

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dateVariants(date = '') {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const month = String(Number(match[2]));
  const day = String(Number(match[3]));
  const month2 = match[2];
  const day2 = match[3];
  return [
    `${month}/${day}`,
    `${month2}/${day2}`,
    `${month}.${day}`,
    `${month2}.${day2}`,
    `${month}월 ${day}일`,
    `${month2}월 ${day2}일`,
    `${month}월${day}일`,
    `${month2}월${day2}일`,
  ];
}

function contextsAroundDate(text = '', date = '') {
  const value = String(text || '');
  const contexts = [];
  for (const variant of dateVariants(date)) {
    const pattern = new RegExp(escapeRegex(variant), 'gi');
    let match;
    while ((match = pattern.exec(value))) {
      contexts.push(value.slice(Math.max(0, match.index - 45), Math.min(value.length, match.index + variant.length + 45)));
    }
  }
  return contexts;
}

function contextContainsTargetDatePattern(context = '', date = '', patternBuilder) {
  return dateVariants(date).some((variant) => patternBuilder(escapeRegex(variant)).test(context));
}

function hasStrongDeadlineDateContext(context = '', date = '') {
  return contextContainsTargetDatePattern(context, date, (dateToken) => new RegExp(
    `(?:신청|접수|등록|입금|결제|납부)(?:\\s*(?:방법|기간|일정|일시|오픈|시작|가능|마감))?\\s*[:：-]?\\s*${dateToken}(?:\\s*\\([^)]{0,12}\\))?(?:\\s*\\d{1,2}\\s*시)?(?:\\s*(?:부터|까지|마감|오픈))?`,
    'i',
  )) || contextContainsTargetDatePattern(context, date, (dateToken) => new RegExp(
    `${dateToken}(?:\\s*\\([^)]{0,12}\\))?[^.!?\\n]{0,24}(?:신청|접수|등록|입금|결제|납부)(?:\\s*(?:시작|오픈|가능|마감|까지|부터))?`,
    'i',
  ));
}

function hasStrongEventDateContext(context = '', date = '') {
  return contextContainsTargetDatePattern(context, date, (dateToken) => new RegExp(
    `(?:행사\\s*일|이벤트\\s*일|일시|개강\\s*일?|시작\\s*일|첫\\s*수업|첫날|수업\\s*일|강습\\s*일|워크숍\\s*일|워크샵\\s*일|소셜(?:\\s*(?:일|일정|날짜))?|social(?:\\s*(?:date|schedule))?|파티(?:\\s*(?:일|일정|날짜))?|party(?:\\s*(?:date|schedule))?|일정|기간)\\s*[:：-]?\\s*(?:20\\d{2}\\s*[.\\-/년]\\s*)?${dateToken}`,
    'i',
  )) || contextContainsTargetDatePattern(context, date, (dateToken) => new RegExp(
    `${dateToken}[^.!?\\n]{0,24}(?:개강|강습\\s*시작|수업\\s*시작|행사\\s*진행|소셜\\s*진행|파티\\s*진행|열립니다)`,
    'i',
  ));
}

export function isDeadlineOnlyEventDate(text = '', date = '', activity = '') {
  if (!date) return false;
  const contexts = contextsAroundDate(text, date);
  if (!contexts.length) return false;
  const deadlineRe = /마감|얼리\s*버드|얼리버드|입금|결제|할인|등록|신청|접수|납부|deadline|early\s*bird|payment/i;
  const eventDateRe = /일시|날짜|시작|개강|첫\s*수업|(강습|수업|워크샵|워크숍|원\s*데이|원데이|체험\s*클래스|오픈\s*클래스)\s*(시작|개강|진행|일시|날짜)|소셜|파티|행사|열립니다|진행|start|starts|class|lesson|workshop|one\s*day|oneday|open\s*class|social|party/i;
  const hasStrongDeadlineContext = contexts.some((context) => hasStrongDeadlineDateContext(context, date));
  const hasStrongEventContext = contexts.some((context) => hasStrongEventDateContext(context, date));
  if (hasStrongDeadlineContext && !hasStrongEventContext) {
    return ['class', 'event', 'recruit', 'social'].includes(activity);
  }
  const hasDeadlineContext = contexts.some((context) => deadlineRe.test(context));
  const hasEventContext = contexts.some((context) => eventDateRe.test(context));
  return hasDeadlineContext && !hasEventContext && ['class', 'event', 'recruit', 'social'].includes(activity);
}

export function filterDeadlineOnlyEventDates(dates = [], text = '', activity = '') {
  return dates.filter((date) => !isDeadlineOnlyEventDate(text, date, activity));
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

function titleOf(candidate) {
  return String(candidate?.structured_data?.title || candidate?.title || '').trim();
}

function sourceNameCandidates(candidate, source) {
  const sd = candidate.structured_data || {};
  return [candidate.keyword, source?.name, sd.location, sd.venue_name]
    .filter(Boolean)
    .map((value) => String(value).trim());
}

function looksLikeGenericSourceFallbackTitle(candidate, source, activity) {
  const title = titleOf(candidate);
  if (!title) return false;
  const normalizedTitle = normalizeText(title);
  const eventType = String(candidate?.structured_data?.event_type || '').trim();
  const suffixes = [eventType, '강습', '행사', '소셜', '모집']
    .filter(Boolean)
    .map((value) => normalizeText(value));
  const names = sourceNameCandidates(candidate, source).map((value) => normalizeText(value)).filter(Boolean);
  const isGeneric = names.some((name) => (
    suffixes.some((suffix) => normalizedTitle === `${name}${suffix}`)
    || (
      normalizedTitle.startsWith(name)
      && /^(?:월|화|수|목|금|토|일)(?:요)?소셜$/.test(normalizedTitle.slice(name.length))
    )
  ));
  if (!isGeneric) return false;

  const text = textOf(candidate);
  if (activity === 'social' && /\bdj\b|디제이|소셜|social/i.test(text)) return false;
  return true;
}

function looksLikeLowQualityAutoTitle(candidate) {
  const title = titleOf(candidate)
    .replace(/[“”"']+$/g, '')
    .trim();
  if (!title) return true;
  if (/[，,]\s*$/.test(title)) return true;
  if (/(?:은|는|을|를|며|고|에서|까지)\s*$/.test(title)) return true;
  if (/^(?:무료|유료)?\s*라인\s*강습(?:은|는|이|을|를)?\b/i.test(title)) return true;
  if (/^(?:잊지\s*말고|일찍\s*오셔서|아직|여러분|문의|연락처|신청은|프로필\s*링크)/i.test(title)) return true;
  if (/^Instagram(?:의)?\s+.+님(?:의\s*사진과\s*동영상)?$/i.test(title)) return true;
  if (/^(?:[^\p{L}\p{N}가-힣]*)(?:강습|수업|소셜\s*댄스)\s*(?:안내|시간|일정)(?:[^\p{L}\p{N}가-힣]*)$/iu.test(title)) return true;
  if (/^(?:스위티\s*)?공지(?:사항)?$/i.test(title)) return true;
  if (/^[^\p{L}\p{N}가-힣]*(?:파티|행사|이벤트|party|event)[^\p{L}\p{N}가-힣]*$/iu.test(title)) return true;
  if (/^[^\p{L}\p{N}가-힣]*(?:강습\s*)?(?:기간|일정|링크)\s*[:：]/iu.test(title)) return true;
  if (/^[^\p{L}\p{N}가-힣]*일정\s*[:：].*(?:매주|주간|주\s*[회차]|~|～)/iu.test(title)) return true;
  if (/^(?:바로\s*)?이어지는.{0,40}(?:소셜|행사)/i.test(title)) return true;
  if (/(?:만나요|확인해\s*주세요|부탁드립니다|감사합니다|즐겨?\s*보세요|활용해\s*보세요)\s*[.!。]*$/i.test(title)) return true;
  return false;
}

function hasConcreteSocialOperatingEvidence(candidate) {
  const sd = candidate.structured_data || {};
  const djs = Array.isArray(sd.djs) ? sd.djs.map((value) => String(value || '').trim()).filter(Boolean) : [];
  if (djs.length > 0) return true;
  if (isAiGroundedDjlessSocial(candidate)) return true;

  const text = textOf(candidate);
  return /(?:입장료|참가비|커버\s*차지|커버비|도어\s*오픈|오픈\s*시간|운영\s*시간|\d{1,2}\s*[:시]\s*\d{0,2}\s*(?:분)?\s*(?:부터|~|～|-)|\d[\d,]*\s*원|라이브\s*(?:밴드|연주)|밀롱가|프랙티카)/i.test(text);
}

function isVerifiedSourceDetailUrl(sourceUrl = '', source = {}) {
  try {
    const parsed = new URL(sourceUrl);
    const path = parsed.pathname;
    if (source.type === 'instagram') {
      return /\/(?:[^/]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+\/?$/i.test(path);
    }
    if (source.type === 'naver_cafe') {
      return /\/articles\/\d+\/?$/i.test(path)
        || /ArticleRead/i.test(path)
        || parsed.searchParams.has('articleid');
    }
    if (source.type === 'daum_cafe') return /\/[^/]+\/[A-Za-z0-9]+\/\d+\/?$/i.test(path);
    if (source.type === 'facebook') return /\/(?:posts\/|permalink\.php|story\.php)/i.test(`${path}${parsed.search}`);

    const configuredUrl = normalizeSourceUrl(source.url || '');
    return Boolean(configuredUrl && normalizeSourceUrl(sourceUrl) !== configuredUrl);
  } catch {
    return false;
  }
}

function isImageOptionalNamedDjSocial(candidate, { source, date, today }) {
  const sd = candidate.structured_data || {};
  const venue = String(sd.venue_name || sd.location || '').trim();
  const djs = Array.isArray(sd.djs) ? sd.djs.map((value) => String(value || '').trim()).filter(Boolean) : [];
  return String(sd.activity_type || inferCandidateTaxonomy(candidate).activity_type || '').toLowerCase() === 'social'
    && Boolean(source)
    && source.discoveryOnly !== true
    && source.type !== 'benefit_search'
    && Boolean(venue)
    && djs.length > 0
    && !hasMalformedDj(candidate)
    && isCollectableDate(date, { today })
    && isVerifiedSourceDetailUrl(candidate.source_url, source);
}

function isAiGroundedDjlessSocial(candidate) {
  const sd = candidate?.structured_data || {};
  return sd.activity_type === 'social'
    && sd.evidence_scope === 'ai_grounded_social'
    && sd.ai_missing_dj_verified === true
    && Boolean(candidate?.poster_url || candidate?.imageData);
}

const naverCafeChromeRe = /말머리|공지사항|필독|작성자|조회수?|댓글|목록|URL\s*복사|인기\s*멤버|새싹\s*멤버|멤버\s*등급|부\s*매니저|매니저|스탭|운영진|1\s*:\s*1\s*채팅|채팅|좋아요|신고|게시글|멤버\s*리스트/i;

function looksLikeNaverCafeChromeTitle(candidate) {
  if (!/cafe\.naver\.com/i.test(candidate?.source_url || '')) return false;
  const title = titleOf(candidate);
  if (!title) return false;
  return naverCafeChromeRe.test(title);
}

function hasNaverCafeChromeDj(candidate) {
  if (!/cafe\.naver\.com/i.test(candidate?.source_url || '')) return false;
  const djs = candidate?.structured_data?.djs;
  if (!Array.isArray(djs)) return false;
  return djs.some((dj) => naverCafeChromeRe.test(String(dj || '')));
}

function hasMalformedDj(candidate) {
  const djs = candidate?.structured_data?.djs;
  if (!Array.isArray(djs)) return false;
  return djs.some((value) => (
    /[\uD800-\uDFFF]|^(?:는|은|가|이)$|20\d{2}[.\-/년]|(?:\d{1,2}[.\-/월]){2}|소셜로\s*진행|강습|수업|모집|매니저|멤버|조회|채팅|application\s*link|registration\s*link|신청\s*링크|입금\s*계좌/i.test(String(value).trim())
    || String(value).trim().length > 28
  ));
}

function hasMultipleExplicitCalendarDates(text = '') {
  const dates = new Set();
  for (const match of String(text || '').matchAll(/(?<!\d)(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:일)?(?!\d)/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) dates.add(`${month}-${day}`);
  }
  return dates.size > 1;
}

function looksLikeBroadScheduleNotice(candidate) {
  const title = titleOf(candidate);
  const text = textOf(candidate);
  const value = `${title}\n${text}`;
  return /(?:\d{4}\s*년도\s*)?\d+\s*학기\s*정규\s*수업.*확정|정규\s*수업\s*시간표|전체\s*강습\s*일정|강습\s*전체\s*일정|공지사항.*정규\s*수업|공지사항.*정규수업/i.test(value);
}

function looksLikeDateFromNoticeOrBoardChrome(text = '', date = '', activity = '') {
  if (!date || !['class', 'event', 'recruit'].includes(activity)) return false;
  const contexts = contextsAroundDate(text, date);
  if (!contexts.length) return false;
  const boardBoundary = String(text).search(/댓글\s*리스트|(?:^|\s)다른\s*글(?:\s|$)|현재\s*페이지\s*\d*/i);
  if (boardBoundary >= 0) {
    const articleContexts = contextsAroundDate(String(text).slice(0, boardBoundary), date);
    if (articleContexts.length === 0) return true;
  }
  const badRe = /작성일|수정일|조회|댓글|목록|URL\s*복사|공지사항|필독|말머리|마감|입금|신청\s*마감|등록\s*마감|접수\s*마감|납부|회비|deadline|payment/i;
  const goodRe = /일시|일정|날짜|기간|개강|시작|첫\s*수업|첫날|수업일|강습일|워크샵|워크숍|원\s*데이|원데이|체험\s*클래스|오픈\s*클래스|특강|소셜|파티|행사|공연|\bdj\b|열립니다|진행|start|starts|class|lesson|workshop|one\s*day|oneday|open\s*class|social|party/i;
  return contexts.some((context) => badRe.test(context) && !goodRe.test(context));
}

export function getBlockedKeywordReason(text = '') {
  const value = String(text || '').normalize('NFKC');
  const matched = blockedKeywordRules.find(([, pattern]) => pattern.test(value));
  return matched ? `수집 금지 키워드: ${matched[0]}` : null;
}

function looksLikeMixedArtOrCommercialPerformance(text = '', taxonomy = {}) {
  if (taxonomy.dance_scope !== 'street') return false;
  if (!/현대\s*무용|컨템포러리|발레|한국\s*무용|뮤지컬|k-?pop|커버\s*댄스|힐\s*댄스|contemporary|ballet|musical|cover\s*dance|heels/i.test(text)) return false;
  return /공연|예매|티켓|관람|performance|ticket/i.test(text)
    && !/배틀|battle|워크샵|워크숍|workshop|class|클래스|수업|레슨/i.test(text);
}

function inferActivity(text, explicit, title = '') {
  const heading = String(title || '');
  if (/판매\s*이벤트|이벤트\s*판매|정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b|\bsale\b|\bpromotion\b/i.test(heading)) return 'sale';
  if (/(?:창립|오픈|개장)?\s*\d+\s*주년.{0,30}(?:파티|행사)|(?:파티|행사).{0,30}\d+\s*주년|anniversary/i.test(heading)) return 'event';
  if (/(?:강습|클래스|원\s*데이|원데이|\d+\s*기).{0,40}(?:신청\s*링크|신청서|접수|모집)|(?:신청\s*링크|신청서|접수|모집).{0,40}(?:강습|클래스|원\s*데이|원데이)/i.test(heading)) return 'recruit';
  if (/(?:경성|다이나믹\s*발보아|dynamic\s*balboa)\s*클래스|클래스\s*[:：]/i.test(heading)) return 'class';
  if (/(?:solo\s*jazz|솔로\s*재즈).*(?:\d{1,2}[./]\d{1,2}\s*[~～]|시즌|season)/i.test(heading)
    && !/(?:모집|신청|접수)/i.test(heading)) return 'class';
  if (/(?:소셜|social|프랙티카|practica|밀롱가|milonga)/i.test(heading)
    && !/(?:강습|수업|레슨|클래스|워크샵|워크숍|원\s*데이|원데이|모집|신청)/i.test(heading)) return 'social';
  if (['class', 'social', 'event', 'recruit', 'sale'].includes(explicit)) return explicit;
  if (/판매\s*이벤트|이벤트\s*판매|정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b|\bsale\b|\bpromotion\b/i.test(text)) return 'sale';
  if (/(참가자|팀원|크루|멤버|댄서|출연진)\s*모집|오디션|audition|crew\s*recruit|team\s*recruit/i.test(text)) return 'recruit';
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원\s*데이|원데이|오픈\s*클래스|체험\s*(?:클래스|강습|수업)|일일\s*(?:클래스|강습|수업)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|배워)|입문|초급|중급|class|lesson|workshop|one\s*day|oneday|open\s*class/i.test(text)) return 'class';
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

function normalizeSiteCategory(value = '') {
  const category = String(value || '').trim().toLowerCase();
  if (category === 'regular') return 'class';
  if (category === 'club') return 'club';
  if (category === 'class' || category === 'lesson') return 'class';
  if (category === 'social' || category === 'group') return 'social';
  if (category === 'event' || category === 'party') return 'event';
  return '';
}

const explicitEventTypePattern = /행사|대회|컴피티션|챔피언십|챔피언스?\s*컵|파티|공연|페스티벌|festival|competition|championship|tournament|contest|battle/i;
const explicitCompetitionTitlePattern = /대회|컴피티션|챔피언십|챔피언스?\s*컵|competition|championship|tournament|contest|\bbattle\b|\bcup\b/i;

function hasExplicitEventClassification(candidate = {}) {
  const sd = candidate.structured_data || {};
  const heading = titleOf(candidate);
  const category = normalizeSiteCategory(sd.category || candidate.category);
  if (category === 'social' && /졸\s*공|졸업\s*(?:공연|파티)|graduation/i.test(heading)) return false;
  if (category === 'event') return true;
  if (explicitEventTypePattern.test(String(sd.event_type || candidate.event_type || ''))) return true;

  const genre = [sd.genre, sd.subgenre, candidate.genre].filter(Boolean).join(' ');
  if (/대회|컴피티션|competition|championship|tournament|contest|battle/i.test(genre)) return true;
  return explicitCompetitionTitlePattern.test(heading);
}

function siteCategoryFromCandidate(candidate, taxonomy) {
  const sd = candidate.structured_data || {};
  if (taxonomy.activity_type === 'event' && hasExplicitEventClassification(candidate)) return 'event';
  const explicit = normalizeSiteCategory(sd.category || candidate.category);
  if (explicit) return explicit;

  const eventType = String(sd.event_type || candidate.event_type || '').trim();
  if (/소셜/i.test(eventType)) return 'social';
  if (/강습|수업|클래스/i.test(eventType)) return 'class';
  if (/동호회|크루|팀/i.test(eventType)) return 'club';
  if (/행사|파티|대회|공연/i.test(eventType)) return 'event';

  const text = textOf(candidate);
  if (/졸\s*공|졸업\s*(?:공연|파티)|graduation/i.test(text)) return 'social';
  if (taxonomy.activity_type === 'social') return 'social';
  if (taxonomy.activity_type === 'class') return 'class';
  if (taxonomy.activity_type === 'sale') {
    if (/소셜|social|밀롱가|프랙티카/i.test(text)) return 'social';
    if (/강습|수업|클래스|레슨|workshop|class|lesson/i.test(text)) return 'class';
    return 'event';
  }
  if (taxonomy.activity_type === 'recruit') {
    return /팀원\s*모집|팀\s*모집|크루\s*모집|멤버\s*모집|team\s*recruit|crew\s*recruit/i.test(text)
      ? 'class'
      : 'event';
  }
  return 'event';
}

function normalizeSiteGenreValue(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (/졸공|졸업공연|졸업파티|graduation/.test(compact)) return '졸공';
  if (/소셜|social|밀롱가|프랙티카/.test(compact)) return '소셜';
  if (/정규강습|정규수업|정규반/.test(compact)) return '정규강습';
  if (/린디합|lindyhop/.test(compact)) return '린디합';
  if (/솔로재즈|solojazz/.test(compact)) return '솔로재즈';
  if (/발보아|balboa/.test(compact)) return '발보아';
  if (/블루스|blues?/.test(compact)) return '블루스';
  if (/팀원모집|팀모집|크루모집|멤버모집|teamrecruit|crewrecruit/.test(compact)) return '팀원모집';
  if (/워크샵|워크숍|workshop/.test(compact)) return '워크샵';
  if (/라이브밴드|라이브|liveband/.test(compact)) return '라이브밴드';
  if (/대회|배틀|competition|battle|cup|finals/.test(compact)) return '대회';
  if (/파티|party|night/.test(compact)) return '파티';
  if (/기타|other|etc/.test(compact)) return '기타';
  return raw;
}

function pickSiteGenreFromValues(values = [], category) {
  const allowed = siteGenresByCategory[category] || siteGenresByCategory.event;
  for (const value of values) {
    const parts = String(value || '').split(/[,/·ㆍ|]+/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeSiteGenreValue(part);
      if (allowed.includes(normalized)) return normalized;
    }
  }
  return '';
}

function inferSiteGenre(candidate, category) {
  const sd = candidate.structured_data || {};
  const explicit = pickSiteGenreFromValues([
    sd.genre,
    sd.subgenre,
    sd.dance_genre_label,
    sd.dance_genre,
    candidate.genre,
  ], category);
  if (explicit) return explicit;

  const text = textOf(candidate);
  if (category === 'social') {
    return /졸\s*공|졸업\s*(?:공연|파티)|graduation/i.test(text) ? '졸공' : '소셜';
  }

  if (category === 'class' || category === 'club') {
    if (/팀원\s*모집|팀\s*모집|크루\s*모집|멤버\s*모집|team\s*recruit|crew\s*recruit/i.test(text)) return '팀원모집';
    if (category === 'club' && /정규\s*(?:강습|수업|반)|regular\s*(?:class|lesson)/i.test(text)) return '정규강습';
    if (/린디\s*합|lindy\s*hop/i.test(text)) return '린디합';
    if (/솔로\s*재즈|solo\s*jazz/i.test(text)) return '솔로재즈';
    if (/발보아|balboa/i.test(text)) return '발보아';
    if (/블루스|blues?/i.test(text)) return '블루스';
    return '기타';
  }

  if (/대회|배틀|competition|battle|cup|finals/i.test(text)) return '대회';
  if (/라이브\s*밴드|live\s*band/i.test(text)) return '라이브밴드';
  if (/파티|party|night/i.test(text)) return '파티';
  if (/워크샵|워크숍|특강|workshop/i.test(text)) return '워크샵';
  return '기타';
}

function getSiteEventFields(candidate, taxonomy) {
  const category = siteCategoryFromCandidate(candidate, taxonomy);
  const genre = inferSiteGenre(candidate, category);
  return {
    category,
    genre,
    dance_scope: taxonomy.dance_scope,
    activity_type: taxonomy.activity_type,
  };
}

function stripVirtualTaxonomyFields(structuredData = {}) {
  const {
    activity_label,
    genre_family,
    genre_family_label,
    dance_genre,
    dance_genre_label,
    dance_scope_label,
    taxonomy_confidence,
    tags,
    tag_labels,
    time,
    times,
    ...siteStructuredData
  } = structuredData || {};
  return siteStructuredData;
}

export function inferCandidateTaxonomy(candidate) {
  const source = findSourceForCandidate({ sourceId: candidate.source_id, url: candidate.source_url });
  const sd = candidate.structured_data || {};
  const text = textOf(candidate);
  const inferredActivity = inferActivity(text, sd.activity_type, titleOf(candidate));
  // DJ는 행사에도 포함될 수 있다. 이미 행사·대회로 명시된 후보는 DJ 단서만으로
  // 소셜로 내리지 않고, 모집·강습·판매처럼 더 구체적인 다른 활동은 유지한다.
  const activity = inferredActivity === 'social' && hasExplicitEventClassification(candidate)
    ? 'event'
    : inferredActivity;
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
  if (/(?:p240x240|s240x240|s640x640)/i.test(value)) return true;

  const pathSize = value.match(/\/s(\d+)x(\d+)\//i);
  if (pathSize) return Math.min(Number(pathSize[1]), Number(pathSize[2])) < 900;

  let stp = '';
  try {
    stp = new URL(value).searchParams.get('stp') || '';
  } catch {
    stp = value.match(/[?&]stp=([^&]+)/i)?.[1] || '';
  }
  if (!stp) return false;

  const renderedSize = stp.match(/(?:^|_)s(\d+)x(\d+)(?:_|$)/i);
  if (renderedSize && Math.min(Number(renderedSize[1]), Number(renderedSize[2])) < 900) return true;

  const cropSize = stp.match(/(?:^|_)c\d+\.\d+\.(\d+)\.(\d+)[a-z]?(?:_|$)/i);
  if (cropSize) return Math.min(Number(cropSize[1]), Number(cropSize[2])) < 900;

  return /(?:^|_)c\d/i.test(stp);
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
  const source = findSourceForCandidate({ sourceId: candidate.source_id, url: sourceUrl });
  const sourceExcludedReason = getExcludedSourceReason(sourceUrl);
  const retiredSourceIdentity = `${candidate.source_id || ''} ${candidate.keyword || ''} ${sd.title || ''}`;
  const scopeExcludedReason = getCollectionExclusionReason(taxonomy);
  const blockedKeywordReason = getBlockedKeywordReason(text);
  const benefitValidityEndDate = sd.benefit_eligible === true
    ? extractBenefitValidityEndDate(text, { today })
    : '';
  const imageOptionalNamedDjSocial = isImageOptionalNamedDjSocial(candidate, { source, date, today });

  if (!sourceUrl) errors.push('source_url required');
  if (sourceExcludedReason) errors.push(sourceExcludedReason);
  if (/swingfamily|스윙패밀리/i.test(retiredSourceIdentity)) {
    errors.push('운영 종료 소스 제외: 스윙패밀리');
  }
  if (blockedKeywordReason) errors.push(blockedKeywordReason);
  const policyExclusionReason = getIngestionCandidateExclusionReason(candidate, { today });
  if (policyExclusionReason) errors.push(policyExclusionReason);
  if (benefitValidityEndDate && benefitValidityEndDate < today) {
    errors.push(`expired benefit validity: ${benefitValidityEndDate} < ${today}`);
  }
  if (!date) errors.push('structured_data.date required');
  const statedDay = String(sd.day || '').slice(0, 1) || explicitWeekdayForCandidateDate(text, date);
  if (date && statedDay && statedDay !== weekdayLabelForDate(date)) {
    errors.push(`event weekday mismatch: ${date} is ${weekdayLabelForDate(date)}, not ${statedDay}`);
  }
  if (isDeadlineOnlyEventDate(text, date, taxonomy.activity_type)) {
    errors.push('event date looks like a deadline/registration/payment date, not an actual event date');
  }
  if (looksLikeDateFromNoticeOrBoardChrome(text, date, taxonomy.activity_type)) {
    errors.push('event date context looks like board chrome, notice, or non-event metadata');
  }
  if (looksLikeGenericSourceFallbackTitle(candidate, source, taxonomy.activity_type)) {
    errors.push('generic source fallback title is not enough for automatic collection');
  }
  if (looksLikeLowQualityAutoTitle(candidate)) {
    errors.push('auto title looks like a caption fragment, not an event title');
  }
  if (looksLikeNaverCafeChromeTitle(candidate)) {
    errors.push('naver cafe title still contains board chrome/notice prefix');
  }
  if (hasNaverCafeChromeDj(candidate)) {
    errors.push('naver cafe DJ contains author/profile chrome');
  }
  if (hasMalformedDj(candidate)) {
    errors.push('DJ value contains date, board chrome, or event-description text');
  }
  if (looksLikeBroadScheduleNotice(candidate)) {
    errors.push('broad schedule notice is not a single collectable event');
  }
  if (
    taxonomy.activity_type === 'social'
    && candidate._date_scoped_social_evidence !== true
    && /(?:\d{1,2}\s*월\s*)?\d{1,2}\s*[,·&]\s*\d{1,2}\s*일/i.test(text)
  ) {
    errors.push('multi-date social notice must be split into one candidate per date');
  }
  if (
    taxonomy.activity_type === 'social'
    && candidate._date_scoped_social_evidence !== true
    && hasMultipleExplicitCalendarDates(text)
    && Array.isArray(sd.djs)
    && sd.djs.filter(Boolean).length > 1
  ) {
    errors.push('multi-date multi-DJ social notice must be split before registration');
  }
  if (
    taxonomy.activity_type === 'social'
    && (
      /class|강습|lesson/i.test(String(sd.event_type || candidate.event_type || ''))
      || /class|강습|lesson/i.test(String(sd.category || candidate.category || ''))
    )
  ) {
    errors.push('social candidate retains conflicting class taxonomy');
  }
  if (
    taxonomy.activity_type === 'social'
    && /(?:\d+\s*기|강습|수강생|수강|클래스).{0,24}모집|모집.{0,24}(?:강습|수강생|수강|클래스)/i.test(text)
    && (
      !/소셜|social/i.test(titleOf(candidate))
      || !Array.isArray(sd.djs)
      || sd.djs.filter(Boolean).length === 0
    )
  ) {
    errors.push('recruitment/class notice is misclassified as a social');
  }
  if (
    taxonomy.activity_type === 'social'
    && /(?:경성|다이나믹\s*발보아|dynamic\s*balboa)\s*클래스|클래스\s*[:：]/i.test(text)
    && (
      !/소셜|social/i.test(titleOf(candidate))
      || !Array.isArray(sd.djs)
      || sd.djs.filter(Boolean).length === 0
    )
  ) {
    errors.push('named class notice is misclassified as a social');
  }
  const explicitActivity = String(candidate.activity_type || sd.activity_type || '');
  if (explicitActivity !== 'sale' && /정기\s*(?:할인)?권|시즌\s*(?:권|패스)|월(?:간)?\s*(?:권|정액)|다회권|\d+\s*회권|프리\s*패스|티켓\s*북|패키지\s*권|멤버십|membership|\bpass\b/i.test(text)) {
    errors.push('season-pass sale is misclassified as a dated activity');
  }
  if (explicitActivity === 'social' && /(?:창립|오픈|개장)?\s*\d+\s*주년.{0,20}(?:파티|행사)|(?:파티|행사).{0,20}\d+\s*주년/i.test(text)) {
    errors.push('anniversary event is misclassified as a regular social');
  }
  if (!candidate.poster_url && !candidate.imageData && !imageOptionalNamedDjSocial) {
    errors.push('poster_url or imageData required');
  }
  if (candidate.poster_url && hasBadPosterUrl(candidate.poster_url)) {
    if (imageOptionalNamedDjSocial) warnings.push('discard cropped or thumbnail-sized social poster and use venue map');
    else errors.push('poster_url looks cropped or thumbnail-sized');
  }
  if (scopeExcludedReason) errors.push(scopeExcludedReason);
  if (looksLikeMixedArtOrCommercialPerformance(text, taxonomy)) {
    errors.push('수집 범위 제외: 공연예술/상업 혼합 공연은 수동 검토 필요');
  }
  if (source?.discoveryOnly) errors.push('discovery-only source: official source URL required before saving');
  if (
    Array.isArray(source?.allowedActivityTypes)
    && source.allowedActivityTypes.length
    && !source.allowedActivityTypes.includes(taxonomy.activity_type)
  ) {
    errors.push(`source does not collect activity type: ${taxonomy.activity_type}`);
  }
  if (
    date
    && Array.isArray(source?.allowedWeekdays)
    && source.allowedWeekdays.length
    && !source.allowedWeekdays.includes(new Date(`${date}T12:00:00+09:00`).getDay())
  ) {
    errors.push(`source does not collect this weekday: ${date}`);
  }
  if (source?.requiredEventPattern instanceof RegExp && !source.requiredEventPattern.test(text)) {
    errors.push('source post is not the required event series');
  }
  if (taxonomy.activity_type === 'social' && !hasConcreteSocialOperatingEvidence(candidate)) {
    errors.push('social candidate requires a DJ or concrete operating evidence');
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

function socialVariantBaseTitle(candidate) {
  return normalizeText(titleOf(candidate).replace(/\s+(?:DJ|디제이)\s+.+$/i, ''));
}

function socialVariantDjs(candidate) {
  return [...new Set((candidate?.structured_data?.djs || [])
    .map((value) => normalizeText(value))
    .filter(Boolean))];
}

export function collapseSocialCandidateVariants(candidates = []) {
  const grouped = new Map();
  const output = [];

  for (const candidate of candidates) {
    const taxonomy = inferCandidateTaxonomy(candidate);
    if (taxonomy.activity_type !== 'social') {
      output.push(candidate);
      continue;
    }

    const sd = candidate.structured_data || {};
    const key = [
      normalizeSourceUrl(candidate.source_url),
      String(sd.date || candidate.date || '').slice(0, 10),
      normalizeText(sd.venue_name || sd.location || ''),
      socialVariantBaseTitle(candidate),
    ].join('|');
    const existingIndex = grouped.get(key);
    if (existingIndex === undefined) {
      grouped.set(key, output.length);
      output.push(candidate);
      continue;
    }

    const existing = output[existingIndex];
    const existingDjs = socialVariantDjs(existing);
    const candidateDjs = socialVariantDjs(candidate);
    const candidateIsRicher = candidateDjs.length > existingDjs.length
      && existingDjs.every((dj) => candidateDjs.includes(dj));
    if (candidateIsRicher) output[existingIndex] = candidate;
  }

  return output;
}

export function prepareCandidate(rawCandidate, config = {}) {
  const graduation = getGraduationEventMetadata(rawCandidate);
  const normalizedRawCandidate = graduation
    ? {
      ...rawCandidate,
      structured_data: {
        ...(rawCandidate.structured_data || {}),
        category: graduation.category,
        genre: graduation.genre,
        activity_type: graduation.activity_type,
        event_type: graduation.event_type,
        group_id: graduation.group_id,
        djs: [graduation.displayDj],
      },
    }
    : rawCandidate;
  const normalizedSourceUrl = normalizeSourceUrl(normalizedRawCandidate.source_url);
  const taxonomy = inferCandidateTaxonomy({ ...normalizedRawCandidate, source_url: normalizedSourceUrl });
  const siteEventFields = getSiteEventFields({ ...normalizedRawCandidate, source_url: normalizedSourceUrl }, taxonomy);
  const structuredData = normalizeCandidateVenueStructuredData({
    ...stripVirtualTaxonomyFields(normalizedRawCandidate.structured_data || {}),
    ...siteEventFields,
  });
  const confirmedBenefit = classifyConfirmedBenefitEvent({ ...normalizedRawCandidate, structured_data: structuredData });
  if (confirmedBenefit) {
    structuredData.benefit_eligible = true;
    structuredData.benefit_kind = confirmedBenefit;
  } else {
    delete structuredData.benefit_eligible;
    delete structuredData.benefit_kind;
  }
  const evergreenBenefit = isEvergreenBenefitCandidate({ ...normalizedRawCandidate, structured_data: structuredData }, config);
  if (evergreenBenefit) {
    structuredData.ongoing_sale = true;
    structuredData.benefit_lifecycle = 'evergreen';
    const originalDate = String(structuredData.date || '').slice(0, 10);
    if (originalDate) structuredData.source_post_date = originalDate;
  } else {
    delete structuredData.ongoing_sale;
    if (confirmedBenefit) structuredData.benefit_lifecycle = 'date_bound';
    else delete structuredData.benefit_lifecycle;
  }
  const date = String(structuredData.date || '').slice(0, 10);
  const identityDate = confirmedBenefit === 'season_pass' ? 'season-pass' : date;
  const id = normalizedRawCandidate.id || makeDeterministicId(normalizedSourceUrl, identityDate, normalizedRawCandidate.id_suffix || '');
  const shouldDiscardSocialPoster = taxonomy.activity_type === 'social'
    && normalizedRawCandidate.poster_url
    && hasBadPosterUrl(normalizedRawCandidate.poster_url);
  const candidate = {
    ...normalizedRawCandidate,
    id,
    source_url: normalizedSourceUrl,
    ...(shouldDiscardSocialPoster ? { poster_url: '' } : {}),
    structured_data: structuredData,
    is_collected: normalizedRawCandidate.is_collected || false,
  };

  return {
    candidate,
    validation: validateCandidate(candidate, config),
  };
}

export function evaluateAutoRegistrationReadiness(rawCandidate, config = {}) {
  const { candidate, validation } = prepareCandidate(rawCandidate, config);
  const sd = candidate.structured_data || {};
  const source = validation.source;
  const reasons = [...validation.errors];
  const activity = validation.taxonomy.activity_type;
  const venue = String(sd.venue_name || sd.location || '').trim();
  const title = titleOf(candidate);
  const djs = Array.isArray(sd.djs) ? sd.djs.filter(Boolean) : [];
  const venueProvenance = String(sd.venue_provenance || '').trim();
  const discoverySourceType = String(candidate.discovery_source_type || '').trim().toLowerCase();

  if (source?.autoRegistrationPolicy !== 'shadow' && source?.autoRegistrationPolicy !== 'auto') {
    reasons.push('source is not enrolled in auto-registration shadow policy');
  }
  if (source?.discoveryOnly || source?.type === 'benefit_search' || discoverySourceType === 'benefit_search') {
    reasons.push('search/discovery sources require manual approval');
  }
  if (activity !== 'social' && !candidate.poster_url && !candidate.imageData) {
    reasons.push('auto-registration requires an image');
  }
  if (!venue) reasons.push('auto-registration requires a verified venue');
  if (!sd.venue_provenance && !source?.venue) reasons.push('venue provenance is not verified');
  if (
    source?.autoRegistrationVenuePolicy === 'explicit'
    && !['source_text', 'poster_text', 'manual_verified'].includes(venueProvenance)
  ) {
    reasons.push('this multi-venue source requires a venue explicitly verified from the post');
  }
  if (!title || title.length < 4) reasons.push('auto-registration requires a concrete title');
  if (!['class', 'social', 'event', 'recruit', 'sale'].includes(activity)) {
    reasons.push('activity type is not auto-registerable');
  }
  if (
    Array.isArray(source?.autoRegistrationAllowedActivityTypes)
    && !source.autoRegistrationAllowedActivityTypes.includes(activity)
  ) {
    reasons.push('source/activity is not enrolled for automatic registration');
  }
  if (activity === 'social' && djs.length === 0 && !isAiGroundedDjlessSocial(candidate)) {
    reasons.push('social auto-registration requires a DJ or double-verified poster evidence');
  }
  if (activity === 'social' && hasMalformedDj(candidate)) {
    reasons.push('social auto-registration requires a clean DJ name');
  }
  if (
    activity === 'social'
    && /행사|졸업\s*(?:공연|파티)|졸공|대회|컴피티션|챔피언십|competition|graduation\s*(?:show|party|performance)|championship|tournament|contest|\bbattle\b|\bcup\b/i.test([
      sd.title,
      sd.event_type,
      sd.category,
      sd.genre,
    ].filter(Boolean).join(' '))
  ) {
    reasons.push('special event classification requires manual review instead of social auto-registration');
  }

  return {
    ready: reasons.length === 0,
    mode: source?.autoRegistrationPolicy || 'manual',
    source_id: source?.id || candidate.source_id || null,
    reasons: [...new Set(reasons)],
  };
}

export function buildCafe24Payload(rawCandidate, config = {}) {
  const { candidate, validation } = prepareCandidate(rawCandidate, config);
  if (!validation.ok) {
    const error = new Error(`Invalid ingestion candidate: ${validation.errors.join('; ')}`);
    error.validation = validation;
    throw error;
  }
  return {
    ...candidate,
    auto_registration: evaluateAutoRegistrationReadiness(candidate, config),
  };
}
