import assert from 'node:assert/strict';
import {
  buildCafe24Payload,
  classifyConfirmedBenefitEvent,
  extractDatedDjSections,
  extractIndependentSocialDateSections,
  extractNeoWeeklyClosureDates,
  extractNeoWeeklySocialSchedule,
  hasBadPosterUrl,
  isCollectableDate,
  keepFirstEventDateOnly,
  makeDeterministicId,
  prepareCandidate,
  isEvergreenSeasonPassCandidate,
  isHighConfidenceDatedSocialSchedule,
  stripNaverCafeMemberPrefix,
  textSimilarity,
  validateCandidate,
  evaluateAutoRegistrationReadiness,
} from './ingestion/candidate-utils.mjs';
import { dynamicSearchQueries, findSourceByUrl, getAutomationSourceList, getCollectionSources, getExcludedSourceReason } from './ingestion/collection-registry.mjs';
import {
  benefitSearchMatches,
  expectedInstagramHandleForSource,
  extractInstagramPostUrls,
  extractInstagramProfileUrls,
  isStaleBenefitSourcePost,
  normalizeInstagramPostUrl,
} from './ingestion/benefit-search-utils.mjs';
import { benefitFieldsFromStructuredData } from '../server/cafe24/ingestion-benefit-fields.js';
import {
  collapseDateExpansionRows,
  dateExpansionSkipReason,
  dateExpansionKey,
  normalizeDateExpansionUrl,
  shouldSkipDateExpansionCandidate,
  shouldHidePastCandidate,
  sortDateExpansionInputs,
} from '../server/cafe24/ingestion-date-expansion.js';

const TODAY = '2026-05-23';

assert.deepEqual(
  extractIndependentSocialDateSections({
    today: '2026-07-12',
    title: '■ 스윙타임바 (7월 25,26일) 토,일 소셜 공지',
    text: `■ 스윙타임바 (7월 25,26일) 토,일 소셜 공지
- 토요일
저녁 7시30분부터 소셜이 진행 됩니다.
DJ '이정' PM 8:15-10:15

- 일요일
저녁 7시30분부터 소셜이 진행 됩니다.
1부 DJ 로젤 PM 7:30-9:00
2부 DJ 로젤 9:00-10:30`,
  }).map(({ date, day }) => ({ date, day })),
  [
    { date: '2026-07-25', day: '토' },
    { date: '2026-07-26', day: '일' },
  ],
  'compact title dates with separate weekday sections must become two independent social sessions',
);
assert.deepEqual(
  extractIndependentSocialDateSections({
    today: '2026-07-26',
    title: '스윙타임바 (7월 25,26일) 토,일 소셜 공지',
    text: '- 토요일\nDJ Alpha 20:00\n- 일요일\nDJ Beta 20:00',
  }).map(({ date }) => date),
  ['2026-07-26'],
  'past sessions remain excluded without collapsing the still-current independent session',
);

const kyungsungWeeklySections = extractDatedDjSections({
  today: '2026-07-30',
  text: `📍 This Week at Kyungsung Hall
🗓 8/1 (토)
🕢 19:30 ~ 23:00
🎧 DJ 북실
🗓 8/2 (일)
🕢 19:30 ~ 23:00
🎧 DJ 메이저
🗓 8/4 (화)
🕗 20:00 ~ 23:00
🎧 DJ 스톰
✨ 8/4(화) 19:00부터는 8월 첫 번째 경성 클래스가 함께 진행됩니다!
🎩 Theme : Social Essentials`,
});
assert.deepEqual(
  kyungsungWeeklySections.map(({ date, day, segment }) => ({
    date,
    day,
    dj: segment.match(/DJ\s+([A-Za-z가-힣]+)/i)?.[1] || '',
  })),
  [
    { date: '2026-08-01', day: '토', dj: '북실' },
    { date: '2026-08-02', day: '일', dj: '메이저' },
    { date: '2026-08-04', day: '화', dj: '스톰' },
  ],
  'a Kyungsung weekly social post must remain split by date/DJ even with an adjacent class notice',
);
assert.equal(
  isHighConfidenceDatedSocialSchedule(kyungsungWeeklySections.map((section) => ({
    date: section.date,
    djs: [section.segment.match(/DJ\s+([A-Za-z가-힣]+)/i)?.[1]].filter(Boolean),
  }))),
  true,
  'two or more complete date/DJ pairs must take precedence over post-wide class wording',
);
assert.equal(
  isHighConfidenceDatedSocialSchedule([
    { date: '2026-08-01', djs: ['북실'] },
    { date: '2026-08-02', djs: [] },
  ]),
  false,
  'incomplete weekly schedules must not be promoted to automatic social registration',
);

const neoMixedClosureSections = extractDatedDjSections({
  today: '2026-07-30',
  text: `위클리 네오 7월 5주차
7월 31일 금햅 DJ 호두
스윙베이비 [프랑]
8월 2일 일요일, 해피홀에서의 강습과 소셜은 한 주 쉬어갑니다.`,
});
assert.deepEqual(
  neoMixedClosureSections.map(({ date, day, segment }) => ({
    date,
    day,
    dj: segment.match(/DJ\s+([A-Za-z가-힣]+)/i)?.[1] || '',
  })),
  [{ date: '2026-07-31', day: '금', dj: '호두' }],
  'a dated Neo DJ social must survive when a different date in the same weekly post is a closure',
);
assert.deepEqual(
  extractNeoWeeklySocialSchedule({
    today: '2026-07-30',
    text: `위클리 네오 7월 5주차
🎧 금햅 DJ 호두
🪩 스윙베이비 [프랑]
7월 31일 금햅
8월 2일 일요일, 해피홀에서의 강습과 소셜은 한 주 쉬어갑니다.`,
  }).map(({ date, day, djs }) => ({ date, day, djs })),
  [{ date: '2026-07-31', day: '금', djs: ['호두'] }],
  'Neo weekly parsing must keep the Friday DJ, ignore non-DJ program text, and exclude the Sunday closure',
);
assert.deepEqual(
  extractNeoWeeklyClosureDates({
    today: '2026-07-30',
    text: `위클리 네오 7월 5주차
🎧 금햅 DJ 호두
7월 31일 금햅
8월 2일 일요일, 해피홀에서의 강습과 소셜은 한 주 쉬어갑니다.`,
  }),
  ['2026-08-02'],
  'Neo weekly parsing must preserve the explicit closure date separately from active social sessions',
);

assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '참가비 0원, 6월 5일 무료 체험 클래스',
  structured_data: { title: '무료 체험 클래스' },
}), 'free_event', 'explicit zero-price/free events should be benefit eligible');
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '무료 라인강습은 없습니다. 입장료 15,000원',
  structured_data: { title: '금요 소셜' },
}), null, 'negated free wording must not be benefit eligible');
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '7월 정기권 판매 오픈',
  structured_data: { title: '7월 정기권' },
}), 'season_pass', 'explicit season-pass sales should be benefit eligible');
for (const phrase of [
  '스윙프렌즈 정기 할인권 판매 오픈',
  '스윙바 다회권 구매 가능',
  '소셜 10회권 가격 안내',
  '7월 월간권 신청 오픈',
  '여름 시즌패스 판매',
  '입장권 10장 묶음 판매',
  '스윙바 티켓북 구매 가능',
]) {
  assert.equal(classifyConfirmedBenefitEvent({
    extracted_text: phrase,
    structured_data: { title: phrase },
  }), 'season_pass', `${phrase} should be recognized as a pass sale`);
}
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '무료 라인강습은 없습니다. 8월 정기권 판매 오픈',
  structured_data: { title: '8월 정기권 판매' },
}), 'season_pass', 'a negated free-class phrase must not hide a separately confirmed season-pass sale');
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '무료 주차 가능, 입장료 20,000원',
  structured_data: { title: '토요 살사 소셜' },
}), null, 'incidental free parking must not turn a paid social into a free event');
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '참가비 사전 27,000원, 현장 30,000원. 이벤트 우승 경품은 무료강습권',
  structured_data: { title: '26주년 유료 라이브 파티' },
}), null, 'a free lesson voucher prize must not turn a paid party into a free event');
assert.equal(classifyConfirmedBenefitEvent({
  extracted_text: '첫 방문 무료 체험 클래스, 2026년 8월 2일',
  structured_data: { title: '바차타 입문 체험' },
}), 'free_event', 'explicit free trial classes should classify across approved dance scopes');
const benefitPhraseCases = [
  ['입장은 무료, 음료는 별도 구매입니다.', 'free_event'],
  ['관람 무료 / 스트릿 배틀 참가비는 별도', 'free_event'],
  ['Admission: FREE · Salsa social', 'free_event'],
  ['FREE WORKSHOP before the bachata social', 'free_event'],
  ['수강료 0원 탱고 입문 클래스', 'free_event'],
  ['프로그램: 무료 스윙댄스 강습, 라이브밴드 소셜 / 누구나 무료', 'free_event'],
  ['무료 라인강습은 없습니다. 입장은 무료입니다.', 'free_event'],
  ['무료 주차 가능합니다. 입장료 15,000원', null],
  ['무료 음료 1잔 제공, 참가비 20,000원', null],
  ['무료 상담 후 유료 수강 등록', null],
  ['동호회 회원 대상 무료 대관 혜택, 월 회비 별도', null],
  ['스윙바 8월 시즌권 판매 오픈', 'season_pass'],
  ['8월 워크숍 얼리버드 20% 할인 오픈', 'discount_event'],
  ['첫 방문 회원 5,000원 할인 혜택', 'discount_event'],
  ['할인 이벤트는 종료되었습니다.', null],
  ['무료 이벤트는 종료되었습니다.', null],
  ['free lesson is not available, admission required', null],
  ['멤버십 안내만 진행하며 현재 판매하지 않습니다.', null],
];
for (const [phrase, expected] of benefitPhraseCases) {
  assert.equal(
    classifyConfirmedBenefitEvent({ extracted_text: phrase, structured_data: { title: phrase } }),
    expected,
    `benefit phrase classification mismatch: ${phrase}`,
  );
}

assert.equal(
  normalizeInstagramPostUrl('/url?q=https%3A%2F%2Fwww.instagram.com%2Fp%2FABC_123%2F%3Figsh%3Dfoo', 'https://www.google.com/search?q=test'),
  'https://www.instagram.com/p/ABC_123/',
  'Google redirect URLs should normalize to canonical Instagram posts',
);
assert.deepEqual(
  extractInstagramPostUrls([
    'https://www.instagram.com/reel/XYZ-789/?utm_source=search',
    'https://www.instagram.com/reel/XYZ-789/',
    'https://www.instagram.com/example/',
  ]),
  ['https://www.instagram.com/reel/XYZ-789/'],
  'benefit discovery should dedupe posts and reject profiles',
);
assert.deepEqual(
  extractInstagramProfileUrls([
    'https://www.instagram.com/fiesta_swingdance/?hl=ko',
    'https://www.instagram.com/fiesta_swingdance/',
    'https://www.instagram.com/p/ABC123/',
    'https://example.com/fiesta_swingdance/',
  ]),
  ['https://www.instagram.com/fiesta_swingdance/'],
  'search fallback should discover canonical Instagram profiles without accepting posts or foreign hosts',
);
assert.deepEqual(
  benefitFieldsFromStructuredData({ benefit_eligible: true, benefit_kind: 'free_event' }),
  { benefit_eligible: true, benefit_kind: 'free_event' },
  'confirmed free-event metadata must survive candidate approval into the public event row',
);
assert.deepEqual(
  benefitFieldsFromStructuredData({ benefit_eligible: true, benefit_kind: 'discount_event' }),
  { benefit_eligible: true, benefit_kind: 'discount_event' },
  'confirmed discount metadata must survive candidate approval into the public event row',
);
const imageOptionalDiscount = prepareCandidate({
  keyword: '할인 이벤트 검색',
  source_url: 'https://www.instagram.com/example/reel/DISCOUNT2026/',
  extracted_text: '2026년 8월 20일 스윙 워크숍 얼리버드 20% 할인',
  structured_data: {
    title: '스윙 워크숍 얼리버드 할인',
    date: '2026-08-20',
    location: '서울',
    event_type: '행사',
    activity_type: 'event',
  },
}, { today: TODAY });
assert.equal(imageOptionalDiscount.validation.ok, true, 'confirmed discount candidates may be collected without an image');
assert.match(imageOptionalDiscount.validation.warnings.join(' '), /without an image/, 'image-less discounts should keep an admin review warning');
const imageOptionalSocial = prepareCandidate(baseCandidate({
  poster_url: '',
  imageData: '',
  structured_data: {
    title: '금요 스윙 소셜',
    date: '2026-08-21',
    location: '서울',
    event_type: '소셜',
    activity_type: 'social',
    djs: ['DJ Test'],
  },
}), { today: TODAY });
assert.equal(imageOptionalSocial.validation.ok, true, 'social candidates may be collected without an image');
const imageOptionalFreeBenefit = prepareCandidate(baseCandidate({
  poster_url: '',
  imageData: '',
  extracted_text: '2026년 8월 22일 무료 스윙댄스 체험 클래스',
  structured_data: {
    title: '무료 스윙댄스 체험 클래스',
    date: '2026-08-22',
    location: '서울',
    event_type: '강습',
    activity_type: 'class',
  },
}), { today: TODAY });
assert.equal(imageOptionalFreeBenefit.validation.ok, true, 'all confirmed benefit candidates may be collected without an image');
assert.deepEqual(
  benefitFieldsFromStructuredData({ benefit_eligible: true, benefit_kind: 'unexpected' }),
  { benefit_eligible: false, benefit_kind: null },
  'unknown benefit kinds must fail closed during public event registration',
);
assert.deepEqual(
  benefitFieldsFromStructuredData({ benefit_eligible: false, benefit_kind: 'season_pass' }),
  { benefit_eligible: false, benefit_kind: null },
  'a benefit kind without explicit eligibility must not become publicly visible',
);

function baseCandidate(overrides = {}) {
  return {
    keyword: 'test',
    source_url: 'https://www.instagram.com/swingtimebar/p/ABC123/',
    poster_url: '/uploads/scraped/test.webp',
    extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.06.05 20:00',
    structured_data: {
      title: '스윙타임 금요 소셜',
      date: '2026-06-05',
      location: '스윙타임',
      event_type: '소셜',
      djs: ['DJ Alpha'],
    },
    ...overrides,
  };
}

function assertNoVirtualGenreFields(structuredData) {
  [
    'activity_label',
    'genre_family',
    'genre_family_label',
    'dance_genre',
    'dance_genre_label',
    'dance_scope_label',
    'taxonomy_confidence',
    'tags',
  ].forEach((key) => {
    assert.equal(
      Object.prototype.hasOwnProperty.call(structuredData || {}, key),
      false,
      `candidate payload must not persist virtual taxonomy field: ${key}`,
    );
  });
}

const id1 = makeDeterministicId('https://example.com/post?utm_source=x#top', '2026-06-01');
const id2 = makeDeterministicId('https://example.com/post', '2026-06-01');
assert.equal(id1, id2, 'utm/hash normalized deterministic ID');
assert.notEqual(id1, makeDeterministicId('https://example.com/post', '2026-06-02'), 'date changes deterministic ID');
assert.equal(
  makeDeterministicId('https://cafe.naver.com/f-e/cafes/10342583/articles/155957?boardtype=L&menuid=13&referrerAllArticles=false', '2026-06-27'),
  makeDeterministicId('https://cafe.naver.com/f-e/cafes/10342583/articles/155957?boardtype=L&menuid=264&referrerAllArticles=false', '2026-06-27'),
  'naver cafe article IDs ignore menu/list query noise',
);
assert.deepEqual(
  keepFirstEventDateOnly(['2026-07-20', '2026-07-06', '2026-07-13']),
  ['2026-07-06'],
  'multi-date ingestion candidates must keep only the first event date',
);
assert.deepEqual(
  keepFirstEventDateOnly([
    { date: '2026-07-20', title: 'third' },
    { date: '2026-07-06', title: 'first' },
    { date: '2026-07-13', title: 'second' },
  ], (item) => item.date).map((item) => item.title),
  ['first'],
  'multi-date class/event candidates must keep only the first event date',
);
const multiDateRows = [
  {
    id: 'later-3',
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156900',
    structured_data: { title: '들라/칼오의 재즈업 시즌2 (7-8월 월요일 @경성홀)', date: '2026-08-03' },
  },
  {
    id: 'first',
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156900',
    structured_data: { title: '들라/칼오의 재즈업 시즌2 (7-8월 월요일 @경성홀)', date: '2026-07-06' },
  },
  {
    id: 'later-1',
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156900',
    structured_data: { title: '들라/칼오의 재즈업 시즌2 (7-8월 월요일 @경성홀)', date: '2026-07-13' },
  },
];
assert.deepEqual(
  sortDateExpansionInputs(multiDateRows).map((row) => row.id),
  ['first', 'later-1', 'later-3'],
  'same source/title multi-date candidates must be processed earliest date first',
);
assert.deepEqual(
  collapseDateExpansionRows(multiDateRows).map((row) => row.id),
  ['first'],
  'candidate list must show only the first date for one source/title multi-date post',
);
const dateExpansionDecision = shouldSkipDateExpansionCandidate(multiDateRows[2], [multiDateRows[1]]);
assert.equal(dateExpansionDecision.skip, true, 'later date from the same source/title must be skipped at save time');
assert.match(dateExpansionSkipReason(dateExpansionDecision.primary), /2026-07-06/, 'skip reason should point to the kept first date');
assert.equal(
  shouldHidePastCandidate({ structured_data: { date: '2026-07-25' } }, { today: '2026-07-26', tab: 'new' }),
  true,
  'ordinary past candidates must stay hidden from the new list',
);
assert.equal(
  shouldHidePastCandidate({
    structured_data: { date: '2026-07-25' },
    manual_recovery_until: '2026-07-26',
  }, { today: '2026-07-26', tab: 'new' }),
  false,
  'explicit manual recovery candidates must remain reviewable through the recovery date',
);
assert.equal(
  shouldHidePastCandidate({
    structured_data: {
      date: '2024-01-10',
      benefit_eligible: true,
      benefit_kind: 'season_pass',
      benefit_lifecycle: 'evergreen',
      ongoing_sale: true,
    },
  }, { today: '2026-07-26', tab: 'free' }),
  false,
  'verified ongoing benefit sales must remain visible in the benefit list after the source post date',
);
assert.equal(
  shouldHidePastCandidate({
    structured_data: {
      date: '2024-07-10',
      benefit_eligible: true,
      benefit_kind: 'free_event',
      benefit_lifecycle: 'date_bound',
    },
  }, { today: '2026-07-26', tab: 'free' }),
  true,
  'expired date-bound benefits must not remain in the current benefit tab',
);
assert.equal(
  normalizeDateExpansionUrl('https://cafe.naver.com/f-e/cafes/10342583/articles/156900?boardtype=L&menuid=13&referrerAllArticles=false'),
  normalizeDateExpansionUrl('https://cafe.naver.com/f-e/cafes/10342583/articles/156900?boardtype=L&menuid=264&referrerAllArticles=false'),
  'date expansion dedupe must ignore naver cafe article menu/list query noise',
);
assert.equal(
  dateExpansionKey({
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156900?menuid=13',
    structured_data: { title: '들라/칼오의 재즈업 시즌2 (7-8월 월요일 @경성홀)', date: '2026-07-06' },
  }),
  dateExpansionKey({
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156900?menuid=264',
    structured_data: { title: '들라/칼오의 재즈업 시즌2 (7-8월 월요일 @경성홀)', date: '2026-07-13' },
  }),
  'same naver article and title must share one date expansion key regardless of menu id',
);
const multiSocialRows = [
  {
    id: 'social-1',
    source_url: 'https://www.instagram.com/kyungsunghall/p/KYUNG0704/',
    structured_data: { title: '경성홀 토요 소셜', date: '2026-07-04', event_type: '소셜', activity_type: 'social' },
  },
  {
    id: 'social-2',
    source_url: 'https://www.instagram.com/kyungsunghall/p/KYUNG0704/',
    structured_data: { title: '경성홀 토요 소셜', date: '2026-07-05', event_type: '소셜', activity_type: 'social' },
  },
];
assert.equal(dateExpansionKey(multiSocialRows[0]), '', 'social candidates must not use first-date date expansion keying');
assert.deepEqual(
  collapseDateExpansionRows(multiSocialRows).map((row) => row.id),
  ['social-1', 'social-2'],
  'multi-date social candidates must remain separate',
);
assert.equal(
  shouldSkipDateExpansionCandidate(multiSocialRows[1], [multiSocialRows[0]]).skip,
  false,
  'later social dates from the same source/title must not be skipped by date expansion',
);

const preparedSwing = prepareCandidate(baseCandidate(), { today: TODAY });
assert.equal(preparedSwing.validation.ok, true);
assert.equal(preparedSwing.candidate.id, makeDeterministicId(baseCandidate().source_url, '2026-06-05'));
assertNoVirtualGenreFields(preparedSwing.candidate.structured_data);
assert.equal(preparedSwing.candidate.structured_data.category, 'social');
assert.equal(preparedSwing.candidate.structured_data.genre, '소셜');
assert.equal(preparedSwing.candidate.structured_data.dance_scope, 'swing');
assert.equal(preparedSwing.candidate.structured_data.activity_type, 'social');
const normalizedLegacySocialGenre = prepareCandidate(baseCandidate({
  structured_data: {
    title: '스윙타임 금요 소셜',
    date: '2026-06-05',
    location: '스윙타임',
    event_type: '소셜',
    activity_type: 'social',
    genre: 'DJ,소셜',
    djs: ['DJ Alpha'],
  },
}), { today: TODAY });
assert.equal(normalizedLegacySocialGenre.candidate.structured_data.genre, '소셜', 'legacy DJ/social genre must normalize to the site social genre');
assertNoVirtualGenreFields(normalizedLegacySocialGenre.candidate.structured_data);
const normalizedLegacyClassGenre = prepareCandidate(baseCandidate({
  extracted_text: '스윙 입문 강습 시작일 6월 5일 금요일 20:00.',
  structured_data: {
    title: '스윙 입문 강습',
    date: '2026-06-05',
    event_type: '강습',
    activity_type: 'class',
    genre: '강습,워크숍',
  },
}), { today: TODAY });
assert.equal(normalizedLegacyClassGenre.candidate.structured_data.category, 'class');
assert.equal(normalizedLegacyClassGenre.candidate.structured_data.genre, '기타', 'legacy class/workshop genre must normalize to the site class genre set');
assertNoVirtualGenreFields(normalizedLegacyClassGenre.candidate.structured_data);
const sameDateSocialA = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/KYUNG0704/',
  id_suffix: '경성홀 토요 소셜|DJ Alpha|0',
  extracted_text: '경성홀 2026.07.04 토요 소셜 DJ Alpha 20:00',
  structured_data: { title: '경성홀 토요 소셜 DJ Alpha', date: '2026-07-04', event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'] },
}), { today: TODAY });
const sameDateSocialB = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/KYUNG0704/',
  id_suffix: '경성홀 토요 소셜|DJ Beta|1',
  extracted_text: '경성홀 2026.07.04 토요 소셜 DJ Beta 22:00',
  structured_data: { title: '경성홀 토요 소셜 DJ Beta', date: '2026-07-04', event_type: '소셜', activity_type: 'social', djs: ['DJ Beta'] },
}), { today: TODAY });
assert.notEqual(sameDateSocialA.candidate.id, sameDateSocialB.candidate.id, 'same-day social items from one post must have distinct deterministic IDs');

const oneDayClass = prepareCandidate(baseCandidate({
  source_url: 'https://litt.ly/swingkids',
  extracted_text: '스윙댄스, 시작은 가볍게 원데이 클래스 One-day class. 2026.06.14 피에스타에서 체험 클래스 진행',
  structured_data: {
    title: '스윙키즈 원데이 클래스',
    date: '2026-06-14',
    location: '피에스타',
    event_type: '강습',
  },
}), { today: TODAY });
assert.equal(oneDayClass.validation.ok, true, 'dated swing one-day classes should be accepted');
assertNoVirtualGenreFields(oneDayClass.candidate.structured_data);
assert.equal(oneDayClass.candidate.structured_data.activity_type, 'class');
assert.equal(oneDayClass.candidate.structured_data.dance_scope, 'swing');
assert.equal(oneDayClass.candidate.structured_data.category, 'class');
assert.equal(oneDayClass.candidate.structured_data.genre, '기타');
assert.ok(oneDayClass.validation.taxonomy.tags.includes('oneday'), 'one-day class should keep oneday tag internally for validation');
assert.ok(oneDayClass.validation.taxonomy.tags.includes('workshop'), 'one-day class should also stay discoverable internally as workshop/class special');
assert.ok(oneDayClass.validation.taxonomy.tags.includes('open_class'), 'trial one-day class should map internally to open_class');

const seasonPassSale = prepareCandidate(baseCandidate({
  extracted_text: '스윙타임 6월 정기권 판매 이벤트 2026.06.15부터 사용 가능. 초보도 환영합니다.',
  structured_data: {
    title: '스윙타임 6월 정기권 판매 이벤트',
    date: '2026-06-15',
    location: '스윙타임',
    event_type: '판매이벤트',
  },
}), { today: TODAY });
assert.equal(seasonPassSale.validation.ok, true, 'season pass sale event should be accepted when dated and image-backed');
assert.equal(seasonPassSale.candidate.structured_data.activity_type, 'sale');
assert.equal(seasonPassSale.candidate.structured_data.benefit_eligible, true);
assert.equal(seasonPassSale.candidate.structured_data.benefit_kind, 'season_pass');
assert.equal(benefitSearchMatches(seasonPassSale.candidate, 'season_pass'), true);
assert.equal(benefitSearchMatches(seasonPassSale.candidate, 'free_event'), false);
assert.equal(
  expectedInstagramHandleForSource({
    type: 'benefit_search',
    url: 'https://www.google.com/search?q=site%3Ainstagram.com+정기권',
  }),
  '',
  'benefit search posts must not compare their author with the Google /search path',
);
assert.equal(
  expectedInstagramHandleForSource({
    type: 'instagram',
    url: 'https://www.instagram.com/happyhall2004/',
  }),
  'happyhall2004',
  'known Instagram profile sources should still enforce author matching',
);
assert.equal(
  isStaleBenefitSourcePost({
    publishedAt: '2024-10-14T09:00:00.000Z',
    today: '2026-07-27',
  }),
  true,
  'old search results must not be reinterpreted as current date-bound benefits',
);
assert.equal(
  isStaleBenefitSourcePost({
    publishedAt: '2024-10-14T09:00:00.000Z',
    today: '2026-07-27',
    evergreen: true,
  }),
  false,
  'verified ongoing pass sales may use an older source post',
);
assert.equal(seasonPassSale.candidate.structured_data.category, 'event');
assert.ok(seasonPassSale.validation.taxonomy.tags.includes('sale_event'), 'sale events should keep sale_event tag internally');
assert.ok(seasonPassSale.validation.taxonomy.tags.includes('season_pass'), 'season pass sale should keep season_pass tag internally');

const evergreenSeasonPass = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/swingbar/p/OLDPASS/',
  extracted_text: '스윙바 정기권 가격 안내. 10회권 100,000원, 현재 구매 가능',
  structured_data: {
    title: '스윙바 정기권 가격 안내',
    date: '2024-01-10',
    event_type: '판매',
    activity_type: 'sale',
  },
}), { today: TODAY });
assert.equal(isEvergreenSeasonPassCandidate(evergreenSeasonPass.candidate), true, 'ongoing season-pass sales should be recognized independently of post age');
assert.equal(evergreenSeasonPass.validation.ok, true, 'an old post for an ongoing season-pass sale should remain collectable');
assert.equal(evergreenSeasonPass.candidate.structured_data.date, '2024-01-10', 'ongoing sales should preserve the original post date for chronological review');
assert.equal(evergreenSeasonPass.candidate.structured_data.source_post_date, '2024-01-10', 'the original old post date should remain available for review');
assert.equal(evergreenSeasonPass.candidate.structured_data.ongoing_sale, true, 'ongoing sale metadata should be explicit');
assert.equal(evergreenSeasonPass.candidate.structured_data.benefit_lifecycle, 'evergreen', 'ongoing sale lifecycle should be explicit');

const endedSeasonPass = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/swingbar/p/ENDPASS/',
  extracted_text: '스윙바 시즌권 판매 종료',
  structured_data: {
    title: '스윙바 시즌권 판매 종료',
    date: '2024-01-10',
    event_type: '판매',
    activity_type: 'sale',
  },
}), { today: TODAY });
assert.equal(isEvergreenSeasonPassCandidate(endedSeasonPass.candidate), false, 'ended season-pass sales must not be treated as evergreen');
assert.equal(endedSeasonPass.validation.ok, false, 'ended old sales should still fail the past-date rule');
assert.equal(endedSeasonPass.candidate.structured_data.benefit_lifecycle, undefined, 'ended sales should not be promoted into the benefit list');

const evergreenDiscount = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/swingbar/p/ONGOINGDISCOUNT/',
  extracted_text: '정기권 회원 상시 할인 적용 중',
  structured_data: {
    title: '정기권 회원 상시 할인',
    date: '2024-02-01',
    event_type: '할인',
    activity_type: 'sale',
    location: '스윙바',
  },
}), { today: TODAY });
assert.equal(evergreenDiscount.candidate.structured_data.benefit_kind, 'discount_event');
assert.equal(evergreenDiscount.candidate.structured_data.benefit_lifecycle, 'evergreen');
assert.equal(evergreenDiscount.validation.ok, true, 'explicit ongoing discounts should remain visible after the post date');

const datedDiscount = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/swingbar/p/EARLYBIRD/',
  extracted_text: '7월 10일까지 얼리버드 20% 할인',
  structured_data: {
    title: '얼리버드 할인',
    date: '2024-07-10',
    event_type: '할인',
    activity_type: 'sale',
    location: '스윙바',
  },
}), { today: TODAY });
assert.equal(datedDiscount.candidate.structured_data.benefit_lifecycle, 'date_bound');
assert.equal(datedDiscount.validation.ok, false, 'dated discounts should expire normally');

assert.equal(validateCandidate(baseCandidate({
  source_url: 'https://litt.ly/swingfriends',
  extracted_text: '스윙프렌즈 매주 금, 토, 일 원데이 클래스를 진행합니다. 신청 날짜는 추후 공지됩니다.',
  structured_data: { title: '스윙프렌즈 원데이 클래스', date: '', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'recurring one-day notices without explicit date must not be auto-saved');

const venueNormalized = prepareCandidate(baseCandidate({
  structured_data: {
    title: '경성홀 화요 소셜',
    date: '2026-06-09',
    location: '경성홀(신촌)',
    venue_name: '경성홀 (신촌)',
    event_type: '소셜',
  },
}), { today: TODAY });
assert.equal(venueNormalized.candidate.structured_data.location, '경성홀');
assert.equal(venueNormalized.candidate.structured_data.venue_name, '경성홀');

const weekdayMismatch = prepareCandidate(baseCandidate({
  extracted_text: '■ 스윙타임빠 (7월 28일) 수 소셜 공지',
  structured_data: {
    title: '■ 스윙타임빠 (7월 28일) 수 소셜 공지',
    date: '2026-07-28',
    location: '스윙타임',
    activity_type: 'social',
  },
}), { today: '2026-07-28', nowMinutes: 0 });
assert.equal(weekdayMismatch.validation.ok, false);
assert.ok(weekdayMismatch.validation.errors.some((error) => error.includes('weekday mismatch')));

const classRecruitMisclassifiedAsSocial = prepareCandidate(baseCandidate({
  extracted_text: '앳더사보이 17기 수강생을 모집합니다. 지터벅 강습 신청',
  structured_data: {
    title: '앳더사보이 17기 모집합니다!',
    date: '2026-09-13',
    location: '봉천살롱',
    activity_type: 'social',
  },
}), { today: TODAY });
assert.equal(classRecruitMisclassifiedAsSocial.validation.ok, true);
assert.equal(classRecruitMisclassifiedAsSocial.validation.taxonomy.activity_type, 'recruit');

const namedClassMisclassifiedAsSocial = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/CLASS-SOCIAL/',
  extracted_text: '🎩 경성 클래스 : 소셜을 더 즐기기 위한 1시간',
  structured_data: {
    title: '🎩 경성 클래스 : 소셜을 더 즐기기 위한 1시간',
    date: '2026-08-04',
    location: '경성홀',
    activity_type: 'social',
  },
}), { today: TODAY });
assert.equal(namedClassMisclassifiedAsSocial.validation.ok, true);
assert.equal(namedClassMisclassifiedAsSocial.validation.taxonomy.activity_type, 'class');

const datedSocialWithAdjacentClassNotice = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/WEEKLY-SOCIAL/',
  extracted_text: '7/25 토 DJ 고즈 7/26 일 DJ 뉴야. 7/28 화요일에는 경성 클래스도 함께 진행됩니다.',
  structured_data: {
    title: '경성홀 토요 소셜',
    date: '2026-08-01',
    location: '경성홀',
    activity_type: 'social',
    djs: ['고즈'],
  },
}), { today: TODAY });
assert.equal(datedSocialWithAdjacentClassNotice.validation.ok, true);
assert.equal(datedSocialWithAdjacentClassNotice.validation.taxonomy.activity_type, 'social');

const unsplitWeeklySocialWithClassTaxonomy = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/WEEKLY-MERGED/',
  extracted_text: '7/25 토 DJ 고즈 7/26 일 DJ 뉴야 7/28 화 DJ 메이저. 7/28에는 경성 클래스도 진행됩니다.',
  structured_data: {
    title: '바로 이어지는 화요 소셜을 더 편안하게 즐겨보세요.',
    date: '2026-07-28',
    location: '경성홀',
    event_type: '강습',
    category: 'class',
    activity_type: 'social',
    djs: ['고즈', '뉴야', '메이저'],
  },
}), { today: TODAY });
assert.equal(unsplitWeeklySocialWithClassTaxonomy.validation.ok, false);
assert.ok(unsplitWeeklySocialWithClassTaxonomy.validation.errors.some((error) => error.includes('multi-date multi-DJ')));
assert.ok(unsplitWeeklySocialWithClassTaxonomy.validation.errors.some((error) => error.includes('conflicting class taxonomy')));

const passMisclassifiedAsSocial = prepareCandidate(baseCandidate({
  extracted_text: '스윙타임 수요일 정기권 7, 8, 9월 판매',
  structured_data: {
    title: '스윙타임 정기권 판매',
    date: '2026-07-09',
    location: '스윙타임',
    activity_type: 'social',
  },
}), { today: TODAY });
assert.equal(passMisclassifiedAsSocial.validation.ok, true);
assert.equal(passMisclassifiedAsSocial.validation.taxonomy.activity_type, 'sale');

const anniversaryMisclassifiedAsSocial = prepareCandidate(baseCandidate({
  extracted_text: '스윙피버 24주년 파티 2026년 8월 1일',
  structured_data: {
    title: '스윙피버 24주년 파티',
    date: '2026-08-01',
    location: '스윙잇',
    activity_type: 'social',
  },
}), { today: TODAY });
assert.equal(anniversaryMisclassifiedAsSocial.validation.ok, true);
assert.equal(anniversaryMisclassifiedAsSocial.validation.taxonomy.activity_type, 'event');

const explicitSocialMisclassifiedAsEvent = prepareCandidate(baseCandidate({
  extracted_text: '갤러리 스윙 재즈 소셜 개츠비의 밤',
  structured_data: {
    title: '갤러리 스윙 재즈 소셜 (개츠비의 밤)',
    date: '2026-08-08',
    location: '더샵갤러리',
    activity_type: 'event',
  },
}), { today: TODAY });
assert.equal(explicitSocialMisclassifiedAsEvent.validation.ok, true);
assert.equal(explicitSocialMisclassifiedAsEvent.validation.taxonomy.activity_type, 'social');

const soloJazzSeasonMisclassifiedAsRecruit = prepareCandidate(baseCandidate({
  extracted_text: '로빈 JAZZSEASON Solo Jazz 7/6부터 진행',
  structured_data: {
    title: '로빈 JAZZSEASON Solo Jazz(7/6~)',
    date: '2026-08-03',
    location: '봉천살롱',
    activity_type: 'recruit',
  },
}), { today: TODAY });
assert.equal(soloJazzSeasonMisclassifiedAsRecruit.validation.ok, true);
assert.equal(soloJazzSeasonMisclassifiedAsRecruit.validation.taxonomy.activity_type, 'class');

const malformedDj = prepareCandidate(baseCandidate({
  extracted_text: '스윙타운 토요 소셜',
  structured_data: {
    title: '스윙타운 토요 소셜',
    date: '2026-08-01',
    location: '봉천살롱',
    activity_type: 'social',
    djs: ['사복 2026.08.01 스윙타운 소셜'],
  },
}), { today: TODAY });
assert.equal(malformedDj.validation.ok, false);
assert.ok(malformedDj.validation.errors.some((error) => error.includes('DJ value')));

const dateRangeCaptionFragment = prepareCandidate(baseCandidate({
  extracted_text: '일정 : 7/5~8/16 (6주) 매주 일요일, 8/23 졸업파티',
  structured_data: {
    title: '🔸일정 : 7/5~8/16 (6주) 매주 일요일, 8/23 졸업파티',
    date: '2026-08-16',
    location: '해피홀',
    activity_type: 'event',
  },
}), { today: TODAY });
assert.equal(dateRangeCaptionFragment.validation.ok, false);
assert.ok(dateRangeCaptionFragment.validation.errors.some((error) => error.includes('caption fragment')));

const unsplitMultiDateSocial = prepareCandidate(baseCandidate({
  extracted_text: '6월 20,21일 토,일 소셜 DJ 쓴귤 DJ 캐롤 DJ 쵸코',
  structured_data: {
    title: '6월 20,21일 토,일 소셜 공지',
    date: '2026-06-20',
    location: '스윙타임',
    activity_type: 'social',
    djs: ['쓴귤', '캐롤', '쵸코'],
  },
}), { today: TODAY });
assert.equal(unsplitMultiDateSocial.validation.ok, false);
assert.ok(unsplitMultiDateSocial.validation.errors.some((error) => error.includes('split into one candidate per date')));

const malformedApplicationLinkDj = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/thesocialcluba/p/BAD-DJ/',
  extracted_text: 'Balboa in Social Club 7월 29일 수요일 DJ : Mungun Application link : https://forms.gle/example',
  structured_data: {
    title: 'Balboa in Social Club',
    date: '2026-07-29',
    location: '소셜클럽',
    activity_type: 'social',
    djs: ['Mungun Application link'],
  },
}), { today: TODAY });
assert.equal(malformedApplicationLinkDj.validation.ok, false);
assert.ok(malformedApplicationLinkDj.validation.errors.some((error) => error.includes('DJ value')));

const correctedSocialClubDj = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/thesocialcluba/p/DbR4PJMkzry/',
  extracted_text: '[Balboa in Social club] 날짜 : 7월 29일 (매주 수요일) 장소 : 쏘셜클럽 D J : 멍군',
  structured_data: {
    title: '[Balboa in Social club]',
    date: '2026-07-29',
    location: '소셜클럽',
    venue_name: '소셜클럽',
    venue_provenance: 'source_text',
    activity_type: 'social',
    djs: ['멍군'],
  },
}), { today: TODAY });
assert.equal(correctedSocialClubDj.validation.ok, true);

const swingtownSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'swingtown-cafe');
const swingFriendsCafeSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'swingfriends-cafe');
const swingFriendsInstagramSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'swing_friends');
const swingScandalSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'swingscandal-cafe');
assert.equal(swingtownSource?.venue, '봉천살롱');
assert.equal(swingFriendsCafeSource?.venue, '스윙타임');
assert.equal(swingFriendsInstagramSource?.venue, '스윙타임');
assert.equal(swingScandalSource?.venue, '사보이볼룸');
assert.equal(swingScandalSource?.autoRegistrationPolicy, 'shadow');
assert.equal(
  getAutomationSourceList('swing-daily').find((item) => item.id === 'kyungsunghall')?.autoRegistrationPolicy,
  'shadow',
);
assert.deepEqual(
  getAutomationSourceList('swing-daily')
    .filter((item) => ['neo_swing', 'sosyalclub_swing'].includes(item.id))
    .map((item) => ({ id: item.id, venue: item.venue, policy: item.autoRegistrationPolicy })),
  [
    { id: 'neo_swing', venue: '해피홀', policy: 'shadow' },
    { id: 'sosyalclub_swing', venue: '소셜클럽', policy: 'shadow' },
  ],
);
const socialClubSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'sosyalclub_swing');
assert.equal(socialClubSource?.url, 'https://www.instagram.com/thesocialcluba/');
assert.equal(socialClubSource?.dance_genre, 'balboa');
assert.equal(socialClubSource?.venue, '소셜클럽');
assert.equal(socialClubSource?.autoRegistrationPolicy, 'shadow');
assert.ok(socialClubSource?.runOrder < 0);

const socialClubClassRejected = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/thesocialcluba/p/CLASS1/',
  extracted_text: '다이나믹발보아 클래스 8월 10일 월요일 수업 이후 연습',
  structured_data: {
    title: '다이나믹발보아 클래스',
    date: '2026-08-10',
    location: '소셜클럽',
    activity_type: 'class',
  },
}), { today: TODAY });
assert.equal(socialClubClassRejected.validation.ok, false);
assert.ok(socialClubClassRejected.validation.errors.some((error) => error.includes('activity type')));

const socialClubPostedDateRejected = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/thesocialcluba/p/POSTDATE1/',
  extracted_text: 'Balboa in Social Club 다음 수요일 소셜',
  structured_data: {
    title: 'Balboa in Social Club',
    date: '2026-07-28',
    location: '소셜클럽',
    activity_type: 'social',
    djs: ['아드리안'],
  },
}), { today: TODAY });
assert.equal(socialClubPostedDateRejected.validation.ok, false);
assert.ok(socialClubPostedDateRejected.validation.errors.some((error) => error.includes('weekday')));

const socialClubWednesdayReady = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://www.instagram.com/thesocialcluba/p/WED1/',
  poster_url: 'https://example.com/socialclub.webp',
  extracted_text: 'Balboa in Social Club 7월 29일 수요일 DJ 아드리안',
  structured_data: {
    title: 'Balboa in Social Club',
    date: '2026-07-29',
    location: '소셜클럽',
    venue_name: '소셜클럽',
    venue_provenance: 'source_registry',
    activity_type: 'social',
    djs: ['아드리안'],
  },
}), { today: TODAY });
assert.equal(socialClubWednesdayReady.ready, true);
assert.equal(socialClubWednesdayReady.reasons.some((reason) => reason.includes('98%')), false);
assert.deepEqual(
  Object.fromEntries(
    getAutomationSourceList('swing-daily')
      .filter((item) => ['swingtown-cafe', 'swingfriends-cafe', 'swing_friends', 'sweetyswing-lessons'].includes(item.id))
      .map((item) => [item.id, {
        venue: item.venue,
        policy: item.autoRegistrationPolicy,
        venuePolicy: item.autoRegistrationVenuePolicy,
      }]),
  ),
  {
    'sweetyswing-lessons': { venue: '', policy: 'manual', venuePolicy: 'explicit' },
    'swingtown-cafe': { venue: '봉천살롱', policy: 'shadow', venuePolicy: 'registry-or-explicit' },
    swing_friends: { venue: '스윙타임', policy: 'shadow', venuePolicy: 'registry-or-explicit' },
    'swingfriends-cafe': { venue: '스윙타임', policy: 'shadow', venuePolicy: 'registry-or-explicit' },
  },
);

const scandalVenueNormalized = prepareCandidate(baseCandidate({
  keyword: '스윙스캔들',
  structured_data: {
    title: '스윙스캔들 목요 소셜',
    date: '2026-06-18',
    location: '사보이볼룸(사당)',
    venue_name: '사보이',
    activity_type: 'social',
    djs: ['단미'],
  },
}), { today: TODAY });
assert.equal(scandalVenueNormalized.candidate.structured_data.location, '사보이볼룸');
assert.equal(scandalVenueNormalized.candidate.structured_data.venue_name, '사보이볼룸');

const autoReadyScandal = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/999001?menuid=501',
  poster_url: 'https://example.com/scandal.webp',
  structured_data: {
    title: '스윙스캔들 목요 소셜',
    date: '2026-06-18',
    location: '사보이볼룸',
    venue_name: '사보이볼룸',
    venue_provenance: 'source_registry',
    activity_type: 'social',
    djs: ['단미'],
  },
}), { today: TODAY });
assert.equal(autoReadyScandal.ready, true);

const autoBlockedGenericParty = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/GENERIC1/',
  poster_url: 'https://example.com/party.webp',
  structured_data: {
    title: '🎉 파티',
    date: '2026-08-15',
    location: '경성홀',
    venue_name: '경성홀',
    venue_provenance: 'source_alias',
    activity_type: 'social',
  },
}), { today: TODAY });
assert.equal(autoBlockedGenericParty.ready, false);
assert.ok(autoBlockedGenericParty.reasons.some((reason) => reason.includes('DJ')));

const autoReadyFriendsRegistryVenue = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://www.instagram.com/swing_friends/p/MULTIVENUE1/',
  poster_url: 'https://example.com/friends.webp',
  structured_data: {
    title: '스윙프렌즈 토요 소셜',
    date: '2026-08-15',
    location: '스윙타임',
    venue_name: '스윙타임',
    venue_provenance: 'source_registry',
    activity_type: 'social',
    djs: ['윤슬'],
  },
}), { today: TODAY });
assert.equal(autoReadyFriendsRegistryVenue.ready, true);

const autoReadyFriendsExplicitVenue = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://www.instagram.com/swing_friends/p/MULTIVENUE2/',
  poster_url: 'https://example.com/friends-explicit.webp',
  structured_data: {
    title: '스윙프렌즈 토요 소셜',
    date: '2026-08-15',
    location: '해피홀',
    venue_name: '해피홀',
    venue_provenance: 'source_text',
    activity_type: 'social',
    djs: ['윤슬'],
  },
}), { today: TODAY });
assert.equal(autoReadyFriendsExplicitVenue.ready, true);
assert.equal(autoReadyFriendsExplicitVenue.reasons.some((reason) => reason.includes('98%')), false);

for (const lowQualityTitle of [
  'Instagram의 대전 스윙피버님',
  '💙강습 안내💙',
  '✅ 소셜 댄스 시간',
  '스위티 공지',
  '🎉 파티',
  '강습링크: https://forms.gle/example',
]) {
  const lowQualityCandidate = prepareCandidate(baseCandidate({
    structured_data: {
      title: lowQualityTitle,
      date: '2026-08-01',
      location: '검증장소',
      activity_type: 'class',
    },
  }), { today: TODAY });
  assert.equal(lowQualityCandidate.validation.ok, false, `low-quality title must be rejected: ${lowQualityTitle}`);
}

const sweetyswingSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'sweetyswing-lessons');
assert.equal(sweetyswingSource?.venue, '');
assert.equal(sweetyswingSource?.autoRegistrationVenuePolicy, 'explicit');

const salsa = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/turn_latin_bar/p/SALSA1/',
  extracted_text: '홍턴 살사 소셜 DJ Mambo 2026.06.10',
  structured_data: { title: '홍턴 살사 소셜', date: '2026-06-10', location: '홍턴', djs: ['DJ Mambo'] },
}), { today: TODAY });
assert.equal(salsa.validation.ok, true);
assert.equal(salsa.candidate.structured_data.dance_scope, 'salsa');
assert.equal(salsa.candidate.structured_data.genre, '소셜');
assertNoVirtualGenreFields(salsa.candidate.structured_data);

const bachata = prepareCandidate(baseCandidate({
  source_url: 'https://bsbachata.com/events/2026-bachata',
  extracted_text: '사당 바차타 소셜 2026.06.12 DJ Luis',
  structured_data: { title: '사당 바차타 소셜', date: '2026-06-12', location: '비엔바', djs: ['DJ Luis'] },
}), { today: TODAY });
assert.equal(bachata.validation.ok, true);
assert.equal(bachata.candidate.structured_data.dance_scope, 'bachata');
assert.equal(bachata.candidate.structured_data.genre, '소셜');
assertNoVirtualGenreFields(bachata.candidate.structured_data);

const street = prepareCandidate(baseCandidate({
  source_url: 'https://www.dancecode.kr/dance/view/259',
  extracted_text: '힙합 배틀 참가자 모집 2026.06.20',
  structured_data: { title: 'Beat On Street 참가자 모집', date: '2026-06-20', location: '가산' },
}), { today: TODAY });
assert.equal(street.validation.ok, true);
assert.equal(street.candidate.structured_data.dance_scope, 'street');
assert.equal(street.candidate.structured_data.activity_type, 'recruit');
assert.equal(street.candidate.structured_data.category, 'event');
assert.equal(street.candidate.structured_data.genre, '대회');
assertNoVirtualGenreFields(street.candidate.structured_data);
assert.ok(street.validation.taxonomy.tags.includes('participant'));

const streetOfficialEvent = prepareCandidate(baseCandidate({
  source_url: 'https://www.dancecode.kr/dance/view/270',
  extracted_text: 'BONTTAE VOL.1 올장르 배틀 행사기간 2026년 07월 25일 행사장소 서천군 청소년 문화센터 스트릿댄스 OPEN STYLE BATTLE',
  structured_data: {
    title: 'BONTTAE VOL.1',
    date: '2026-07-25',
    location: '서천군 청소년 문화센터',
    event_type: '행사',
    activity_type: 'event',
    dance_scope: 'street',
    genre_family: 'street',
    dance_genre: 'street',
    tags: ['battle', 'participant'],
  },
}), { today: TODAY });
assert.equal(streetOfficialEvent.validation.ok, true, 'verified DanceCode detail page can be saved as an expanded street event');
assert.equal(streetOfficialEvent.candidate.structured_data.activity_type, 'event');
assert.equal(streetOfficialEvent.candidate.structured_data.genre, '대회');
assertNoVirtualGenreFields(streetOfficialEvent.candidate.structured_data);

const tango = buildCafe24Payload(baseCandidate({
  source_url: 'https://tangotocup.com/competition/65',
  extracted_text: '서울 탱고 대회 TangotoWorld CUP Seoul Preliminary 2026.07.11 Freestyle Tango Studio',
  structured_data: { title: 'TangotoWorld CUP Seoul Preliminary', date: '2026-07-11', location: 'Freestyle Tango Studio', event_type: '행사' },
}), { today: TODAY });
assert.equal(tango.structured_data.dance_scope, 'tango');
assert.equal(tango.structured_data.genre, '대회');
assertNoVirtualGenreFields(tango.structured_data);
assert.equal(validateCandidate(baseCandidate({
  source_url: 'https://tangocalendar.kr/events/milonga-test',
  extracted_text: '서울 탱고 밀롱가 DJ Una 2026.06.21',
  structured_data: { title: '서울 탱고 밀롱가', date: '2026-06-21', location: '서울', djs: ['DJ Una'] },
}), { today: TODAY }).ok, false, 'Tango Calendar hub rows need official source/poster before saving');

assert.equal(getExcludedSourceReason('https://www.meroniswing.com/social-dance'), '사용자 지정 제외 소스: meroniswing.com');
assert.equal(validateCandidate(baseCandidate({ source_url: 'https://www.meroniswing.com/social-dance' }), { today: TODAY }).ok, false);
assert.equal(getExcludedSourceReason('https://batswing.co.kr/'), '사용자 지정 제외 소스: BAT SWING');
assert.equal(validateCandidate(baseCandidate({ source_url: 'https://batswing.co.kr/' }), { today: TODAY }).ok, false);
assert.equal(getExcludedSourceReason('https://www.instagram.com/batswing2003/'), '사용자 지정 제외 소스: BAT SWING');
assert.equal(validateCandidate(baseCandidate({ source_url: 'https://www.instagram.com/batswing2003/p/ABC123/' }), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({
  source_url: 'https://www.salsavida.com/guides/south-korea/seoul/socials/',
  extracted_text: 'Hongdae Bonita Latin Club Socials Seoul Thursday, May 28, 2026 8:00 PM',
  structured_data: { title: 'Hongdae Bonita Latin Club Socials', date: '2026-05-28', location: 'Bonita' },
}), { today: TODAY }).ok, false, 'discovery-only hubs must not be saved directly');

assert.equal(hasBadPosterUrl('https://cdn.example.com/post/p240x240/photo.jpg'), true);
assert.equal(validateCandidate(baseCandidate({
  poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg',
  extracted_text: '2026년 6월 5일 유료 린디합 정규 강습',
  structured_data: { title: '린디합 정규 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'non-social non-benefit candidates still reject thumbnail images');
assert.equal(validateCandidate(baseCandidate({
  poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg',
  extracted_text: '2026년 6월 5일 무료 린디합 체험 강습',
  structured_data: { title: '무료 린디합 체험 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class', benefit_eligible: true, benefit_kind: 'free_event' },
}), { today: TODAY }).ok, true, 'benefit candidates should not be rejected only because the available image is a thumbnail');

assert.equal(validateCandidate(baseCandidate({ structured_data: { title: '과거 이벤트', date: '2026-05-01' } }), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({
  poster_url: '',
  extracted_text: '2026년 6월 5일 유료 린디합 정규 강습',
  structured_data: { title: '린디합 정규 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'non-social candidates without a confirmed benefit still require an image');
assert.equal(isCollectableDate(TODAY, { today: TODAY }), true, 'same-day candidates are collectable without time evidence');
assert.equal(isCollectableDate('2026-05-22', { today: TODAY }), false, 'past candidates remain excluded');
assert.equal(isCollectableDate('2026-05-24', { today: TODAY }), true, 'future candidates remain collectable');
assert.equal(stripNaverCafeMemberPrefix('57F 밍밍 테일'), '테일', 'Naver member grade and nickname must not pollute DJ names');
assert.equal(stripNaverCafeMemberPrefix('85F 스칼라 루비'), '루비', 'Naver member aliases must be removed consistently');
assert.equal(stripNaverCafeMemberPrefix('테일'), '테일', 'plain DJ names must remain unchanged');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.05.23',
  structured_data: { title: '스윙타임 금요 소셜', date: TODAY, event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'] },
}), { today: TODAY }).ok, true, 'same-day candidates pass standard validation without time');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.05.23 11:30',
  structured_data: { title: '스윙타임 금요 소셜', date: TODAY, event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'], time: '11:30', times: ['11:30'] },
}), { today: TODAY }).ok, true, 'same-day validation ignores event time');
const dateOnlyPayload = buildCafe24Payload(baseCandidate({
  extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.05.23 11:30',
  structured_data: { title: '스윙타임 금요 소셜', date: TODAY, event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'], time: '11:30', times: ['11:30'] },
}), { today: TODAY });
assert.equal('time' in dateOnlyPayload.structured_data, false, 'collector payloads must not store time');
assert.equal('times' in dateOnlyPayload.structured_data, false, 'collector payloads must not store time arrays');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: 'K-pop cover dance audition 2026.06.01',
  structured_data: { title: 'K-pop cover audition', date: '2026-06-01' },
}), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({
  source_url: 'https://www.dancecode.kr/dance/view/271',
  extracted_text: '브레이킹 현대무용 융합 공연 티켓 예매 2026.06.13',
  structured_data: { title: '브레이킹 현대무용 융합 공연', date: '2026-06-13', activity_type: 'event' },
}), { today: TODAY }).ok, false, 'art/commercial mixed performance candidates need manual review before collection');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: 'RSF 참가 신청 안내. 얼리버드 입금 마감 5/29. 실제 강습 일정은 추후 공지됩니다.',
  structured_data: { title: 'RSF 스윙 강습 신청 안내', date: '2026-05-29', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'deadline/payment dates must not be accepted as class event dates');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '스윙 입문 강습 시작일 6월 5일 금요일 20:00. 신청은 5월 29일까지.',
  structured_data: { title: '스윙 입문 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, true, 'visible class start dates should still pass even when the post has a separate deadline');
assert.equal(validateCandidate(baseCandidate({
  keyword: '스윙패밀리 강습/행사',
  source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156300?boardtype=L&menuid=13&referrerAllArticles=false',
  extracted_text: '스윙패밀리 32기 졸업공연 안내 2026.06.27 오후 8:00 봉천살롱에서 진행됩니다.',
  structured_data: { title: '스윙패밀리 32기 졸업공연', date: '2026-06-27', event_type: '행사', activity_type: 'event', location: '봉천살롱' },
}), { today: TODAY }).ok, false, 'retired swingfamily sources must not create new candidates');
assert.equal(validateCandidate(baseCandidate({
  keyword: '스윙프렌즈 카페',
  source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/53903?boardtype=L&menuid=85&referrerAllArticles=false',
  extracted_text: '사항 필독말머리[공지사항] 2026년도 2학기 정규수업이 확정되었습니다.(3차 수정) 6월27일 7월4일',
  structured_data: { title: '사항 필독말머리[공지사항] 2026년도 2학기 정규수업이 확정되었습니다.(3차 수정)', date: '2026-06-27', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'naver cafe board chrome and broad schedule notices must be rejected');
assert.equal(validateCandidate(baseCandidate({
  keyword: '스윙스캔들',
  source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/999999?boardtype=L&menuid=501',
  extracted_text: 'DJ 인기멤버 85F 스칼라 부 매니저 1 1:1 채팅 2026.06.13. 스윙스캔들 토요소셜 DJ',
  structured_data: {
    title: 'DJ 인기멤버 85F 스칼라 부 매니저 1 | 2026.06.13. 스윙스캔들 토요소셜 DJ',
    date: '2026-06-13',
    event_type: '소셜',
    activity_type: 'social',
    djs: ['인기멤버 85F 스칼라 부 매니저 1'],
  },
}), { today: TODAY }).ok, false, 'naver cafe author/profile chrome must not become title or DJ');
assert.equal(validateCandidate(baseCandidate({
  keyword: '스윙패밀리 강습/행사',
  source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156147?boardtype=L&menuid=13&referrerAllArticles=false',
  extracted_text: '강습일정 게시글 6월6일 6월20일 6월27일',
  structured_data: { title: '스윙패밀리 강습/행사 강습', date: '2026-06-06', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'generic source-name class fallback titles must not be saved');
assert.equal(validateCandidate(baseCandidate({
  keyword: '해피홀',
  source_url: 'https://www.instagram.com/happyhall2004/p/DZohigakR0I/',
  extracted_text: '6월19일 금햅 DJ 나나씨 DJ time PM 8:30 12,000원',
  structured_data: { title: '무료 라인강습은 없으며,', date: '2026-06-19', event_type: '소셜', activity_type: 'social', djs: ['나나씨'] },
}), { today: TODAY }).ok, false, 'caption fragments must not become automatic event titles');
assert.equal(validateCandidate(baseCandidate({
  keyword: '네오스윙 인스타그램',
  source_url: 'https://www.instagram.com/neo_swing/p/DZo3Vz0qTkb/',
  extracted_text: '금햅 라인강습 쉬어요. 출빠 이벤트 하러 금햅가자 6월19일 소셜 DJ',
  structured_data: { title: '잊지말고 다음주 수업과 소셜에서 만나요 🍀', date: '2026-06-19', event_type: '소셜', activity_type: 'social', djs: ['DJ'] },
}), { today: TODAY }).ok, false, 'instructional caption sentences must not become automatic event titles');
assert.equal(validateCandidate(baseCandidate({
  keyword: '스윙프렌즈 카페',
  source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/mt-test',
  extracted_text: '스윙프렌즈 연합엠티 We Are One 9월 19일 토요일',
  structured_data: { title: '스윙프렌즈 연합엠티 We Are One', date: '2026-09-19', event_type: '행사', activity_type: 'event' },
}), { today: TODAY }).ok, false, 'MT/엠티 posts are explicitly banned from automatic event collection');

assert.ok(textSimilarity('국제 스윙 댄스 페스티벌', '스윙댄스 국제 페스티벌') >= 0.4);
assert.ok(getCollectionSources('swing').length >= 20, 'swing sources should remain broad');
assert.ok(!getCollectionSources('swing').some((source) => source.id.startsWith('swingfamily')), 'retired swingfamily sources must not remain in the registry');
assert.match(
  getExcludedSourceReason('https://cafe.naver.com/f-e/cafes/10342583/articles/156300?boardtype=L&menuid=13') || '',
  /스윙패밀리/,
);
assert.ok(getCollectionSources('swing').some((source) => source.id === 'sweetyswing-lessons'), 'sweetyswing mobile cafe should be in stable registry');
assert.ok(getAutomationSourceList('swing-daily').some((source) => source.id === 'happyhall2004' && source.runOrder < 0), 'happyhall should run early enough to avoid daily budget starvation');
assert.ok(getAutomationSourceList('swing-daily').some((source) => source.id === 'neo_swing' && source.type === 'instagram' && source.saveEnabled), 'neoswing instagram should be part of daily automation');
const priorityOneRunOrder = getAutomationSourceList('swing-daily')
  .filter((source) => source.saveEnabled && source.scope === 'swing' && Number(source.priority) === 1)
  .sort((a, b) => {
    const weight = (source) => {
      if (source.runOrder !== null && source.runOrder !== undefined) return Number(source.runOrder);
      return ({ naver_cafe: 1, daum_cafe: 2, website: 3, instagram: 10 })[source.type] ?? 5;
    };
    return weight(a) - weight(b) || a.name.localeCompare(b.name, 'ko');
  })
  .map((source) => source.id);
assert.ok(priorityOneRunOrder.indexOf('happyhall2004') < priorityOneRunOrder.indexOf('neo_swing'), 'happyhall should still run before later priority-one instagram sources');
assert.ok(priorityOneRunOrder.indexOf('swingscandal-cafe') < priorityOneRunOrder.indexOf('neo_swing'), 'priority-one naver cafe sources should run before later priority-one instagram sources');
const priorityTwoRunOrder = getAutomationSourceList('swing-daily')
  .filter((source) => source.saveEnabled && source.scope === 'swing' && Number(source.priority) === 2)
  .sort((a, b) => {
    const weight = (source) => {
      if (source.runOrder !== null && source.runOrder !== undefined) return Number(source.runOrder);
      return ({ naver_cafe: 1, daum_cafe: 2, website: 3, instagram: 10 })[source.type] ?? 5;
    };
    return weight(a) - weight(b) || a.name.localeCompare(b.name, 'ko');
  })
  .map((source) => source.id);
assert.ok(priorityTwoRunOrder.indexOf('swingtown-cafe') < priorityTwoRunOrder.indexOf('goldenswing'), 'swingtown event board should run before lower-yield priority-two instagram sources');
assert.equal(getAutomationSourceList('swing-daily').some((source) => source.type === 'littly'), false, 'daily automation must exclude littly hubs');
assert.equal(findSourceByUrl('https://www.instagram.com/happyhall2004/p/DZohigakR0I/')?.id, 'happyhall2004', 'instagram source matching should respect account path');
assert.equal(findSourceByUrl('https://www.instagram.com/neo_swing/p/DXa57nvijUI/')?.id, 'neo_swing', 'neoswing instagram posts should not match the first instagram source by hostname only');
assert.ok(dynamicSearchQueries.swing.some((query) => /원데이|체험|오픈\s*클래스/.test(query)), 'swing dynamic search should include one-day/trial class discovery');
assert.ok(dynamicSearchQueries.swing.some((query) => /정기권|무료|판매\s*이벤트/.test(query)), 'swing dynamic search should include sale/free/season-pass discovery');
for (const scope of ['salsa', 'bachata', 'tango', 'street']) {
  assert.ok(dynamicSearchQueries[scope].some((query) => /무료/.test(query)), `${scope} dynamic search should include free-event discovery`);
  assert.ok(dynamicSearchQueries[scope].some((query) => /정기권|멤버십|패스|수강권/.test(query)), `${scope} dynamic search should include pass-sale discovery`);
  assert.ok(
    getAutomationSourceList('expanded-research').some((source) => source.type === 'benefit_search' && source.scope === scope),
    `${scope} expanded research should include a staged benefit search`,
  );
}
const swingBenefitSources = getAutomationSourceList('swing-daily').filter((source) => source.type === 'benefit_search');
assert.equal(swingBenefitSources.length, 16, 'benefit automation should run sixteen focused searches across stages three and four');
assert.equal(swingBenefitSources.filter((source) => source.priority === 3).length, 11, 'stage three should contain free and pass benefit searches');
assert.equal(swingBenefitSources.filter((source) => source.priority === 2).length, 1, 'the known Swingfriends pass source should run before general benefit searches');
assert.equal(swingBenefitSources.filter((source) => source.priority === 4).length, 4, 'stage four should contain discount benefit searches');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-club-free'), 'stage three should search amateur club free benefits');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-bar-pass'), 'stage three should search swing-bar passes');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-discount'), 'stage three should search explicit discounts');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-earlybird'), 'stage three should search early-bird benefits');
assert.equal(getCollectionSources('swing').some((source) => source.id === 'batswing'), false, 'BAT SWING should not be an active collection source');
assert.equal(getAutomationSourceList('swing-daily').some((source) => /batswing/i.test(source.id + source.url)), false, 'daily automation must not include BAT SWING url or handle');
assert.ok(getCollectionSources('street').length >= 5, 'street sources should be expanded');
assert.ok(getCollectionSources('salsa').length >= 5, 'salsa sources should be expanded');
assert.ok(getCollectionSources('tango').length >= 4, 'tango sources should be expanded');
assert.ok(getCollectionSources('tango').some((source) => source.id === 'tango-now' && source.discoveryOnly), 'Tango NOW should be tracked as a read-only tango scene hub');
assert.ok(getCollectionSources('tango').some((source) => source.id === 'tangocalendar' && source.promotionPolicy === 'external_hub_only'), 'Tango Calendar should stay an external scene-map hub');
assert.ok(getCollectionSources('bachata').length >= 1, 'bachata sources should be present');
assert.ok(getAutomationSourceList().every((source) => source.scope === 'swing'), 'daily automation should only run stable swing sources');
assert.ok(getAutomationSourceList().every((source) => source.id), 'automation sources should expose stable source ids for logs');
assert.equal(getAutomationSourceList('swing-daily').some((source) => source.scope === 'tango'), false, 'daily automation must never include tango sources');
assert.ok(getAutomationSourceList('expanded-research').every((source) => source.sourceKind && source.sceneRole && source.promotionPolicy), 'expanded research sources should expose scene-map metadata');
assert.ok(getAutomationSourceList('expanded-research').every((source) => source.scope !== 'swing' && source.saveEnabled === false), 'expanded research should not save candidates by default');
assert.ok(getAutomationSourceList('expanded-research').some((source) => source.id === 'tango-now' && source.saveEnabled === false), 'Tango NOW should be visible in expanded research but not saved');
assert.ok(getAutomationSourceList('expanded-ingestion').some((source) => source.scope === 'salsa' && source.saveEnabled === true), 'expanded ingestion profile can save verified expanded candidates');
assert.ok(getAutomationSourceList('expanded-ingestion').filter((source) => source.discoveryOnly).every((source) => source.saveEnabled === false), 'discovery-only hubs should stay read-only even in expanded ingestion');
assert.ok(getAutomationSourceList('expanded-ingestion').filter((source) => source.promotionPolicy === 'external_hub_only').every((source) => source.saveEnabled === false), 'external hubs should never become direct event rows');

console.log('ingestion standards ok');
