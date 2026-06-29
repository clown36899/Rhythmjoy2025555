import assert from 'node:assert/strict';
import {
  buildCafe24Payload,
  hasBadPosterUrl,
  isCollectableDateTime,
  keepFirstEventDateOnly,
  makeDeterministicId,
  prepareCandidate,
  textSimilarity,
  validateCandidate,
} from './ingestion/candidate-utils.mjs';
import { dynamicSearchQueries, findSourceByUrl, getAutomationSourceList, getCollectionSources, getExcludedSourceReason } from './ingestion/collection-registry.mjs';
import {
  collapseDateExpansionRows,
  dateExpansionSkipReason,
  shouldSkipDateExpansionCandidate,
  sortDateExpansionInputs,
} from '../server/cafe24/ingestion-date-expansion.js';

const TODAY = '2026-05-23';

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
  'multi-date social schedule items must keep only the first event date',
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

const preparedSwing = prepareCandidate(baseCandidate(), { today: TODAY });
assert.equal(preparedSwing.validation.ok, true);
assert.equal(preparedSwing.candidate.id, makeDeterministicId(baseCandidate().source_url, '2026-06-05'));
assert.equal(preparedSwing.candidate.structured_data.dance_scope, 'swing');
assert.equal(preparedSwing.candidate.structured_data.activity_type, 'social');

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
assert.equal(oneDayClass.candidate.structured_data.activity_type, 'class');
assert.equal(oneDayClass.candidate.structured_data.dance_scope, 'swing');
assert.ok(oneDayClass.candidate.structured_data.tags.includes('oneday'), 'one-day class should keep oneday tag');
assert.ok(oneDayClass.candidate.structured_data.tags.includes('workshop'), 'one-day class should also stay discoverable as workshop/class special');
assert.ok(oneDayClass.candidate.structured_data.tags.includes('open_class'), 'trial one-day class should map to open_class');

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

const salsa = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/turn_latin_bar/p/SALSA1/',
  extracted_text: '홍턴 살사 소셜 DJ Mambo 2026.06.10',
  structured_data: { title: '홍턴 살사 소셜', date: '2026-06-10', location: '홍턴', djs: ['DJ Mambo'] },
}), { today: TODAY });
assert.equal(salsa.validation.ok, true);
assert.equal(salsa.candidate.structured_data.dance_scope, 'salsa');

const bachata = prepareCandidate(baseCandidate({
  source_url: 'https://bsbachata.com/events/2026-bachata',
  extracted_text: '사당 바차타 소셜 2026.06.12 DJ Luis',
  structured_data: { title: '사당 바차타 소셜', date: '2026-06-12', location: '비엔바', djs: ['DJ Luis'] },
}), { today: TODAY });
assert.equal(bachata.validation.ok, true);
assert.equal(bachata.candidate.structured_data.dance_scope, 'bachata');

const street = prepareCandidate(baseCandidate({
  source_url: 'https://www.dancecode.kr/dance/view/259',
  extracted_text: '힙합 배틀 참가자 모집 2026.06.20',
  structured_data: { title: 'Beat On Street 참가자 모집', date: '2026-06-20', location: '가산' },
}), { today: TODAY });
assert.equal(street.validation.ok, true);
assert.equal(street.candidate.structured_data.dance_scope, 'street');
assert.equal(street.candidate.structured_data.activity_type, 'recruit');
assert.ok(street.candidate.structured_data.tags.includes('participant'));

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

const tango = buildCafe24Payload(baseCandidate({
  source_url: 'https://tangotocup.com/competition/65',
  extracted_text: '서울 탱고 대회 TangotoWorld CUP Seoul Preliminary 2026.07.11 Freestyle Tango Studio',
  structured_data: { title: 'TangotoWorld CUP Seoul Preliminary', date: '2026-07-11', location: 'Freestyle Tango Studio', event_type: '행사' },
}), { today: TODAY });
assert.equal(tango.structured_data.dance_scope, 'tango');
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
assert.equal(validateCandidate(baseCandidate({ poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg' }), { today: TODAY }).ok, false);

assert.equal(validateCandidate(baseCandidate({ structured_data: { title: '과거 이벤트', date: '2026-05-01' } }), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({ poster_url: '' }), { today: TODAY }).ok, false);
assert.equal(isCollectableDateTime(TODAY, '스윙타임 금요 소셜 DJ Alpha', { today: TODAY, nowMinutes: 12 * 60 }), false, 'same-day candidates without explicit future time must not be saved');
assert.equal(isCollectableDateTime(TODAY, '스윙타임 금요 소셜 DJ Alpha 11:30', { today: TODAY, nowMinutes: 12 * 60 }), false, 'same-day candidates whose time has already passed must not be saved');
assert.equal(isCollectableDateTime(TODAY, '스윙타임 금요 소셜 DJ Alpha 오후 8:30', { today: TODAY, nowMinutes: 12 * 60 }), true, 'same-day candidates need explicit future time');
assert.equal(isCollectableDateTime(TODAY, '스윙타임 금요 소셜 신청 마감 23:59', { today: TODAY, nowMinutes: 12 * 60 }), false, 'same-day deadline times must not be treated as event start times');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.05.23',
  structured_data: { title: '스윙타임 금요 소셜', date: TODAY, event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'] },
}), { today: TODAY, nowMinutes: 12 * 60 }).ok, false, 'same-day candidates without time fail standard validation');
assert.equal(validateCandidate(baseCandidate({
  extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.05.23 20:30',
  structured_data: { title: '스윙타임 금요 소셜', date: TODAY, event_type: '소셜', activity_type: 'social', djs: ['DJ Alpha'] },
}), { today: TODAY, nowMinutes: 12 * 60 }).ok, true, 'same-day candidates with future time pass standard validation');
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
}), { today: TODAY }).ok, true, 'swing graduation performances with explicit future date and poster must be collected');
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
assert.ok(getCollectionSources('swing').some((source) => source.id === 'swingfamily-lessons'), 'swing lesson cafe should be in stable registry');
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
assert.ok(priorityOneRunOrder.indexOf('swingfamily-lessons') < priorityOneRunOrder.indexOf('neo_swing'), 'swingfamily graduation/class board should run before later priority-one instagram sources');
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
