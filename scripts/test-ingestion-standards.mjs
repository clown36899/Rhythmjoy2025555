import assert from 'node:assert/strict';
import {
  alignYearlessDatesToPublication,
  buildCafe24Payload,
  classifyConfirmedBenefitEvent,
  collapseSocialCandidateVariants,
  extractBenefitValidityEndDate,
  extractDatedDjSections,
  extractIndependentSocialDateSections,
  extractInstagramCaptionHeadline,
  extractNeoWeeklyClosureDates,
  extractNeoWeeklySocialSchedule,
  extractSeasonPassEvidenceSections,
  filterDeadlineOnlyEventDates,
  hasBadPosterUrl,
  isDeadlineOnlyEventDate,
  isCollectableDate,
  keepFirstEventDateOnly,
  makeDeterministicId,
  mergeSocialScheduleFallbacks,
  prepareCandidate,
  resolveSourceVenueEvidence,
  selectSourceOrderedPosterUrls,
  isEvergreenSeasonPassCandidate,
  isHighConfidenceDatedSocialSchedule,
  isInstagramCaptionClassHeadline,
  stripNaverCafeMemberPrefix,
  stripRepeatedDjContext,
  textSimilarity,
  validateCandidate,
  evaluateAutoRegistrationReadiness,
} from './ingestion/candidate-utils.mjs';
import { buildVenuePassSearchSources, dynamicSearchQueries, findSourceByUrl, findSourceForCandidate, getAutomationSourceList, getCollectionSources, getExcludedSourceReason, normalizeBenefitSearchQuery } from './ingestion/collection-registry.mjs';
import {
  benefitSearchMatches,
  buildBenefitSearchUrls,
  classifyInstagramProfilePage,
  expectedInstagramHandleForSource,
  extractBenefitDocumentUrls,
  extractInstagramPostUrls,
  extractInstagramProfileUrls,
  instagramAuthorMatches,
  instagramPostMatchesExpectedHandle,
  isDirectInstagramPostMediaUrl,
  isNaverAdministrativeNoticeText,
  isNaverScheduleOverviewText,
  isVerifiedInstagramFallbackProfile,
  isStaleBenefitSourcePost,
  mergeBenefitSearchTargets,
  naverScheduleOverviewPriority,
  normalizeInstagramPostUrl,
  shouldOpenInstagramCircuit,
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
import {
  getIngestionCandidateExclusionReason,
  isVenueRentalAvailabilityNotice,
} from '../server/cafe24/ingestion-candidate-policy.js';
import {
  buildIngestionProgressState,
  catchupInstagramPostLimit,
  mergeSeenInstagramPosts,
  reorderSourcesForResume,
  selectUnseenInstagramPosts,
  shouldAdvanceInstagramCheckpoint,
} from './ingestion/ingestion-progress.mjs';

const TODAY = '2026-05-23';

assert.deepEqual(
  reorderSourcesForResume([{ id: 'done' }, { id: 'remaining-b' }, { id: 'remaining-a' }], ['remaining-a', 'remaining-b']).map((source) => source.id),
  ['remaining-a', 'remaining-b', 'done'],
  'an interrupted priority run must resume its recorded sources first',
);
assert.equal(catchupInstagramPostLimit(2, '', new Date('2026-08-10T00:00:00Z')), 2, 'a fresh progress state must keep the configured post window so the first run can finish');
assert.equal(catchupInstagramPostLimit(2, '2026-08-07T00:00:00Z', new Date('2026-08-10T00:00:00Z')), 6, 'three days of downtime must widen the catch-up window deterministically');
assert.equal(catchupInstagramPostLimit(2, '2026-08-09T00:00:00Z', new Date('2026-08-10T00:00:00Z')), 2, 'a current schedule keeps its normal post window');
assert.equal(buildIngestionProgressState({ remainingSources: [], completed: true, now: new Date('2026-08-10T00:00:00Z') }).lastCompletedAt, '2026-08-10T00:00:00.000Z');
assert.deepEqual(
  selectUnseenInstagramPosts(['new', 'seen', 'older'], ['seen'], 2),
  ['new', 'older'],
  'Instagram collection must continue from per-source checked posts instead of a fixed newest-N window',
);
assert.deepEqual(
  mergeSeenInstagramPosts(['seen', 'old'], ['new', 'seen']),
  ['new', 'seen', 'old'],
  'completed Instagram posts must advance the per-source checkpoint without losing prior history',
);
assert.equal(shouldAdvanceInstagramCheckpoint(['swingpopseoul: one-day info has no explicit future date']), true, 'a handled parse miss must not freeze the whole Instagram source checkpoint');
assert.equal(shouldAdvanceInstagramCheckpoint(['post candidate-id: HTTP 500']), false, 'a persistence failure must keep the Instagram post retryable');
assert.equal(shouldAdvanceInstagramCheckpoint(['auto-register candidate-id: HTTP 422']), false, 'an automatic-registration failure must keep the Instagram post retryable');
assert.deepEqual(
  alignYearlessDatesToPublication(
    ['2027-05-09', '2027-05-16'],
    '5월 9일, 5월 16일 무료 워크숍 후기',
    '2025-05-17T03:00:00.000Z',
  ),
  ['2025-05-09', '2025-05-16'],
  'revisiting an old yearless post must not roll its past dates into a fake future year',
);
assert.deepEqual(
  alignYearlessDatesToPublication(
    ['2025-04-01', '2027-05-16'],
    '2025년 4월 1일 공지 · 5월 16일 무료 워크숍 후기',
    '2025-05-17T03:00:00.000Z',
  ),
  ['2025-04-01', '2025-05-16'],
  'an explicit year elsewhere in an old post must not prevent yearless dates from aligning to publication',
);

assert.equal(
  extractInstagramCaptionHeadline('Kyungsunghall_ 경성홀 on Instagram: "🇰🇷 광복절 특별 워크숍\n행자 & 칼요와 함께합니다"'),
  '🇰🇷 광복절 특별 워크숍',
  'localized Instagram titles must expose the actual first caption line',
);
assert.equal(
  isInstagramCaptionClassHeadline('Kyungsunghall_ 경성홀 on Instagram: "🇰🇷 광복절 특별 워크숍\n워크숍 뒤 토요 소셜"'),
  true,
  'an explicit class headline must outrank a social mention later in the caption',
);
assert.equal(
  isInstagramCaptionClassHeadline('Kyungsunghall_ 경성홀 on Instagram: "This Week at Kyungsung Hall\n토요 소셜 DJ 북실"'),
  false,
  'a weekly social headline must not become a class because of its body text',
);
assert.equal(
  instagramPostMatchesExpectedHandle('https://www.instagram.com/kyungsunghall/p/Dbu7wPmSv9d/', 'kyungsunghall'),
  true,
  'profile-owned Instagram permalinks must remain eligible',
);
assert.equal(
  instagramPostMatchesExpectedHandle('https://www.instagram.com/allaboutswing_official/reel/DbyceuJTSTn/', 'kyungsunghall'),
  false,
  'recommended or linked posts from another handle must not consume the source post window',
);
assert.equal(
  instagramPostMatchesExpectedHandle(
    'https://www.instagram.com/dreambal_balboa/p/Db58GUYj0CS/',
    ['inthemoodsillim', 'dreambal_balboa'],
  ),
  true,
  'a specifically configured Instagram co-author must remain eligible from the official venue profile',
);
assert.equal(
  instagramPostMatchesExpectedHandle(
    'https://www.instagram.com/unrelated_account/p/Db58GUYj0CS/',
    ['inthemoodsillim', 'dreambal_balboa'],
  ),
  false,
  'unconfigured Instagram authors must remain excluded even when co-author support is enabled',
);
assert.equal(isVerifiedInstagramFallbackProfile({
  expectedHandle: 'luna_swingbar',
  title: 'Page Not Found - Imginn',
  bodyText: 'Imginn Content Not Found Recommended posts',
  url: 'https://imginn.com/luna_swingbar/',
}), false, 'an Imginn not-found page must not turn unrelated recommendations into source posts');
assert.equal(isVerifiedInstagramFallbackProfile({
  expectedHandle: 'swingtimebar',
  title: 'swingtimebar (@swingtimebar) photos',
  bodyText: 'swingtimebar public posts',
  url: 'https://imginn.com/swingtimebar/',
}), true, 'an identity-matched fallback profile may expose source-owned post links');
assert.equal(classifyInstagramProfilePage({
  url: 'https://www.instagram.com/example/',
  title: 'Instagram',
  bodyText: 'Log in Sign up About Help Press API',
}), 'login_wall', 'a normal anonymous Instagram login wall must not be treated as a global bot block');
assert.equal(classifyInstagramProfilePage({
  url: 'https://www.instagram.com/challenge/',
  title: 'Instagram',
  bodyText: 'Please wait a few minutes before you try again',
}), 'global_block', 'an Instagram challenge response must remain eligible for the safety circuit');
assert.equal(shouldOpenInstagramCircuit('instagram login wall; public profile fallback unavailable'), false, 'a source login wall must not cascade into skipping unrelated profiles');
assert.equal(shouldOpenInstagramCircuit('instagram global access blocked or challenge required'), true, 'only a confirmed global block response may advance the Instagram circuit');
assert.equal(
  isDirectInstagramPostMediaUrl('https://scontent.cdninstagram.com/image.jpg?_nc_sid=58cdad&ig_cache_key=direct'),
  true,
  'the opened Instagram post media marker must identify direct post images',
);
assert.equal(
  isDirectInstagramPostMediaUrl('https://scontent.cdninstagram.com/recommendation.jpg?_nc_sid=18de74'),
  false,
  'Instagram recommendation images must not pollute the opened post evidence',
);
assert.equal(
  isNaverScheduleOverviewText('필독 2026년 8월 스윙타운 전체 일정표'),
  true,
  'a pinned monthly schedule must be recognized as event-bearing source material',
);
assert.equal(
  isNaverAdministrativeNoticeText('필독 2026년 8월 스윙타운 전체 일정표'),
  false,
  'a real monthly schedule must not be discarded only because it is pinned as 필독',
);
assert.equal(
  isNaverAdministrativeNoticeText('[운영진공지] 강사 모집 공고'),
  true,
  'administrative notices must remain excluded from event scans',
);
assert.ok(
  naverScheduleOverviewPriority('[공지] 스윙타운 2026년 7,8월 일정', '2026-08-14')
    < naverScheduleOverviewPriority('[공지] 7/8월 정규 강습 신청 및 일정', '2026-08-14'),
  'the current mixed monthly calendar must outrank a class-application schedule in the same menu',
);

assert.equal(
  stripRepeatedDjContext('안토니 스윙타운 DJ 안토니 20'),
  '안토니',
  'repeated Swingtown title context must not become a second DJ name',
);
assert.equal(
  stripRepeatedDjContext('파인 스윙타운 DJ 파인 20'),
  '파인',
  'repeated Swingtown DJ context must collapse to the grounded DJ token',
);
assert.equal(stripRepeatedDjContext('뉴야'), '뉴야', 'ordinary DJ names must stay unchanged');
assert.equal(
  stripRepeatedDjContext('제이 Ballba Social 인더무드신림'),
  '제이',
  'poster OCR activity and venue text after a DJ name must not become part of the DJ name',
);
assert.equal(instagramAuthorMatches({
  expectedHandle: 'bongcheonsalon',
  ogTitle: '봉천살롱 • Instagram 사진 및 동영상',
  metaDescription: '봉천살롱의 새로운 게시물',
  profileHrefs: ['/bongcheonsalon/', '/other_commenter/'],
}), true, 'the visible article author link must verify a localized Instagram display name');
assert.equal(instagramAuthorMatches({
  expectedHandle: 'bongcheonsalon',
  ogTitle: '추천 게시물',
  metaDescription: '다른 계정의 게시물',
  profileHrefs: ['/unrelated_account/'],
}), false, 'a different visible Instagram author must remain blocked');
assert.equal(instagramAuthorMatches({
  expectedHandles: ['inthemoodsillim', 'dreambal_balboa'],
  ogTitle: 'dreambal_balboa 및 inthemoodsillim • Instagram',
  profileHrefs: ['/dreambal_balboa/', '/inthemoodsillim/', '/commenter/'],
}), true, 'an explicitly configured official co-author must pass article author verification');

const mixedTimebarSocialAndPassText = `■ 스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.
■ 스윙타임빠 (7월 2일) 수 소셜 공지
- 수요일
저녁 7시30분부터 소셜이 진행 됩니다.
DJ "훔머" PM 8:15~10:15

■ 타임빠소셜 실시간 스트리밍 서비스 안내
수, 일요일 소셜은 스윙프렌즈 유튜브채널에서 실시간으로 현장을 보실수 있습니다.

■ 스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.
수탐 정기권은 기간내에 타임빠 수요일 소셜의 입장을 할 수 있는 수요 정기권입니다.
3개월 단위(14주:7월1일~9월30일)로 가격은 6만원(한달에 2만원)으로 판매합니다.`;
const mixedTimebarPassSections = extractSeasonPassEvidenceSections(mixedTimebarSocialAndPassText);
assert.equal(mixedTimebarPassSections.length, 1, 'a mixed cafe post must isolate its season-pass sale block');
assert.match(mixedTimebarPassSections[0], /정기권\(7,8,9월\)/, 'the focused pass block must retain the sale title');
assert.doesNotMatch(mixedTimebarPassSections[0], /DJ\s*["“”']?훔머/i, 'the focused pass block must not inherit the neighbouring social DJ');
assert.doesNotMatch(mixedTimebarPassSections[0], /스트리밍\s*서비스/, 'the focused pass block must not inherit an unrelated notice');
const mixedTimebarSocialSections = extractDatedDjSections({
  text: mixedTimebarSocialAndPassText,
  today: '2026-06-30',
});
assert.deepEqual(
  mixedTimebarSocialSections.map(({ date }) => date),
  ['2026-07-02'],
  'the dated social in a mixed pass post must remain an independent event section',
);

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
const orderedTimebarSections = extractIndependentSocialDateSections({
  today: '2026-08-14',
  title: '■ 스윙타임빠 (8월 15,16일) 토,일 소셜 공지',
  text: "- 토요일\nDJ '이정' PM 8:15~10:15\n- 일요일\nDJ '캐롤' PM 7:30~10:30",
});
assert.deepEqual(
  orderedTimebarSections.map(({ date, dayLabel, titleEvidence, normalizedDateEvidence }) => ({
    date,
    dayLabel,
    titleEvidence,
    normalizedDateEvidence,
  })),
  [
    {
      date: '2026-08-15',
      dayLabel: '토요일',
      titleEvidence: '■ 스윙타임빠 (8월 15,16일) 토,일 소셜 공지',
      normalizedDateEvidence: '2026년 8월 15일',
    },
    {
      date: '2026-08-16',
      dayLabel: '일요일',
      titleEvidence: '■ 스윙타임빠 (8월 15,16일) 토,일 소셜 공지',
      normalizedDateEvidence: '2026년 8월 16일',
    },
  ],
  'date-scoped evidence must retain the exact compact heading, weekday, and deterministic expanded date',
);
assert.deepEqual(
  selectSourceOrderedPosterUrls([
    { src: 'https://example.com/dj-ijeong.png', w: 1000, h: 1000 },
    { src: 'https://example.com/dj-carol-portrait.jpg', w: 1441, h: 1440 },
  ], 3),
  [
    'https://example.com/dj-ijeong.png',
    'https://example.com/dj-carol-portrait.jpg',
  ],
  'multi-image source order must not be reversed by the larger later attachment',
);
assert.deepEqual(
  mergeSocialScheduleFallbacks(
    [
      { date: '2026-08-15', day: '토', djs: ['이정'] },
      { date: '2026-08-16', day: '일', djs: ['캐롤'] },
    ],
    [{ date: '2026-08-15', day: '토', djs: ['이정', '캐롤'] }],
  ).map(({ date, djs }) => ({ date, djs })),
  [
    { date: '2026-08-15', djs: ['이정'] },
    { date: '2026-08-16', djs: ['캐롤'] },
  ],
  'a broad fallback section must not merge the following day DJ into an already date-scoped session',
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
  'complete date/DJ pairs must take precedence over post-wide class wording',
);
assert.equal(
  isHighConfidenceDatedSocialSchedule([
    { date: '2026-08-02', djs: ['훔머'] },
  ]),
  true,
  'one complete date/DJ pair must be enough to isolate a social from an adjacent event notice',
);
assert.equal(
  stripRepeatedDjContext('사보이지기 ★테일★님 입니다'),
  '테일',
  'a source operator role before a decorated DJ name must not replace the actual DJ',
);
const swingtownMonthlySections = extractDatedDjSections({
  today: '2026-08-21',
  text: `☀️스윙타운 2026년 7,8월 일정☀️
[☀️8월 일정☀️]
· 8월 22일 (토)
→ DJ 조춘식이
· 8월 25일 (화)
→ DJ 미우
· 8월 29일 (토)
→ DJ 후안
→ 12회 졸업파티`,
});
assert.deepEqual(
  swingtownMonthlySections.map(({ date, segment }) => ({
    date,
    dj: segment.match(/DJ\s+([A-Za-z가-힣]+)/i)?.[1] || '',
  })),
  [
    { date: '2026-08-22', dj: '조춘식이' },
    { date: '2026-08-25', dj: '미우' },
    { date: '2026-08-29', dj: '후안' },
  ],
  'the official Swing Town monthly format must split every future date and DJ',
);
const swingtownMonthlySource = findSourceForCandidate({
  sourceId: 'swingtown-schedule-cafe',
  url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156478',
});
assert.equal(swingtownMonthlySource?.autoRegistrationPolicy, 'shadow', 'the official Swing Town monthly source must use the existing shadow gate');
assert.deepEqual(swingtownMonthlySource?.autoRegistrationAllowedActivityTypes, ['social'], 'only monthly schedule social sessions may enter automatic registration');
const swingtownGraduationReadiness = evaluateAutoRegistrationReadiness({
  source_id: 'swingtown-schedule-cafe',
  source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156478',
  _date_scoped_social_evidence: true,
  extracted_text: '봉천살롱 8월 29일 DJ 후안 12회 졸업파티',
  structured_data: {
    title: '스윙타운 월간 일정 토요 소셜',
    date: '2026-08-29',
    day: '토',
    event_type: '소셜',
    activity_type: 'social',
    location: '봉천살롱',
    venue_name: '봉천살롱',
    venue_provenance: 'source_text',
    djs: ['후안'],
    genre: '졸공',
    evidence_scope: 'date_scoped_social',
  },
}, { today: '2026-08-21' });
assert.equal(swingtownGraduationReadiness.ready, false, 'a monthly graduation party must remain a manual-review candidate');
assert.ok(
  swingtownGraduationReadiness.reasons.includes('special event classification requires manual review instead of social auto-registration'),
  'the collector must expose the exact special-event policy blocker before calling registration',
);
const scopedMultiDateSocial = prepareCandidate(baseCandidate({
  _date_scoped_social_evidence: true,
  extracted_text: `8월 1,2일\n일요일 소셜이 진행 됩니다. DJ '훔머'`,
  structured_data: {
    title: '스윙타임 일요 소셜',
    date: '2026-08-02',
    location: '스윙타임',
    activity_type: 'social',
    djs: ['훔머'],
  },
}), { today: TODAY });
assert.equal(scopedMultiDateSocial.validation.ok, true, 'a date-list header is valid after the collector isolates one weekday/DJ section');
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
assert.deepEqual(
  extractNeoWeeklySocialSchedule({
    today: '2026-08-15',
    text: `👒 8월 2주 위클리네오
🎧 금햅 DJ 메이저
🎧 일햅 DJ 익두
[8월 14일 -금햅]
[8월 [ 16일 일햅] ]
해피홀 서울특별시 서대문구 명물길 37 지하`,
  }).map(({ date, day, djs, normalizedDateEvidence }) => ({ date, day, djs, normalizedDateEvidence })),
  [{ date: '2026-08-16', day: '일', djs: ['익두'], normalizedDateEvidence: '2026년 8월 16일' }],
  'Neo weekly OCR must tolerate a bracket between the month and day and retain normalized date evidence',
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
  extracted_text: '이번주 DJ는 사보이지기 ★테일★님 입니다. 무료라인강습이 없는 날 입니다. 입장료는 별도입니다.',
  structured_data: { title: 'DJ 테일 | 해피홀 금요 소셜' },
}), null, 'attributive Korean free-class negation must not be benefit eligible');
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
  ['파티비 안내 - 얼리버드 5인: 6,000원 - 사전 신청: 12,000원 - 현장 신청: 20,000원', null],
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
  extractBenefitDocumentUrls([
    '/url?q=https%3A%2F%2Fm.cafe.daum.net%2Fsweetyswing%2F5lqO%2F1732%3Fsvc%3DAXZ',
    'https://cafe.daum.net/sweetyswing/5lqO/1732?svc=cafeapi',
    'https://m.blog.naver.com/goldenswing/222973823693',
    'https://www.instagram.com/p/ABC123/',
  ], 'https://www.google.com/search?q=출빠+정기권'),
  [
    'https://m.cafe.daum.net/sweetyswing/5lqO/1732',
    'https://m.blog.naver.com/goldenswing/222973823693',
  ],
  'benefit discovery should keep canonical original cafe/blog documents and dedupe search variants',
);
const benefitSearchUrls = buildBenefitSearchUrls('스윙타임 정기권', 'https://www.google.com/search?q=%EC%8A%A4%EC%9C%99%ED%83%80%EC%9E%84+%EC%A0%95%EA%B8%B0%EA%B6%8C');
assert.equal(new URL(benefitSearchUrls[0]).searchParams.get('tbs'), 'sbd:1', 'benefit search must inspect newest results first');
assert.equal(new URL(benefitSearchUrls[0]).searchParams.get('hl'), 'ko', 'benefit search must use Korean result language');
assert.equal(new URL(benefitSearchUrls[0]).searchParams.get('gl'), 'kr', 'benefit search must use the Korean result region');
assert.equal(new URL(benefitSearchUrls[1]).searchParams.has('tbs'), false, 'benefit search must retain a relevance fallback');
assert.deepEqual(
  mergeBenefitSearchTargets(
    { documentUrls: ['https://m.cafe.daum.net/sweetyswing/5lqO/NEW'], postUrls: [], profileUrls: [] },
    { documentUrls: ['https://m.cafe.daum.net/sweetyswing/5lqO/OLD', 'https://m.cafe.daum.net/sweetyswing/5lqO/NEW'], postUrls: [], profileUrls: [] },
  ).documentUrls,
  ['https://m.cafe.daum.net/sweetyswing/5lqO/NEW', 'https://m.cafe.daum.net/sweetyswing/5lqO/OLD'],
  'newest search targets must stay ahead of relevance results after dedupe',
);
assert.deepEqual(
  mergeBenefitSearchTargets(
    { documentUrls: ['latest-1', 'latest-2', 'latest-3'], postUrls: [], profileUrls: [] },
    { documentUrls: ['relevance-1', 'relevance-2'], postUrls: [], profileUrls: [] },
  ).documentUrls,
  ['latest-1', 'relevance-1', 'latest-2', 'relevance-2', 'latest-3'],
  'latest and relevance result modes must not starve each other before the scan limit',
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
assert.equal(imageOptionalDiscount.validation.ok, false, 'confirmed discount candidates require an image before collection');
assert.match(imageOptionalDiscount.validation.errors.join(' '), /poster_url or imageData required/, 'image-less discounts must fail closed');
const imageOptionalSocial = prepareCandidate(baseCandidate({
  source_id: 'swingtimebar',
  poster_url: '',
  imageData: '',
  extracted_text: '2026년 8월 21일 스윙타임 금요 소셜 DJ Test',
  structured_data: {
    title: '금요 스윙 소셜',
    date: '2026-08-21',
    location: '스윙타임',
    venue_name: '스윙타임',
    venue_provenance: 'source_registry',
    event_type: '소셜',
    activity_type: 'social',
    djs: ['DJ Test'],
  },
}), { today: TODAY });
assert.equal(imageOptionalSocial.validation.ok, true, 'a dated official social with a verified venue and DJ may use the venue map instead of a poster');
assert.equal(
  evaluateAutoRegistrationReadiness(imageOptionalSocial.candidate, { today: TODAY }).ready,
  true,
  'an image-less grounded social must remain eligible for automatic registration',
);
const thumbnailOptionalSocial = prepareCandidate(baseCandidate({
  source_id: 'neo_swing',
  source_url: 'https://www.instagram.com/neo_swing/p/Db445CCqdzm/',
  poster_url: 'https://cdninstagram.com/photo.jpg?stp=c1.0.722.720a_dst-jpg_e35',
  imageData: '',
  extracted_text: '2026년 8월 16일 네오스윙 일햅 소셜 장소 해피홀 DJ 익두',
  structured_data: {
    title: '네오스윙 일요 소셜',
    date: '2026-08-16',
    location: '해피홀',
    venue_name: '해피홀',
    venue_provenance: 'source_registry',
    event_type: '소셜',
    activity_type: 'social',
    djs: ['익두'],
  },
}), { today: TODAY });
assert.equal(thumbnailOptionalSocial.validation.ok, true, 'a bad Instagram thumbnail must not block a date-and-DJ-grounded social');
assert.equal(thumbnailOptionalSocial.candidate.poster_url, '', 'a cropped social thumbnail must be discarded before persistence so the venue map is used');
assert.equal(
  evaluateAutoRegistrationReadiness(thumbnailOptionalSocial.candidate, { today: TODAY }).ready,
  true,
  'discarding a bad thumbnail must preserve automatic-registration readiness for a grounded social',
);
const profileOnlyImageFreeSocial = prepareCandidate(baseCandidate({
  source_id: 'swingtimebar',
  source_url: 'https://www.instagram.com/swingtimebar/',
  poster_url: '',
  imageData: '',
}), { today: TODAY });
assert.equal(profileOnlyImageFreeSocial.validation.ok, false, 'image-free social registration still requires an actual source post URL');
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
assert.equal(imageOptionalFreeBenefit.validation.ok, false, 'free benefit candidates require an image before collection');
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
  true,
  'past ongoing benefit posts must not remain visible in the current benefit list',
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
  shouldHidePastCandidate({
    structured_data: {
      date: '2026-07-25',
      benefit_eligible: true,
      benefit_kind: 'discount_event',
    },
    manual_recovery_until: '2026-07-30',
  }, { today: '2026-07-26', tab: 'free' }),
  true,
  'manual recovery must not reopen a past benefit in the current benefit tab',
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
  classifyConfirmedBenefitEvent({
    extracted_text: '8월 4일 화요일 저녁 8시 스윙 소셜 DJ 안토니',
    structured_data: { title: '스윙타운 DJ 안토니', fee: '15,000원' },
  }),
  null,
  'ordinary paid socials discovered beside a benefit must not inherit that benefit',
);
assert.equal(
  classifyConfirmedBenefitEvent({
    extracted_text: '정기권 구매자는 8월 4일 소셜 무료 입장',
    structured_data: { title: '정기권 무료 소셜 혜택' },
  }),
  'season_pass',
  'a social may remain in a season-pass source only when its own evidence confirms the pass benefit',
);
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
  true,
  'evergreen metadata must not bypass stale benefit-source checks',
);
assert.equal(seasonPassSale.candidate.structured_data.category, 'event');
assert.ok(seasonPassSale.validation.taxonomy.tags.includes('sale_event'), 'sale events should keep sale_event tag internally');
assert.ok(seasonPassSale.validation.taxonomy.tags.includes('season_pass'), 'season pass sale should keep season_pass tag internally');

const socialSeasonPassSale = prepareCandidate(baseCandidate({
  source_url: 'https://m.cafe.daum.net/sweetyswing/5lqO/1765',
  extracted_text: '스윙타임빠 수요일 정기권을 판매합니다. 기간 내 수요일 소셜 입장을 할 수 있는 정기권입니다. 7월 1일~9월 30일',
  structured_data: {
    title: '스윙타임빠 수요일 정기권(7,8,9월) 판매',
    date: '2026-06-30',
    event_type: '판매이벤트',
  },
}), { today: TODAY });
assert.equal(socialSeasonPassSale.candidate.structured_data.activity_type, 'sale');
assert.equal(socialSeasonPassSale.candidate.structured_data.category, 'social', 'a pass may retain its social top-level category while sale remains the independent activity');
assert.equal(socialSeasonPassSale.candidate.structured_data.genre, '소셜');

const imageFreeSocialSeasonPassSale = prepareCandidate(baseCandidate({
  source_url: 'https://m.cafe.daum.net/sweetyswing/5lqO/1765',
  poster_url: '',
  extracted_text: mixedTimebarPassSections[0],
  structured_data: {
    title: '스윙타임빠 수요일 타임빠 정기권(7,8,9월) 판매',
    date: '2026-06-30',
    event_type: '판매이벤트',
    activity_type: 'sale',
    location: '스윙타임',
  },
}), { today: '2026-06-30' });
assert.equal(imageFreeSocialSeasonPassSale.validation.ok, false, 'a season pass without an image must not enter the review queue');
assert.equal(imageFreeSocialSeasonPassSale.candidate.structured_data.benefit_kind, 'season_pass');
assert.ok(imageFreeSocialSeasonPassSale.validation.errors.some((error) => /poster_url or imageData required/i.test(error)), 'image-free pass candidates must fail closed');

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
assert.equal(evergreenSeasonPass.validation.ok, false, 'an old ongoing season-pass post must not bypass the future-only collection rule');
assert.equal(
  getIngestionCandidateExclusionReason(evergreenSeasonPass.candidate, { today: TODAY }),
  `past event date: 2024-01-10 < ${TODAY}`,
  'the shared server ingestion gate must reject the same past ongoing benefit',
);
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

const datedPassProduct = prepareCandidate(baseCandidate({
  source_url: 'https://m.cafe.daum.net/sweetyswing/5lqO/1732',
  extracted_text: '스윙타임빠 2개월 정기권(4,5월)을 판매합니다. 4월 8일~6월 7일, 가격 13만원',
  structured_data: {
    title: '스윙타임빠 정기권(4,5월) 판매',
    date: '2026-04-08',
    event_type: '판매',
    activity_type: 'sale',
    dance_scope: 'swing',
    dance_genre: 'swing',
    genre_family: 'partner',
  },
}), { today: '2026-08-03' });
const samePassDifferentReviewDate = prepareCandidate(baseCandidate({
  source_url: 'https://m.cafe.daum.net/sweetyswing/5lqO/1732',
  extracted_text: '스윙타임빠 2개월 정기권(4,5월)을 판매합니다. 4월 8일~6월 7일, 가격 13만원',
  structured_data: {
    title: '스윙타임빠 정기권(4,5월) 판매',
    date: '2026-08-03',
    event_type: '판매',
    activity_type: 'sale',
    dance_scope: 'swing',
    dance_genre: 'swing',
    genre_family: 'partner',
  },
}), { today: '2026-08-03' });
assert.equal(extractBenefitValidityEndDate(datedPassProduct.candidate.extracted_text, { today: '2026-08-03' }), '2026-06-07');
assert.equal(datedPassProduct.validation.ok, false, 'an expired pass validity window must not remain collectable');
assert.equal(datedPassProduct.candidate.structured_data.ongoing_sale, undefined, 'expired pass products must not be marked as ongoing');
assert.ok(datedPassProduct.validation.errors.some((error) => error.includes('expired benefit validity')));
assert.equal(datedPassProduct.candidate.structured_data.activity_type, 'sale', 'pass wording must win over adjacent social wording');
assert.equal(datedPassProduct.candidate.id, samePassDifferentReviewDate.candidate.id, 'the same pass source URL must dedupe independently of the review date');

const currentDatedPassProduct = prepareCandidate(baseCandidate({
  source_url: 'https://m.cafe.daum.net/sweetyswing/5lqO/2000',
  extracted_text: '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다. 기간은 7월 1일~9월 30일입니다.',
  structured_data: {
    title: '스윙타임빠 수요일 타임빠 정기권(7,8,9월) 판매',
    date: '2026-06-09',
    event_type: '판매',
    activity_type: 'sale',
    dance_scope: 'swing',
    dance_genre: 'swing',
    genre_family: 'partner',
  },
}), { today: '2026-08-03' });
assert.equal(extractBenefitValidityEndDate(currentDatedPassProduct.candidate.extracted_text, { today: '2026-08-03' }), '2026-09-30');
assert.equal(currentDatedPassProduct.validation.ok, false, 'a pass with a past candidate date must not be collected even while its validity window remains open');
assert.equal(currentDatedPassProduct.candidate.structured_data.ongoing_sale, true);

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
assert.equal(evergreenDiscount.validation.ok, false, 'explicit ongoing discounts must not bypass the future-only collection rule');

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
assert.equal(explicitSocialMisclassifiedAsEvent.validation.ok, false, 'social classification alone is insufficient without a DJ or operating detail');
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

const koreanDjParticleMisparse = prepareCandidate(baseCandidate({
  extracted_text: '8월 14일 해피홀 금요 소셜 DJ는 메이저님입니다',
  structured_data: {
    title: '해피홀 금요 소셜',
    date: '2026-08-14',
    location: '해피홀',
    activity_type: 'social',
    djs: ['는'],
  },
}), { today: '2026-08-14' });
assert.equal(koreanDjParticleMisparse.validation.ok, false, 'a Korean topic particle after the DJ label must never become a DJ name');
assert.ok(koreanDjParticleMisparse.validation.errors.some((error) => error.includes('DJ value')));

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
const swingtimeSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'swingtimebar');
const bongcheonSalonSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'bongcheonsalon');
const inTheMoodSource = getAutomationSourceList('swing-daily').find((item) => item.id === 'inthemood_sillim');
assert.equal(swingtownSource?.venue, '봉천살롱');
assert.equal(
  bongcheonSalonSource?.regularSocialExceptionSourceId,
  'swingtown-cafe',
  'Bongcheon Salon closure notices must target the Swing Town recurring-social rule',
);
assert.equal(swingFriendsCafeSource?.venue, '스윙타임');
assert.equal(swingFriendsInstagramSource?.venue, '스윙타임');
assert.equal(swingScandalSource?.venue, '사보이볼룸');
assert.equal(swingScandalSource?.autoRegistrationPolicy, 'shadow');
assert.equal(swingtimeSource?.venue, '스윙타임');
assert.equal(swingtimeSource?.autoRegistrationPolicy, 'shadow');
assert.deepEqual(swingtimeSource?.autoRegistrationAllowedActivityTypes, ['social']);
assert.equal(inTheMoodSource?.url, 'https://www.instagram.com/inthemoodsillim/');
assert.equal(inTheMoodSource?.venue, '인더무드신림');
assert.equal(inTheMoodSource?.autoRegistrationPolicy, 'shadow');
assert.deepEqual(inTheMoodSource?.autoRegistrationAllowedActivityTypes, ['social']);
assert.deepEqual(inTheMoodSource?.instagramPostAuthorHandles, ['dreambal_balboa']);
assert.equal(
  findSourceForCandidate({
    sourceId: 'inthemood_sillim',
    url: 'https://www.instagram.com/dreambal_balboa/p/Db58GUYj0CS/',
  })?.id,
  'inthemood_sillim',
  'the official DreamBal co-authored post must retain the InTheMood source policy',
);
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
assert.equal(prepareCandidate(baseCandidate({
  structured_data: {
    title: '스윙타임빠 수요일 소셜',
    date: '2026-08-05',
    location: '스윙타임빠',
    activity_type: 'social',
    djs: ['훔머'],
  },
}), { today: TODAY }).candidate.structured_data.location, '스윙타임');
assert.equal(prepareCandidate(baseCandidate({
  structured_data: {
    title: 'Swing Friends Saturday Social',
    date: '2026-08-15',
    location: 'HAPPY HALL',
    activity_type: 'social',
    djs: ['유광'],
  },
}), { today: TODAY }).candidate.structured_data.location, '해피홀');

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

const autoReadySwingtimeWithoutImage = evaluateAutoRegistrationReadiness(baseCandidate({
  source_url: 'https://www.instagram.com/swingtimebar/p/NOIMAGE1/',
  poster_url: '',
  imageData: '',
  extracted_text: '스윙타임빠 8월 2일 일요일 소셜 DJ 훔머',
  structured_data: {
    title: '스윙타임 일요 소셜',
    date: '2026-08-02',
    location: '스윙타임',
    venue_name: '스윙타임',
    venue_provenance: 'source_registry',
    activity_type: 'social',
    djs: ['훔머'],
  },
}), { today: TODAY });
assert.equal(autoReadySwingtimeWithoutImage.ready, true, 'a named-DJ social from an actual official post may auto-register without an image and use the venue map');

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

const benefitSearchOfficialSourceBlocked = evaluateAutoRegistrationReadiness(baseCandidate({
  source_id: 'benefit-search-swingfriends-pass',
  discovery_source_id: 'benefit-search-swingfriends-pass',
  discovery_source_type: 'benefit_search',
  source_url: 'https://www.instagram.com/swing_friends/p/PASSDISCOVERY1/',
  poster_url: 'https://example.com/pass.webp',
  extracted_text: '스윙프렌즈 8월 정기권 판매 2026년 8월 1일부터 신청 가능',
  structured_data: {
    title: '스윙프렌즈 8월 정기권 판매',
    date: '2026-08-01',
    location: '스윙타임',
    venue_name: '스윙타임',
    venue_provenance: 'source_registry',
    activity_type: 'sale',
  },
}), { today: TODAY });
assert.equal(benefitSearchOfficialSourceBlocked.ready, false, 'benefit-search discoveries must never inherit official-source auto-registration');
assert.ok(benefitSearchOfficialSourceBlocked.reasons.some((reason) => reason.includes('manual approval')));

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
assert.equal(hasBadPosterUrl('https://cdninstagram.com/photo.jpg?stp=c0.0.1440.1440a_dst-jpg_e35_s1440x1440'), false, 'a 1440px Instagram rendition is not a thumbnail merely because its delivery URL carries crop coordinates');
assert.equal(hasBadPosterUrl('https://cdninstagram.com/photo.jpg?stp=c0.0.1000.999a_dst-jpg_e35'), false, 'a near-1000px Instagram original rendition remains usable');
assert.equal(hasBadPosterUrl('https://cdninstagram.com/photo.jpg?stp=c1.0.722.720a_dst-jpg_e35'), true, 'a sub-900px cropped rendition remains blocked');
assert.equal(validateCandidate(baseCandidate({
  poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg',
  extracted_text: '2026년 6월 5일 유료 린디합 정규 강습',
  structured_data: { title: '린디합 정규 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class' },
}), { today: TODAY }).ok, false, 'non-social non-benefit candidates still reject thumbnail images');
assert.equal(validateCandidate(baseCandidate({
  poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg',
  extracted_text: '2026년 6월 5일 무료 린디합 체험 강습',
  structured_data: { title: '무료 린디합 체험 강습', date: '2026-06-05', event_type: '강습', activity_type: 'class', benefit_eligible: true, benefit_kind: 'free_event' },
}), { today: TODAY }).ok, false, 'benefit candidates must reject thumbnail-only images');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '2026년 6월 5일 경성홀 토요 소셜에서 함께 즐겨보세요',
  structured_data: { title: '경성홀 토요 소셜', date: '2026-06-05', location: '경성홀', event_type: '소셜', activity_type: 'social', djs: [] },
}), { today: TODAY }).ok, false, 'a generic social mention without a DJ or operating detail must be rejected');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '2026년 6월 5일 경성홀 토요 소셜 입장료 10,000원',
  structured_data: { title: '경성홀 토요 소셜', date: '2026-06-05', location: '경성홀', event_type: '소셜', activity_type: 'social', djs: [] },
}), { today: TODAY }).ok, true, 'concrete operating evidence may ground a social without a named DJ');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '2026년 6월 5일 경성홀 강습 후 토요 소셜',
  structured_data: { title: '바로 이어지는 토요 소셜에서 직접 즐기고 활용해보세요.', date: '2026-06-05', location: '경성홀', event_type: '소셜', activity_type: 'social', djs: ['DJ Test'] },
}), { today: TODAY }).ok, false, 'instructional caption fragments must not become social titles');

const collapsedSocialVariants = collapseSocialCandidateVariants([
  baseCandidate({
    id: 'social-subset',
    structured_data: { title: '스윙타임 토요 소셜 DJ 비비비', date: '2026-06-06', location: '스윙타임', event_type: '소셜', activity_type: 'social', djs: ['비비비'] },
  }),
  baseCandidate({
    id: 'social-superset',
    structured_data: { title: '스윙타임 토요 소셜 DJ 비비비, 메이져', date: '2026-06-06', location: '스윙타임', event_type: '소셜', activity_type: 'social', djs: ['비비비', '메이져'] },
  }),
]);
assert.deepEqual(collapsedSocialVariants.map((candidate) => candidate.id), ['social-superset'], 'same-source social DJ subsets must collapse to the richer schedule row');

assert.equal(validateCandidate(baseCandidate({ structured_data: { title: '과거 이벤트', date: '2026-05-01' } }), { today: TODAY }).ok, false);
const rentalAvailabilityNotice = baseCandidate({
  source_url: 'https://www.instagram.com/kyungsunghall/p/Damg6VxktkS',
  extracted_text: '경성홀 8월 대관 가능일정 안내입니다. 빈 날짜는 DM으로 문의해 주세요.',
  structured_data: {
    title: '경성홀 8월 대관 가능일정',
    date: '2026-06-05',
    location: '경성홀',
    activity_type: 'event',
  },
});
assert.equal(isVenueRentalAvailabilityNotice(rentalAvailabilityNotice), true, 'venue rental availability schedules are non-event notices');
assert.equal(
  getIngestionCandidateExclusionReason(rentalAvailabilityNotice, { today: TODAY }),
  'non-event venue rental availability notice',
  'the shared server gate must reject the reported Kyungsung Hall rental post',
);
assert.equal(
  validateCandidate(rentalAvailabilityNotice, { today: TODAY }).ok,
  false,
  'rental availability notices must not enter any ingestion profile',
);
assert.equal(
  getIngestionCandidateExclusionReason({
    discovery_source_type: 'benefit_search',
    published_at: '2025-05-17T03:00:00.000Z',
    extracted_text: '5월 16일 무료 워크숍 후기',
    structured_data: { title: '무료 워크숍', date: '2027-05-16' },
  }, { today: '2026-08-11' }),
  'event date is implausibly far after source publication: 2025-05-17 -> 2027-05-16',
  'the server must reject a stale yearless post rolled into a fake future year',
);
assert.equal(
  getIngestionCandidateExclusionReason({
    discovery_source_type: 'benefit_search',
    published_at: '2025-12-01T03:00:00.000Z',
    extracted_text: '2026년 9월 1일 무료 체험 강습',
    structured_data: { title: '무료 체험 강습', date: '2026-09-01' },
  }, { today: '2026-08-11' }),
  'stale benefit source post: 2025-12-01',
  'old benefit-search sources must be rejected even when their candidate date is still in the future',
);
const reservableDanceEvent = baseCandidate({
  extracted_text: '2026년 6월 5일 경성홀 린디합 원데이 클래스, 사전 예약 가능',
  structured_data: {
    title: '경성홀 린디합 원데이 클래스',
    date: '2026-06-05',
    location: '경성홀',
    event_type: '강습',
    activity_type: 'class',
  },
});
assert.equal(isVenueRentalAvailabilityNotice(reservableDanceEvent), false, 'ordinary dance-event reservations must not be mistaken for venue rental availability');
assert.equal(validateCandidate(reservableDanceEvent, { today: TODAY }).ok, true, 'a future reservable dance event must remain collectable');
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
const neoClassAnnouncement = [
  '네오스윙 141기 강습안내',
  '일정 : 8/30 ~ 10/18 (6주) 매주 일요일, 10/25 졸업파티',
  '장소 : 강습별 상이 (신촌 일대)',
  '신청 방법 : 8/18(화) 14시부터, 네오스윙 다음카페',
].join('\n');
assert.equal(
  isDeadlineOnlyEventDate(neoClassAnnouncement, '2026-08-18', 'class'),
  true,
  'a labeled application-opening date must stay a registration date even when class words are nearby',
);
assert.equal(
  isDeadlineOnlyEventDate(neoClassAnnouncement, '2026-08-30', 'class'),
  false,
  'the explicitly labeled class schedule start must remain an event date',
);
assert.deepEqual(
  filterDeadlineOnlyEventDates(
    ['2026-08-18', '2026-08-30', '2026-10-18', '2026-10-25'],
    neoClassAnnouncement,
    'class',
  ),
  ['2026-08-30', '2026-10-18', '2026-10-25'],
  'candidate date selection must discard application dates before choosing the first class session',
);
const inTheMoodSlowSocialNotice = [
  'Slow Social 2026.08.22(토)',
  '슬로우소셜 사전신청 https://litt.ly/sllim',
  'Lindyhop Social DJ 비비비',
].join('\n');
assert.equal(
  isDeadlineOnlyEventDate(inTheMoodSlowSocialNotice, '2026-08-22', 'social'),
  false,
  'a date directly labeled by Social must remain the event date even when an application link follows',
);
assert.deepEqual(
  filterDeadlineOnlyEventDates(['2026-08-22'], inTheMoodSlowSocialNotice, 'social'),
  ['2026-08-22'],
  'the InTheMood social date must survive deadline filtering',
);
const nativeVenueAliases = [
  [/봉천\s*살롱|bongcheon/i, '봉천살롱'],
  [/루나|luna/i, '루나'],
  [/인더무드|in\s*the\s*mood/i, '인더무드신림'],
];
assert.deepEqual(
  resolveSourceVenueEvidence({
    text: '스윙타운 DJ 루나 2026.08.18. 스윙타운 소셜 DJ',
    sourceVenue: '봉천살롱',
    aliases: nativeVenueAliases,
    djs: ['루나'],
  }),
  { venue: '봉천살롱', provenance: 'source_registry' },
  'a DJ name that is also a venue alias must not override the official fixed venue',
);
assert.deepEqual(
  resolveSourceVenueEvidence({
    text: '2026.08.18 소셜 장소: 루나 DJ 루나',
    sourceVenue: '봉천살롱',
    aliases: nativeVenueAliases,
    djs: ['루나'],
  }),
  { venue: '루나', provenance: 'source_text' },
  'an explicitly labeled venue may still override the source default even when it matches the DJ name',
);
assert.deepEqual(
  resolveSourceVenueEvidence({
    text: 'DJ 루나와 함께하는 소셜 장소 인더무드',
    sourceVenue: '봉천살롱',
    aliases: nativeVenueAliases,
    djs: ['루나'],
  }),
  { venue: '인더무드신림', provenance: 'source_text' },
  'skipping a DJ-only alias must continue searching for a later explicit venue alias',
);
assert.deepEqual(
  resolveSourceVenueEvidence({
    text: '네오스윙 141기 장소 : 강습별 상이 (신촌 일대)',
    sourceVenue: '해피홀',
    aliases: nativeVenueAliases,
  }),
  { venue: '', provenance: 'explicit_variable' },
  'a post that explicitly says venues vary must not inherit a fixed source venue',
);
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
assert.equal(findSourceForCandidate({
  sourceId: 'swingfriends-happyhall-cafe',
  url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/56130',
})?.id, 'swingfriends-happyhall-cafe', 'an explicit board source id must survive canonical Naver article URLs that omit the menu id');
assert.equal(findSourceByUrl('https://m.cafe.daum.net/sweetyswing/5lqO/1759')?.id, 'sweetyswing-timebar-pass', 'timebar pass articles must map to the direct manual-review source');
const timebarPassSource = getAutomationSourceList('swing-daily').find((source) => source.id === 'sweetyswing-timebar-pass');
assert.equal(timebarPassSource?.type, 'daum_cafe');
assert.match(timebarPassSource?.url || '', /\/5lqO\/search\?query=/);
assert.equal(timebarPassSource?.autoRegistrationPolicy, 'manual');
assert.deepEqual(timebarPassSource?.autoRegistrationAllowedActivityTypes, []);
assert.ok(dynamicSearchQueries.swing.some((query) => /원데이|체험|오픈\s*클래스/.test(query)), 'swing dynamic search should include one-day/trial class discovery');
assert.ok(dynamicSearchQueries.swing.some((query) => /정기권|무료|판매\s*이벤트/.test(query)), 'swing dynamic search should include sale/free/season-pass discovery');
assert.ok(dynamicSearchQueries.swing.includes('출빠 정기권'), 'swing benefit discovery should include the high-yield attendance-pass query');
assert.ok(dynamicSearchQueries.swing.includes('스윙바 정기권 OR 시즌권 OR 월정액'), 'swing pass discovery must not be restricted to Instagram');
for (const scope of ['salsa', 'bachata', 'tango', 'street']) {
  assert.ok(dynamicSearchQueries[scope].some((query) => /무료/.test(query)), `${scope} dynamic search should include free-event discovery`);
  assert.ok(dynamicSearchQueries[scope].some((query) => /정기권|멤버십|패스|수강권/.test(query)), `${scope} dynamic search should include pass-sale discovery`);
  assert.ok(
    getAutomationSourceList('expanded-research').some((source) => source.type === 'benefit_search' && source.scope === scope),
    `${scope} expanded research should include a staged benefit search`,
  );
}
const swingBenefitSources = getAutomationSourceList('swing-daily').filter((source) => source.type === 'benefit_search');
const derivedVenuePassSources = buildVenuePassSearchSources(getCollectionSources('swing'));
assert.equal(normalizeBenefitSearchQuery('site:instagram.com/swing_friends 정기권'), 'swing_friends 정기권');
assert.ok(swingBenefitSources.every((source) => !/\bsite:instagram\.com\b/i.test(source.query)), 'all benefit searches must include indexed cafe/blog documents instead of being Instagram-only');
assert.equal(derivedVenuePassSources.length, 8, 'known swing venues should generate eight focused pass searches');
assert.ok(derivedVenuePassSources.some((source) => source.query === '스윙타임 정기권'), 'known venues must automatically produce a focused latest pass query');
assert.ok(derivedVenuePassSources.some((source) => source.query === '스윙243 정기권'), 'a newly verified venue route must participate in focused benefit discovery');
assert.ok(derivedVenuePassSources.some((source) => source.query === '인더무드신림 정기권'), 'the corrected InTheMood venue route must participate in focused benefit discovery');
assert.ok(derivedVenuePassSources.every((source) => !source.query.startsWith('site:')), 'derived venue searches must include indexed cafe documents');
assert.equal(swingBenefitSources.length, 16 + derivedVenuePassSources.length, 'benefit automation should include the base searches and generated venue searches');
assert.equal(swingBenefitSources.filter((source) => source.priority === 3).length, 11 + derivedVenuePassSources.length, 'stage three should contain free and pass benefit searches');
assert.equal(swingBenefitSources.filter((source) => source.priority === 2).length, 1, 'the known Swingfriends pass source should run before general benefit searches');
assert.equal(swingBenefitSources.filter((source) => source.priority === 4).length, 4, 'stage four should contain discount benefit searches');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-club-free'), 'stage three should search amateur club free benefits');
assert.ok(swingBenefitSources.some((source) => source.id === 'benefit-search-bar-pass'), 'stage three should search swing-bar passes');
assert.equal(swingBenefitSources.find((source) => source.id === 'benefit-search-bar-pass')?.query.startsWith('site:'), false, 'swing-bar pass search must include indexed cafe documents');
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
