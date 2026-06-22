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
    pattern: /(^https?:\/\/(www\.)?batswing\.co\.kr(\/|$)|instagram\.com\/batswing2003\b)/i,
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
  sourceKind = discoveryOnly ? 'hub' : 'origin',
  sceneRole = scope === 'swing' ? 'stable_ingestion' : 'scene_research',
  promotionPolicy = discoveryOnly ? 'external_hub_only' : 'verified_original_required',
  runOrder = null,
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
  sourceKind,
  sceneRole,
  promotionPolicy,
  runOrder,
  notes,
});

export const collectionSources = [
  source({ id: 'happyhall2004', name: '해피홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/happyhall2004/', priority: 1, runOrder: -1.0 }),
  source({ id: 'neo_swing', name: '네오스윙 인스타그램', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/neo_swing/', priority: 1, notes: '네오스윙 Linktree에서 공식 채널로 확인. Daum 카페 공지는 이미지 없는 글이 많아 포스터가 있는 Instagram 원본을 우선 확인' }),
  source({ id: 'swingtimebar', name: '스윙타임', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingtimebar/', priority: 1 }),
  source({ id: 'fiesta_swingdance', name: '피에스타', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/fiesta_swingdance/', priority: 1 }),
  source({ id: 'bongcheonsalon', name: '봉천살롱', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/bongcheonsalon/', priority: 1 }),
  source({ id: 'bebopbar_swing', name: '비밥바', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/bebopbar_swing/', priority: 1 }),
  source({ id: 'luna_swingbar', name: '루나', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/luna_swingbar/', priority: 1 }),
  source({ id: 'inthemood_sillim', name: '인더무드신림', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/inthemood_sillim/', priority: 1 }),
  source({ id: 'dialogue_swing', name: 'Dialogue', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/dialogue_swing/', priority: 1 }),
  source({ id: 'swingpopseoul', name: '스윙팝', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingpopseoul/', priority: 1, notes: 'Dialogue 수요일 소셜/KP 강습 원본 후보. 날짜와 이미지가 있는 포스트만 저장' }),
  source({ id: 'asurajang_swing', name: '아수라장', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/asurajang_swing/', priority: 1 }),
  source({ id: 'sosyalclub_swing', name: '쏘셜클럽', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/sosyalclub_swing/', priority: 1 }),
  source({ id: 'swingit_seoul', name: '스윙잇', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingit_seoul/', priority: 1 }),
  source({ id: 'daejeon_swingfever', name: '대전 스윙피버', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/daejeon.swingfever/', priority: 1, notes: '대전 스윙잇/피버 공식 인스타. Linktree에서 공식 SNS로 확인됨' }),
  source({ id: 'spa_swingdance', name: '스파', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/spa_swingdance/', priority: 1 }),
  source({ id: 'lq_studio_swing', name: 'LQ스튜디오', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/lq_studio_swing/', priority: 1 }),
  source({ id: 'tamnahall', name: '탐나홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/tamnahall/', priority: 2 }),
  source({ id: 'kpdancehall', name: 'KP댄스홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/kpdancehall/', priority: 2 }),
  source({ id: 'stepupdance_swing', name: '스탭업댄스', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/stepupdance_swing/', priority: 2 }),
  source({ id: 'swingscandal-cafe', name: '스윙스캔들', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I', priority: 1 }),
  source({ id: 'swingscandal-littly', name: '스윙스캔들 원데이 허브', scope: 'swing', genre: 'swing', type: 'littly', url: 'https://litt.ly/hi_swingscandal', priority: 1, sourceKind: 'one_day_hub', notes: '스윙스캔들 원데이/정규강습/워크샵 링크허브. 날짜와 이미지가 명확한 활성 카드만 자동 후보화' }),
  source({ id: 'kyungsunghall', name: '경성홀', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/kyungsunghall/', priority: 1 }),
  source({ id: 'gangnam_westies', name: '강남웨스티스', scope: 'swing', genre: 'wcs', type: 'instagram', url: 'https://www.instagram.com/gangnam_westies/', priority: 2 }),
  source({ id: 'allaboutswing_official', name: '올어바웃스윙 공식 인스타', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/allaboutswing_official/', priority: 2, notes: '천안올어스/경성홀/대전반 축을 보강하는 공식 SNS. /20 제외 규칙은 유지' }),
  source({ id: 'swingcats20', name: '스윙캣츠클럽', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingcats20/', priority: 2, notes: 'Linktree 기준 스윙캣츠 공식 인스타. 루나/대전·세종 소셜 원본 후보' }),
  source({ id: 'swingkids_kr', name: '스윙키즈', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingkids_kr/', priority: 2 }),
  source({ id: 'swingkids-oneday-littly', name: '스윙키즈 원데이 허브', scope: 'swing', genre: 'swing', type: 'littly', url: 'https://litt.ly/swingkids', priority: 1, sourceKind: 'one_day_hub', notes: '스윙 원데이/입문 링크허브. 날짜와 이미지가 명확한 활성 카드만 자동 후보화' }),
  source({ id: 'swingkids-linktree', name: '스윙키즈 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/swingkids_', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '검색 노출에서 공식 인스타/네이버카페/레벨별 신청 경로 확인. 저장은 연결된 원본 포스트에서만 수행' }),
  source({ id: 'balboaland-instagram', name: '발보아랜드 인스타그램', scope: 'swing', genre: 'balboa', type: 'instagram', url: 'https://www.instagram.com/balboa_land/', priority: 2, notes: '발보아랜드 Linktree에서 확인한 공식 인스타. 피에스타 토요일 발보아 소셜 원본 후보' }),
  source({ id: 'swingfriends-cafe', name: '스윙프렌즈 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10026855/menus/85?viewType=L', priority: 2 }),
  source({ id: 'swingfriends-oneday-littly', name: '스윙프렌즈 원데이 허브', scope: 'swing', genre: 'swing', type: 'littly', url: 'https://litt.ly/swingfriends', priority: 1, sourceKind: 'one_day_hub', notes: '스윙 원데이/체험 클래스 링크허브. 반복 안내는 기록만 하고 날짜 있는 활성 카드만 자동 후보화' }),
  source({ id: 'swingfriends-site', name: '스윙프렌즈 공식 웹사이트', scope: 'swing', genre: 'swing', type: 'website', url: 'https://www.swingfriends.com/', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'official_site', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: 'Daily Swing에서 확인된 공식 사이트. 이미지 카드가 있으나 현 수집기는 웹사이트 카드 파서가 없어 우선 원본 경로/수동 확인용' }),
  source({ id: 'swing_friends', name: '스윙프렌즈 인스타그램', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swing_friends/', priority: 2, notes: 'Daily Swing 기준 스윙프렌즈 공식 SNS. 포스터/날짜가 있는 원본 포스트만 저장' }),
  source({ id: 'neoswing-daum', name: '네오스윙 카페', scope: 'swing', genre: 'swing', type: 'daum_cafe', url: 'https://m.cafe.daum.net/neoswing', priority: 2, notes: '해피홀 네오 소셜/강습 원본 후보. 모바일 Daum 카페에서 글과 이미지가 확인될 때만 저장' }),
  source({ id: 'neoswing-linktree', name: '네오스윙 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/neoswing', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '검색 노출에서 Daum 카페, 오픈채팅, 원데이/정규 신청 경로 확인. 직접 저장 원본으로 쓰지 않음' }),
  source({ id: 'swinghouse-littly', name: '스윙하우스 링크허브', scope: 'swing', genre: 'swing', type: 'littly', url: 'https://litt.ly/swinghouse', priority: 2, sourceKind: 'regular_social_hub', notes: '인천/부천 비밥바 스윙하우스 링크허브. 날짜·이미지가 있는 원데이/강습 카드만 저장' }),
  source({ id: 'goldenswing', name: '골든스윙 인스타그램', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/goldenswing2019/', priority: 2, notes: '골든스윙 Linktree에서 확인한 공식 인스타. 당산벙커/청주 골든 소셜 원본 후보' }),
  source({ id: 'goldenswing-littly', name: '골든스윙 Littly', scope: 'swing', genre: 'swing', type: 'littly', url: 'https://litt.ly/goldenswing', priority: 2, sourceKind: 'regular_social_hub', notes: '청주 당산벙커 골든스윙 보조 링크허브. MT/엠티 제외, 날짜·이미지가 있는 강습/행사 카드만 저장' }),
  source({ id: 'swingfactory_kr', name: '스윙팩토리', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingfactory_kr/', priority: 2 }),
  source({ id: 'swingtown-cafe', name: '스윙타운', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/264?viewType=L', priority: 2 }),
  source({ id: 'swingfamily-lessons', name: '스윙패밀리 강습/행사', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L', priority: 1, notes: '스윙 강습/워크숍 핵심 소스. 이미지가 확인된 미래 시작일 강습만 저장' }),
  source({ id: 'sweetyswing-lessons', name: '스위티스윙 공지/신청', scope: 'swing', genre: 'swing', type: 'daum_cafe', url: 'https://m.cafe.daum.net/sweetyswing/5ngW', priority: 2, notes: '모바일 Daum 카페 URL 우선. 미래 시작일 강습만 저장' }),
  source({ id: 'sweetyswing-instagram', name: '스위티스윙 Instagram', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/sweetyswing/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: '스위티스윙 채널 설명에서 확인된 인스타 원본 후보. 날짜와 이미지가 있는 포스트만 저장' }),
  source({ id: 'sweetyswing-facebook', name: '스위티스윙 Facebook', scope: 'swing', genre: 'swing', type: 'facebook', url: 'https://www.facebook.com/sweetyswing/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'session_sensitive_origin', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: '스위티스윙 채널 설명에서 확인된 Facebook 후보. 접근 실패는 접근불가/세션필요로 보고' }),
  source({ id: 'daily-swing-club', name: 'Daily Swing 클럽 디렉터리', scope: 'swing', genre: 'swing', type: 'website', url: 'https://www.daily-swing.com/club', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'scene_directory', sceneRole: 'source_route_map', promotionPolicy: 'external_hub_only', notes: '네오/프렌즈/스위티/스캔들/스윙키즈/스윙패밀리/올어스 등 원본 카페·SNS 링크 확인용. 후보 저장 URL로 사용하지 않음' }),
  source({ id: 'daily-swing-bar', name: 'Daily Swing 바 디렉터리', scope: 'swing', genre: 'swing', type: 'website', url: 'https://www.daily-swing.com/bar', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'scene_directory', sceneRole: 'venue_route_map', promotionPolicy: 'external_hub_only', notes: '스윙 바/홀/장소 구조 확인용. 실제 후보 저장은 venue/crew 원본 포스트에서만 수행' }),
  source({ id: 'festivall-swing-weekly', name: 'Festivall 스윙 주간 캘린더', scope: 'swing', genre: 'swing', type: 'website', url: 'https://festivall.my/schedule?locale=ko', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'weekly_schedule_hub', sceneRole: 'social_scene_map', promotionPolicy: 'external_hub_only', notes: '주간 소셜 지도 검증용. 포스터 원본이 아니므로 인제스터 후보 저장에는 사용하지 않음' }),
  source({ id: 'allaboutswing-home', name: 'AllAboutSwing 공식 홈', scope: 'swing', genre: 'swing', type: 'website', url: 'https://allaboutswing.co.kr/', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '천안 빅애플/대전반/경성홀/강남반 공식 구조 확인용. /20 강습 페이지 제외 규칙은 유지' }),
  source({ id: 'allaboutswing-linktree', name: '올어바웃스윙 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/allaboutswing', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '검색 노출에서 공식 홈/인스타/페북/수업 장소/신청 경로 확인. 저장은 공식 홈·카페·인스타 원본에서만 수행' }),
  source({ id: 'allaboutswing-cafe', name: '올어스 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/saverrpg', priority: 3, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'regional_route_map', promotionPolicy: 'verified_original_required', notes: '올어바웃스윙 공식 홈에서 연결되는 네이버 카페. 메뉴별 원본 확인 후 수집 대상으로 승격' }),
  source({ id: 'allaboutswing-location', name: 'AllAboutSwing 장소/동호회', scope: 'swing', genre: 'swing', type: 'website', url: 'https://allaboutswing.co.kr/Location', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'scene_directory', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '올어스/올스타/천안올어스/스윙유니버스 등 지역 소셜 경로 확인용. /20 강습 페이지는 제외 유지' }),
  source({ id: 'seoulswing-instagram', name: '서울스윙 인스타그램', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/seoul.swing/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'source_route_map', promotionPolicy: 'verified_original_required', notes: 'Daily Swing 클럽 디렉터리에서 확인. 남부터미널 빅애플 금요일 축으로, 천안 빅애플과 혼동하지 않도록 route map 전용' }),
  source({ id: 'swingverse-instagram', name: '스윙버스 인스타그램', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingverse/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'source_route_map', promotionPolicy: 'verified_original_required', notes: 'Daily Swing 클럽 디렉터리에서 확인. 더쏘셜클럽 일요일 축이며 스윙피크닉과는 별도 커뮤니티' }),
  source({ id: 'bongcheonsalon-linktree', name: '봉천살롱 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/BongcheonSalon', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'venue_route_map', promotionPolicy: 'external_hub_only', notes: '봉천살롱 내부 소셜/서울발보아클럽/스윙타운 링크 확인용. 실제 저장은 연결된 원본 포스트에서만 수행' }),
  source({ id: 'swingkids-cafe', name: '스윙키즈 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/swingkids', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: 'Daily Swing에서 확인된 스윙키즈 공식 카페. 메뉴별 원본 게시판 확인 후 자동 수집 승격 가능' }),
  source({ id: 'swingfamily-cafe', name: '스윙패밀리/스윙타운 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/swingfamily', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: 'Daily Swing에서 봉천살롱/스윙타운 경로로 확인. 기존 menu URL 수집을 보완하는 루트 지도용' }),
  source({ id: 'swingfamily-linktree', name: '스윙패밀리 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/swingfamily', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '스윙패밀리 졸업파티/특강/원데이/네이버 공식 카페 경로 확인용. 저장은 연결된 원본에서만 수행' }),
  source({ id: 'balboaland-linktree', name: '발보아랜드 Linktree', scope: 'swing', genre: 'balboa', type: 'linktree', url: 'https://linktr.ee/balboaland', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'balboa_route_map', promotionPolicy: 'external_hub_only', notes: '피에스타 토요일 발보아랜드 소셜/강습 경로. 네이버카페, 페이스북, 인스타그램 원본 역추적용' }),
  source({ id: 'balboaland-cafe', name: '발보아랜드 네이버 카페', scope: 'swing', genre: 'balboa', type: 'naver_cafe', url: 'https://cafe.naver.com/balboaland', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'balboa_route_map', promotionPolicy: 'verified_original_required', notes: '발보아랜드 Linktree에서 확인. 메뉴별 원본 포스트 확인 후 자동 수집 승격 가능' }),
  source({ id: 'balboaland-facebook', name: '발보아랜드 Facebook', scope: 'swing', genre: 'balboa', type: 'facebook', url: 'https://www.facebook.com/ilovebalboaland', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'balboa_route_map', promotionPolicy: 'verified_original_required', notes: '발보아랜드 Linktree에서 확인. Facebook은 세션/봇 접근 변수가 있어 수동 또는 세션 기반 확인 우선' }),
  source({ id: 'swingcats-linktree', name: '스윙캣츠 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/swingcats', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '대전·세종 스윙캣츠/루나 소셜 및 네이버 카페·인스타 경로 확인용' }),
  source({ id: 'swinguniverse-linktree', name: '스윙유니버스 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/SwingUniverse', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '대전 오나다 스윙유니버스/웨코 경로 확인용. 접근 실패 시 사용자 세션/수동 확인 대상' }),
  source({ id: 'swingfever-linktree', name: '스윙피버 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/swingfever.daejeon', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '대전 스윙잇댄스홀/피버 경로 확인용. MT/엠티는 수집 제외' }),
  source({ id: 'swingfever-cafe', name: '스윙피버 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/swingfever2002', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'regional_route_map', promotionPolicy: 'verified_original_required', notes: '스윙피버 Linktree에서 연결된 공식 카페. 메뉴별 원본 확인 후 자동 수집 대상으로 승격' }),
  source({ id: 'goldenswing-linktree', name: '골든스윙 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/goldenswing', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '골든스윙 공식 링크허브. 네이버카페, 인스타그램, Google Calendar, 블로그, Band 경로 확인용' }),
  source({ id: 'goldenswing-cafe', name: '골든스윙 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/goldenswingdance', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'regional_route_map', promotionPolicy: 'verified_original_required', notes: '골든스윙 Linktree에서 확인한 네이버 카페. 메뉴별 원본 확인 후 자동 수집 승격 가능' }),
  source({ id: 'swingpopseoul-linktree', name: '스윙팝 Linktree', scope: 'swing', genre: 'swing', type: 'linktree', url: 'https://linktr.ee/swingpopseoul', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'link_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '스윙팝 공식 링크 허브. Dialogue 수요일 소셜/KP 토요일 강습 원본 역추적용' }),
  source({ id: 'swingpopseoul-meetup', name: '스윙팝 Meetup', scope: 'swing', genre: 'swing', type: 'meetup', url: 'https://www.meetup.com/ko-KR/seoul-swing-dance-community/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'schedule_hub', sceneRole: 'community_route_map', promotionPolicy: 'external_hub_only', notes: '스윙팝 반복 소셜/클래스 일정 확인용. 저장은 공식 포스터/이미지 원본 확인 후만 수행' }),
  source({ id: 'swingpopseoul-facebook', name: '스윙팝 Facebook', scope: 'swing', genre: 'swing', type: 'facebook', url: 'https://www.facebook.com/swingpop0701', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: '스윙팝 Linktree에서 확인한 Facebook 원본 후보. 세션 상태에 따라 수동 확인' }),
  source({ id: 'swingfriends-facebook', name: '스윙프렌즈 Facebook', scope: 'swing', genre: 'swing', type: 'facebook', url: 'https://www.facebook.com/Swingfriendstimebar', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'social_origin', sceneRole: 'community_route_map', promotionPolicy: 'verified_original_required', notes: '프렌즈 타임바 소셜 원본 후보. Facebook 자동 접근은 세션 이슈가 있어 지도 검증/수동 확인 우선' }),
  source({ id: 'swingpicnic-allevents', name: '스윙피크닉 AllEvents', scope: 'swing', genre: 'balboa', type: 'website', url: 'https://allevents.in/org/%EC%8A%A4%EC%9C%99%ED%94%BC%ED%81%AC%EB%8B%89-swing-picnic/24459465', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'event_hub', sceneRole: 'balboa_route_map', promotionPolicy: 'external_hub_only', notes: '스윙피크닉/쏘셜클럽 발보아 이벤트 발견용. 공식 원본 또는 포스터가 확인된 항목만 저장' }),
  source({ id: 'swingpicnic-facebook', name: '스윙피크닉 Facebook', scope: 'swing', genre: 'balboa', type: 'facebook', url: 'https://www.facebook.com/profile.php?id=61559424440626', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'session_sensitive_origin', sceneRole: 'balboa_route_map', promotionPolicy: 'verified_original_required', notes: 'AllEvents organizer 이미지 Graph ID에서 역추적한 Facebook 후보. 세션/권한 확인 전 자동 저장 원본으로 쓰지 않음' }),
  source({ id: 'swingkids-bigapple-cheonan', name: 'Swing Kids 빅애플 천안 디렉터리', scope: 'swing', genre: 'swing', type: 'directory', url: 'https://swing.kids/kr/big-apple-cheonan/', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'venue_directory', sceneRole: 'regional_route_map', promotionPolicy: 'external_hub_only', notes: '천안 빅애플 연락처와 공식 네이버 카페 경로 확인용. 저장 원본으로는 쓰지 않음' }),
  source({ id: 'bigapple-cheonan-cafe', name: '천안 빅애플 네이버 카페', scope: 'swing', genre: 'swing', type: 'naver_cafe', url: 'https://cafe.naver.com/bigappleswing', priority: 4, discoveryOnly: true, phase: 'stable', sourceKind: 'official_community_hub', sceneRole: 'regional_route_map', promotionPolicy: 'verified_original_required', notes: 'Swing Kids 디렉터리에서 확인한 천안 빅애플 공식 카페. 메뉴별 원본 확인 후 자동 수집 승격 가능' }),
  source({ id: 'swingholic', name: '스윙홀릭', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/swingholic/', priority: 2 }),
  source({ id: 'campswingit', name: 'CSI', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/campswingit/', priority: 2 }),
  source({ id: 'badaje_jeju', name: '바다제', scope: 'swing', genre: 'swing', type: 'instagram', url: 'https://www.instagram.com/badaje_jeju/', priority: 2 }),
  source({ id: 'busan_lindy_weekend', name: '부산 린디합 위켄드', scope: 'swing', genre: 'lindyhop', type: 'instagram', url: 'https://www.instagram.com/busan_lindy_weekend/', priority: 2 }),
  source({ id: 'seoulindyfest', name: '서울 린디페스트', scope: 'swing', genre: 'lindyhop', type: 'instagram', url: 'https://www.instagram.com/seoulindyfest/', priority: 2 }),

  source({ id: 'tangocalendar', name: 'Tango Calendar Korea', scope: 'tango', genre: 'tango', type: 'website', url: 'https://tangocalendar.kr/', priority: 1, discoveryOnly: true, phase: 'research', sourceKind: 'schedule_hub', sceneRole: 'live_schedule_hub', promotionPolicy: 'external_hub_only', notes: '서울 탱고 밀롱가/이벤트/DJ 일정 허브. 포스터가 없으므로 씬 지도와 외부 링크 노출용으로 사용하고 직접 저장 금지' }),
  source({ id: 'tango-now', name: 'Tango NOW', scope: 'tango', genre: 'tango', type: 'website', url: 'https://ktnow.kr/', priority: 1, discoveryOnly: true, phase: 'research', sourceKind: 'schedule_hub', sceneRole: 'national_live_schedule_hub', promotionPolicy: 'external_hub_only', notes: '전국 아르헨티나 탱고 일정 가이드. 밀롱가/이벤트/클래스/Shop 분류와 포스터 제보 흐름을 가진 탱고 씬 허브' }),
  source({ id: 'koreatango', name: 'Korea Tango Cooperative', scope: 'tango', genre: 'tango', type: 'website', url: 'https://www.koreatango.co.kr/', priority: 2 }),
  source({ id: 'tanguear-seoul', name: 'Tanguear Seoul Tango Events', scope: 'tango', genre: 'tango', type: 'website', url: 'https://tanguear.com/event/3af5-6126', priority: 3, discoveryOnly: true, notes: '글로벌 탱고 이벤트 허브. 서울 이벤트 발견용이며 공식 organizer 원본 확인 전 저장 금지' }),
  source({ id: 'tangotocup-seoul', name: 'TangotoCUP Seoul Preliminary', scope: 'tango', genre: 'tango', type: 'website', url: 'https://tangotocup.com/competition/65', priority: 3, phase: 'research', sourceKind: 'festival', sceneRole: 'major_event_axis', promotionPolicy: 'official_event_page_allowed', notes: '탱고 월드컵 서울 예선 공식 페이지. 날짜/장소/이미지 확인 시 선별 저장 가능' }),
  source({ id: 'jeju-summ-milonga', name: 'Jeju SUMM Milonga', scope: 'tango', genre: 'tango', type: 'website', url: 'https://www.jejusummmilonga.com/', priority: 3, phase: 'research', sourceKind: 'festival', sceneRole: 'major_event_axis', promotionPolicy: 'official_event_page_allowed', notes: '제주 탱고 공식 행사 축. 포스터/일정/장소 확인 시 선별 저장 가능' }),
  source({ id: 'chuncheon-tango-festival', name: 'Chuncheon International Tango Festival', scope: 'tango', genre: 'tango', type: 'website', url: 'https://kcctf.org/', priority: 3, phase: 'research', sourceKind: 'festival', sceneRole: 'major_event_axis', promotionPolicy: 'official_event_page_allowed', notes: '춘천 탱고 페스티벌 공식 축. 일정/이미지 확인 시 선별 저장 가능' }),
  source({ id: 'seoul-tango-festival', name: 'Seoul Tango Festival', scope: 'tango', genre: 'tango', type: 'website', url: 'https://seoultangofestival.com/2026/01/16/2026-stf/', priority: 3, phase: 'research', sourceKind: 'festival', sceneRole: 'major_event_axis', promotionPolicy: 'official_event_page_allowed', notes: '서울 탱고 축. 날짜/장소/이미지 확인 시 선별 저장 가능' }),
  source({ id: 'enjoytango-seoul', name: 'Enjoy Tango Seoul / Korea events', scope: 'tango', genre: 'tango', type: 'directory', url: 'https://www.enjoytango.com/app/show.php?aid=2520', priority: 4, discoveryOnly: true, notes: '글로벌 탱고 디렉터리. KTC 등 공식 원본 역추적용이며 자체 정보만으로 저장 금지' }),
  source({ id: 'tango-map-korea', name: 'Tango Map Korea', scope: 'tango', genre: 'tango', type: 'map', url: 'https://tango.bien.ltd/', priority: 4, discoveryOnly: true, phase: 'research', sourceKind: 'venue_map', sceneRole: 'venue_reference', promotionPolicy: 'external_hub_only', notes: '한국 탱고 venue/커뮤니티 지도 참고용. 일정 저장 원본으로 사용하지 않고 장소 정규화와 씬 지도 보강에 사용' }),
  source({ id: 'seoul-tango-community-meetup', name: 'Seoul Tango Community Meetup', scope: 'tango', genre: 'tango', type: 'meetup', url: 'https://www.meetup.com/ko-KR/secret-fancy-tango/', priority: 4, discoveryOnly: true, notes: '영어권 탱고 클래스/프랙티카 커뮤니티 진입점. 원본 확인 전 저장 금지' }),
  source({ id: 'placeocean-tango', name: 'PlaceOcean Tango Hub', scope: 'tango', genre: 'tango', type: 'website', url: 'https://www.placeocean.kr/', priority: 4, discoveryOnly: true, notes: '탱고/라틴/WCS 혼합 허브. 탱고 venue와 organizer 발견용이며 원본 확인 전 저장 금지' }),
  source({ id: 'eltango_seoul', name: '엘땅고', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/eltango_seoul/', priority: 2 }),
  source({ id: 'casamilonga_seoul', name: '까사밀롱가', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/casamilonga_seoul/', priority: 2 }),
  source({ id: 'tangopeople_korea', name: '탱고피플', scope: 'tango', genre: 'tango', type: 'instagram', url: 'https://www.instagram.com/tangopeople_korea/', priority: 3 }),

  source({ id: 'latin-in-seoul', name: 'Latin in Seoul', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://salsa.atoo.kr/', priority: 1, notes: '살사/바차타 혼합 공지는 본문 기준으로 scope를 재판정' }),
  source({ id: 'latin-in-seoul-weekly', name: 'Latin in Seoul Weekly Info', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://salsa.atoo.kr/category/weekly-info/', priority: 1, discoveryOnly: true, notes: '서울 라틴 주간 현황판. 반복 venue와 DJ/비율 파악용이며 venue 공식 원본 확인 후 저장' }),
  source({ id: 'place-ocean', name: 'Place Ocean', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.placeocean.kr/', priority: 2 }),
  source({ id: 'salsavida-seoul', name: 'SalsaVida Seoul', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.salsavida.com/guides/south-korea/seoul/socials/', priority: 2, discoveryOnly: true, notes: '서울 살사 소셜 캘린더. recurring venue/event 발견용이며 저장은 공식 venue/원본 포스터 확인 후만 허용' }),
  source({ id: 'salsavida-seoul-calendar', name: 'SalsaVida Seoul Calendar', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.salsavida.com/guides/south-korea/seoul/calendar/', priority: 2, discoveryOnly: true, notes: '서울 라틴 캘린더. 반복 소셜/레슨/페스티벌 발견용이며 공식 원본 확인 전 저장 금지' }),
  source({ id: 'where-to-dance-salsa-seoul', name: 'Where to Dance Salsa Seoul', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://where-to-dance-salsa.com/cities/seoul/', priority: 2, discoveryOnly: true, notes: '서울 Salsa/Bachata/Zouk recurring weekly social 디렉터리. venue 구조 파악용' }),
  source({ id: 'where-to-dance-bachata-seoul', name: 'Where to Dance Bachata Seoul', scope: 'bachata', genre: 'bachata', type: 'website', url: 'https://where-to-dance-salsa.com/bachata/seoul/weekly/', priority: 2, discoveryOnly: true, notes: '서울 바차타 recurring weekly social 디렉터리. venue 구조 파악용' }),
  source({ id: 'korea-latin-dance-hub', name: 'Korea Latin Dance Hub', scope: 'salsa', genre: 'salsa', type: 'directory', url: 'https://latindance.kr/clubs-en', priority: 3, discoveryOnly: true, notes: '전국 라틴 클럽/커뮤니티 디렉터리. 원본 SNS/웹사이트 역추적용' }),
  source({ id: 'latindancehub-seoul-guide', name: 'LatinDanceHub Seoul Guide', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://latindancehub.co/blog/where-to-dance-salsa-bachata-in-seoul', priority: 3, discoveryOnly: true, notes: '서울 살사/바차타 venue 규모와 구조 파악용. 이벤트 저장 원본으로 사용하지 않음' }),
  source({ id: 'sa-latin', name: 'SA Latin', scope: 'salsa', genre: 'salsa', type: 'linktree', url: 'https://linktr.ee/sa.latin.official', priority: 3, discoveryOnly: true, notes: '공식 원본 링크로 들어가 확인 후 저장' }),
  source({ id: 'aksalsa', name: 'AK Salsa', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://www.aksalsa.com/about-1', priority: 3 }),
  source({ id: 'lsk-meetup', name: 'LSK Latin Dance Meetup', scope: 'salsa', genre: 'salsa', type: 'meetup', url: 'https://www.meetup.com/ko-KR/seoul-latin-dance-meetup-group/', priority: 3, discoveryOnly: true, notes: '영어권 라틴 클래스/커뮤니티 반복 일정 조사용. 공식 포스터 원본 확인 전 저장 금지' }),
  source({ id: 'sidf', name: 'SIDF Seoul International Dance Festival', scope: 'salsa', genre: 'salsa', type: 'website', url: 'https://sidf.kr/', priority: 3, phase: 'research', sourceKind: 'festival', sceneRole: 'major_event_axis', promotionPolicy: 'official_event_page_allowed', notes: '살사/바차타 페스티벌 축. 날짜/라인업/이미지 확인 시 선별 저장 가능' }),
  source({ id: 'bsbachata', name: 'BS Bachata', scope: 'bachata', genre: 'bachata', type: 'website', url: 'https://bsbachata.com/', priority: 2 }),
  source({ id: 'social-dance-today', name: 'Social Dance Today', scope: 'bachata', genre: 'bachata', type: 'website', url: 'https://social-dance.today/', priority: 3, discoveryOnly: true, notes: '글로벌 소셜댄스 검색. 서울 라틴 이벤트 발견용이며 자체 정보만으로 저장 금지' }),
  source({ id: 'flowdat-korea', name: 'Flowdat Korea Search', scope: 'bachata', genre: 'bachata', type: 'website', url: 'https://flowdat.co/', priority: 3, discoveryOnly: true, notes: '글로벌 댄스 이벤트 플랫폼. 한국 이벤트 원본 Instagram/공식 페이지 확인 전 저장 금지' }),
  source({ id: 'turn_latin_bar', name: '턴라틴바', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/turn_latin_bar/', priority: 2 }),
  source({ id: 'bonitasalsabar', name: '보니따살사', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/bonitasalsabar/', priority: 2 }),
  source({ id: 'latin_in_seoul', name: '라틴인서울', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/latin_in_seoul/', priority: 2 }),
  source({ id: 'caribe0804', name: '까리베', scope: 'salsa', genre: 'salsa', type: 'instagram', url: 'https://www.instagram.com/caribe0804/', priority: 3 }),

  source({ id: 'freezekr-stage', name: 'Freeze KR', scope: 'street', genre: 'street', type: 'website', url: 'https://www.freezekr.com/stage', priority: 1 }),
  source({ id: 'dancecode', name: 'DanceCode', scope: 'street', genre: 'street', type: 'website', url: 'https://www.dancecode.kr/', priority: 1 }),
  source({ id: 'dancechives', name: 'DanceChives', scope: 'street', genre: 'street', type: 'website', url: 'https://dancechives.com/', priority: 3, discoveryOnly: true, notes: '스트릿 이벤트/배틀 영상 아카이브 및 Instagram URL 기반 발견 도구. 원본 주최자 확인 전 저장 금지' }),
  source({ id: 'flowdat-street-search', name: 'Flowdat Street Korea', scope: 'street', genre: 'street', type: 'website', url: 'https://flowdat.co/', priority: 3, discoveryOnly: true, notes: '한국 스트릿 배틀/워크샵 이벤트 발견용. 공식 Instagram/주최자 원본 확인 전 저장 금지' }),
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
    'site:instagram.com 스윙댄스 원데이 클래스',
    'site:instagram.com 린디합 원데이 서울',
    'site:instagram.com 스윙댄스 체험 클래스',
    'site:instagram.com 스윙댄스 오픈 클래스',
    'site:instagram.com 발보아 소셜 서울',
    '스윙댄스 파티 서울 2026',
    '스윙댄스 원데이 클래스 서울 2026',
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
    'Tango NOW 한국 탱고 일정',
    '탱고NOW 밀롱가 서울',
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
  const cafeDescriptor = getNaverCafeDescriptor(url);
  if (cafeDescriptor) {
    const cafeMatched = collectionSources.find((item) => {
      const sourceCafe = getNaverCafeDescriptor(item.url);
      if (!sourceCafe || sourceCafe.cafeId !== cafeDescriptor.cafeId) return false;
      return !sourceCafe.menuId || !cafeDescriptor.menuId || sourceCafe.menuId === cafeDescriptor.menuId;
    });
    if (cafeMatched) return cafeMatched;
    return null;
  }

  return collectionSources.find((item) => {
    if (item.match instanceof RegExp) return item.match.test(url);
    const matchValue = String(item.match || item.url).toLowerCase().replace(/\/$/, '');
    if (normalized.startsWith(matchValue)) return true;
    if (['instagram', 'facebook'].includes(item.type)) return false;
    return normalized.includes(new URL(item.url).hostname.replace(/^www\./, ''));
  }) || null;
}

function getNaverCafeDescriptor(url = '') {
  try {
    const parsed = new URL(url);
    if (!/cafe\.naver\.com$/i.test(parsed.hostname)) return null;
    const cafeId = parsed.pathname.match(/\/cafes\/(\d+)\//)?.[1] || '';
    const menuId = parsed.pathname.match(/\/menus\/(\d+)/)?.[1] || parsed.searchParams.get('menuid') || '';
    if (!cafeId) return null;
    return { cafeId, menuId };
  } catch {
    return null;
  }
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
    sourceKind: item.sourceKind,
    sceneRole: item.sceneRole,
    promotionPolicy: item.promotionPolicy,
    runOrder: item.runOrder,
    automationProfile: selected.id,
    saveEnabled: (item.scope === 'swing' || selected.saveExpandedCandidates) && !item.discoveryOnly,
    notes: item.notes,
  }));
}
