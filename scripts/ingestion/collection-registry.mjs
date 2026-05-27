export const allowedCollectionScopes = ['swing', 'salsa', 'bachata', 'tango', 'street'];

export const excludedSourceRules = [
  {
    id: 'meroni',
    pattern: /^https?:\/\/(www\.)?meroniswing\.com(\/|$)/i,
    reason: '사용자 지정 제외 소스: meroniswing.com',
  },
  {
    id: 'allaboutswing-lesson-page',
    pattern: /^https?:\/\/allaboutswing\.co\.kr\/20(\/|$)/i,
    reason: '사용자 지정 제외 소스: allaboutswing.co.kr/20',
  },
  {
    id: 'batswing',
    pattern: /^https?:\/\/(www\.)?batswing\.co\.kr(\/|$)/i,
    reason: '사용자 지정 제외 소스: BAT SWING',
  },
  { id: 'news', pattern: /(newspim\.com|yna\.co\.kr|newsis\.com|seoul\.co\.kr)/i, reason: '뉴스/보도자료 소스 제외' },
  { id: 'public-office', pattern: /(\.go\.kr|visitkorea\.or\.kr)/i, reason: '공공기관/관광 허브 소스 제외' },
];

export const collectionProfiles = {
  swingDaily: {
    id: 'swing-daily',
    label: '스윙 안정 자동 수집',
    scopes: ['swing'],
    saveExpandedCandidates: false,
    purpose: '매일 자동 실행. 검증된 스윙 소셜/강습/행사만 저장한다.',
  },
  expandedResearch: {
    id: 'expanded-research',
    label: '타장르 씬 조사',
    scopes: ['salsa', 'bachata', 'tango', 'street'],
    saveExpandedCandidates: false,
    purpose: '소스/씬 구조 조사 전용. 후보 저장 없이 출처와 패턴을 검증한다.',
  },
  expandedIngestion: {
    id: 'expanded-ingestion',
    label: '타장르 검증 수집',
    scopes: ['salsa', 'bachata', 'tango', 'street'],
    saveExpandedCandidates: true,
    purpose: '검증 완료된 타장르 소스만 신규 후보로 저장한다.',
  },
  all: {
    id: 'all',
    label: '전체 점검',
    scopes: allowedCollectionScopes,
    saveExpandedCandidates: true,
    purpose: '수동 점검용. 자동 daily 기본값으로 사용하지 않는다.',
  },
};

function resolveProfile(profile = 'swing-daily') {
  const aliases = {
    'swing-daily': 'swingDaily',
    'expanded-research': 'expandedResearch',
    'expanded-ingestion': 'expandedIngestion',
  };
  return aliases[profile] || profile;
}

const source = ({
  id,
  name,
  scope,
  family = scope === 'street' ? 'street' : 'partner',
  genre = scope,
  type,
  url,
  match = url,
  priority = 3,
  savePolicy = 'verified-post-and-image',
  discoveryOnly = false,
  phase = scope === 'swing' ? 'stable' : 'research',
  notes = '',
}) => ({
  id,
  name,
  scope,
  family,
  genre,
  type,
  url,
  match,
  priority,
  savePolicy,
  discoveryOnly,
  phase,
  notes,
});

export const collectionSources = [
  source({ id: 'happyhall2004', name: '해피홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/happyhall2004/', priority: 1 }),
  source({ id: 'swingtimebar', name: '스윙타임', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingtimebar/', priority: 1 }),
  source({ id: 'fiesta_swingdance', name: '피에스타', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/fiesta_swingdance/', priority: 1 }),
  source({ id: 'bongcheonsalon', name: '봉천살롱', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/bongcheonsalon/', priority: 1 }),
  source({ id: 'bebopbar_swing', name: '비밥바', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/bebopbar_swing/', priority: 1 }),
  source({ id: 'luna_swingbar', name: '루나', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/luna_swingbar/', priority: 1 }),
  source({ id: 'inthemood_sillim', name: '인더무드신림', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/inthemood_sillim/', priority: 1 }),
  source({ id: 'dialogue_swing', name: 'Dialogue', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/dialogue_swing/', priority: 1 }),
  source({ id: '243_swingbar', name: '243', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/243_swingbar/', priority: 1 }),
  source({ id: 'asurajang_swing', name: '아수라장', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/asurajang_swing/', priority: 1 }),
  source({ id: 'sosyalclub_swing', name: '쏘셜클럽', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/sosyalclub_swing/', priority: 1 }),
  source({ id: 'swingit_seoul', name: '스윙잇', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingit_seoul/', priority: 1 }),
  source({ id: 'spa_swingdance', name: '스파', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/spa_swingdance/', priority: 1 }),
  source({ id: 'lq_studio_swing', name: 'LQ스튜디오', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/lq_studio_swing/', priority: 1 }),
  source({ id: 'tamnahall', name: '탐나홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/tamnahall/', priority: 2 }),
  source({ id: 'kpdancehall', name: 'KP댄스홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/kpdancehall/', priority: 2 }),
  source({ id: 'stepupdance_swing', name: '스탭업댄스', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/stepupdance_swing/', priority: 2 }),
  source({ id: 'swingscandal-cafe', name: '스윙스캔들', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I', priority: 1 }),
  source({ id: 'kyungsunghall', name: '경성홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/kyungsunghall/', priority: 1 }),
  source({ id: 'gangnam_westies', name: '강남웨스티스', scope: 'swing', genre: 'wcs', type: 'instagram', url: 'https://www.instagram.com/gangnam_westies/', priority: 2 }),
  source({ id: 'swingkids_kr', name: '스윙키즈', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingkids_kr/', priority: 2 }),
  source({ id: 'swingfriends-cafe', name: '스윙프렌즈 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10026855/menus/85?viewType=L', priority: 2 }),
  source({ id: 'swingfactory_kr', name: '스윙팩토리', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingfactory_kr/', priority: 2 }),
  source({ id: 'swingtown-cafe', name: '스윙타운', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/264?viewType=L', priority: 2 }),
  source({ id: 'swingfamily-lessons', name: '스윙패밀리 강습/행사', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L', priority: 1, notes: '스윙 강습/워크숍 핵심 소스. 이미지가 확인된 미래 시작일 강습만 저장' }),
  source({ id: 'sweetyswing-lessons', name: '스위티스윙 공지/신청', scope: 'swing', genre: 'swing', type: 'daum_cafe', url: 'https://m.cafe.daum.net/sweetyswing/5ngW', priority: 2, notes: '모바일 Daum 카페 URL 우선. 미래 시작일 강습만 저장' }),
  source({ id: 'swingholic', name: '스윙홀릭', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingholic/', priority: 2 }),
  source({ id: 'campswingit', name: 'CSI', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/campswingit/', priority: 2 }),
  source({ id: 'badaje_jeju', name: '바다제', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/badaje_jeju/', priority: 2 }),
  source({ id: 'busan_lindy_weekend', name: '부산 린디합 위켄드', scope: 'swing', genre: 'lindyhop', type: 'instagram', url: 'https://www.instagram.com/busan_lindy_weekend/', priority: 2 }),
  source({ id: 'seoulindyfest', name: '서울 린디페스트', scope: 'swing', genre: 'lindyhop', type: 'instagram', url: 'https://www.instagram.com/seoulindyfest/', priority: 2 }),

  source({ id: 'tangocalendar', name: 'Tango Calendar Korea', scope: 'tango', genre: 'tango', type: 'website', url: 'https://tangocalendar.kr/', priority: 1, notes: '이미지가 없는 일정은 공식 원본/포스터 확보 전 저장 금지' }),
  source({ id: 'koreatango', name: 'Korea Tango Cooperative', scope: 'tango', genre: 'tango', type: 'website', url: 'https://www.koreatango.co.kr/', priority: 2 }),
  source({ id: 'eltango_seoul', name: '엘땅고', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/eltango_seoul/', priority: 2 }),
  source({ id: 'casamilonga_seoul', name: '까사밀롱가', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/casamilonga_seoul/', priority: 2 }),
  source({ id: 'tangopeople_korea', name: '탱고피플', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/tangopeople_korea/', priority: 3 }),

  source({ id: 'latin-in-seoul', name: 'Latin in Seoul', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://salsa.atoo.kr/', priority: 1, notes: '살사/바차타 혼합 공지는 본문 기준으로 scope를 재판정' }),
  source({ id: 'place-ocean', name: 'Place Ocean', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.placeocean.kr/', priority: 2 }),
  source({ id: 'sa-latin', name: 'SA Latin', scope: 'salsa', genre: 'salsa', type: 'linktree', url: 'https://linktr.ee/sa.latin.official', priority: 3, discoveryOnly: true, notes: '공식 원본 링크로 들어가 확인 후 저장' }),
  source({ id: 'aksalsa', name: 'AK Salsa', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.aksalsa.com/about-1', priority: 3 }),
  source({ id: 'bsbachata', name: 'BS Bachata', scope: 'bachata', genre: 'bachata', type: 'website', url: 'https://bsbachata.com/', priority: 2 }),
  source({ id: 'turn_latin_bar', name: '턴라틴바', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/turn_latin_bar/', priority: 2 }),
  source({ id: 'bonitasalsabar', name: '보니따살사', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/bonitasalsabar/', priority: 2 }),
  source({ id: 'latin_in_seoul', name: '라틴인서울', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/latin_in_seoul/', priority: 2 }),
  source({ id: 'caribe0804', name: '까리베', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/caribe0804/', priority: 3 }),

  source({ id: 'freezekr-stage', name: 'Freeze KR', scope: 'street', genre: 'street', type: 'website', url: 'https://www.freezekr.com/stage', priority: 1 }),
  source({ id: 'dancecode', name: 'DanceCode', scope: 'street', genre: 'street', type: 'website', url: 'https://www.dancecode.kr/', priority: 1 }),
  source({ id: 'hydance-street', name: 'HY Dance Studio', scope: 'street', genre: 'hiphop', type: 'website', url: 'https://www.hydancestudio.com/class/streetdance', priority: 2 }),
  source({ id: 'hydance-popup', name: 'HY Dance Studio Popup', scope: 'street', genre: 'street', type: 'website', url: 'https://www.hydancestudio.com/class/popupclass', priority: 2 }),
  source({ id: 'edancestreet', name: '이댄스학원', scope: 'street', genre: 'street', type: 'website', url: 'https://e-dance.co.kr/street-dance', priority: 3, notes: '상시 소개 페이지는 저장 금지, 날짜 있는 모집/원데이만 저장' }),
  source({ id: 'flowmaker_official', name: '플로우메이커', scope: 'street', genre: 'street', type: 'instagram', url: 'https://www.instagram.com/flowmaker_official/', priority: 3 }),
  source({ id: 'danceinside_official', name: '댄스인사이드', scope: 'street', genre: 'street', type: 'instagram', url: 'https://www.instagram.com/danceinside_official/', priority: 3 }),
  source({ id: 'justjerkcrew', name: '저스트절크', scope: 'street', genre: 'street', type: 'instagram', url: 'https://www.instagram.com/justjerkcrew/', priority: 3, notes: 'K-pop/상업 코레오만 있는 경우 저장 제외' }),
];

export const dynamicSearchQueries = {
  swing: [
    'site:instagram.com 스윙댄스 소셜 DJ',
    'site:instagram.com 린디합 워크샵 서울',
    'site:instagram.com 발보아 소셜 서울',
    '스윙댄스 파티 서울 2026',
  ],
  salsa: [
    'site:instagram.com 서울 살사 소셜 DJ',
    'site:instagram.com 홍대 살사 바차타 소셜',
    '살사 클래스 모집 서울 2026',
  ],
  bachata: [
    'site:instagram.com 서울 바차타 소셜',
    'site:instagram.com 바차타 클래스 서울',
    '바차타 소셜 서울 2026',
  ],
  tango: [
    'site:instagram.com 서울 탱고 밀롱가 DJ',
    'site:instagram.com 탱고 프랙티카 서울',
    '탱고 밀롱가 서울 2026',
  ],
  street: [
    'site:instagram.com 서울 힙합 워크샵',
    'site:instagram.com 왁킹 팝핑 락킹 워크샵 서울',
    'site:instagram.com 브레이킹 배틀 참가자 모집',
    '스트릿댄스 배틀 서울 2026',
  ],
};

export function getExcludedSourceReason(url = '') {
  const normalized = String(url || '');
  return excludedSourceRules.find((rule) => rule.pattern.test(normalized))?.reason || null;
}

export function getCollectionSources(scope = 'all') {
  return collectionSources
    .filter((item) => scope === 'all' || item.scope === scope)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ko'));
}

export function getCollectionSourcesForProfile(profile = 'swing-daily') {
  const normalized = resolveProfile(profile);
  const selected = collectionProfiles[normalized] || collectionProfiles.swingDaily;
  return collectionSources
    .filter((item) => selected.scopes.includes(item.scope))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ko'));
}

export function findSourceByUrl(url = '') {
  const normalized = String(url || '').toLowerCase();
  return collectionSources.find((item) => {
    if (item.match instanceof RegExp) return item.match.test(url);
    const matchValue = String(item.match || item.url).toLowerCase().replace(/\/$/, '');
    return normalized.startsWith(matchValue) || normalized.includes(new URL(item.url).hostname.replace(/^www\./, ''));
  }) || null;
}

export function getAutomationSourceList(profile = 'swing-daily') {
  const normalized = resolveProfile(profile);
  const selected = collectionProfiles[normalized] || collectionProfiles.swingDaily;
  return getCollectionSourcesForProfile(normalized).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    url: item.url,
    scope: item.scope,
    genre_family: item.family,
    dance_genre: item.genre,
    priority: item.priority,
    discoveryOnly: item.discoveryOnly,
    phase: item.phase,
    automationProfile: selected.id,
    saveEnabled: item.scope === 'swing' || selected.saveExpandedCandidates,
    notes: item.notes,
  }));
}
