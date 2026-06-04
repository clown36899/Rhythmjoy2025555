# Swing Social Source Map - 2026-06

목적: 매주 반복되는 스윙 소셜 지도를 자동수집 결과와 대조하기 위한 출처 지도다. 후보 DB 등록은 실제 포스트 URL, 미래 날짜, 포스터 이미지가 확인될 때만 한다. 반복 일정표나 디렉터리만 있는 항목은 씬 지도 검증용으로만 사용한다.

## Source Tiers

| Tier | 용도 | 저장 가능 여부 | 현재 소스 |
|---|---|---:|---|
| collectable_origin | 원본 포스트/글/카드에서 날짜와 이미지 확인 | 가능 | Naver Cafe, Daum Cafe, Instagram post, Littly card |
| session_sensitive_origin | 원본 가능성이 있으나 Facebook 등 세션 영향 큼 | 수동 확인 후 | Facebook pages |
| link_hub | 공식 링크 모음, 실제 원본으로 이동해야 함 | 직접 저장 금지 | Linktree, Linktree, Inpock |
| official_community_hub / scene_directory | 클럽/장소/동호회 구조 확인 | 직접 저장 금지 | Daily Swing, AllAboutSwing 공식 홈/Location |
| weekly_schedule_hub | 주간 소셜 지도 대조 | 직접 저장 금지 | Festivall |
| excluded_reference_only | 사용자 지정 제외 소스 | 저장 금지 | Meroni Swing |

## Confirmed Routes

| Scene item | Primary source route | Backup/scene route | Current automation status |
|---|---|---|---|
| 사보이 / 스윙스캔들 | `swingscandal-cafe` Naver Cafe, `swingscandal-littly` Littly | Daily Swing, Festivall | collectable, daily |
| 해피홀 / 네오 | `happyhall2004` Instagram, `neoswing-daum` Daum Cafe | `neoswing-linktree`, Daily Swing | collectable, daily |
| 타임 / 프렌즈 | `swingfriends-cafe`, `swing_friends`, `swingfriends-oneday-littly` | `swingfriends-site`, Facebook, Daily Swing | collectable + session-sensitive |
| 타임 / 스위티 | `sweetyswing-lessons` Daum Cafe, `swingtimebar` Instagram | `sweetyswing-instagram`, `sweetyswing-facebook`, Daily Swing | collectable + session-sensitive |
| 봉천살롱 / 타운 | `swingtown-cafe`, `bongcheonsalon` | `swingfamily-cafe`, `swingfamily-linktree`, BongcheonSalon Linktree | collectable, daily |
| 봉천살롱 / 서울발보어클럽 | `bongcheonsalon` | BongcheonSalon Linktree | route confirmed, original post needed |
| 루나 / 스윙캣츠클럽 | `luna_swingbar` | `swingcats-linktree`, `swingcats-inpock` | Instagram checked, link hub confirmed |
| 루나 / 스윙캣츠클럽 | `swingcats20` | `swingcats-linktree` | collectable, daily |
| 비밥바 / 하우스 | `bebopbar_swing`, `swinghouse-littly` | Daily Swing | collectable, daily |
| 당산벙커 / 골든 | `goldenswing` Instagram, `goldenswing-littly` | `goldenswing-linktree`, `goldenswing-cafe`, Google Calendar | collectable + link hub |
| 피에스타 / 키즈 | `fiesta_swingdance`, `swingkids_kr`, `swingkids-oneday-littly` | `swingkids-linktree`, `swingkids-cafe`, Daily Swing | collectable, daily |
| 피에스타 / 발보아랜드 | `balboaland-instagram` | `balboaland-linktree`, `balboaland-cafe`, `balboaland-facebook` | collectable + session-sensitive |
| 경성홀 / 올어스, 올스타 | `kyungsunghall` | `allaboutswing-linktree`, AllAboutSwing Location, Daily Swing | collectable venue source, club route directory |
| 천안빅애플 / 천안올어스 | `allaboutswing_official`, AllAboutSwing 공식 홈 | `allaboutswing-linktree`, `bigapple-cheonan-cafe`, `swingkids-bigapple-cheonan`, `allaboutswing-cafe`, AllAboutSwing Location | 공식 경로 확인, 주간 DJ 원본 게시판은 추가 확인 필요 |
| 대전 오나다 / 스윙유니버스 | `swinguniverse-linktree` | AllAboutSwing Location, Meroni reference | source route only, official post route still needed |
| 스윙잇 / 피버 | `daejeon_swingfever`, `swingit_seoul` | `swingfever-linktree`, `swingfever-cafe`, Daily Swing | collectable + official link hub |
| 인더무드신림 / 드림발, 박쥐 | `inthemood_sillim` | Festivall, Daily Swing | collectable venue source |
| Dialogue/KP댄스홀 / 스윙팝 | `swingpopseoul`, `dialogue_swing`, `kpdancehall` | `swingpopseoul-linktree`, `swingpopseoul-meetup`, `swingpopseoul-facebook`, Festivall | collectable + schedule hub |
| 스파 / 파스텔, 청주블루스CJB, 스윙유니버스 | `spa_swingdance` | Festivall, Daily Swing | collectable venue source |
| 아수라장 / 패션 | `asurajang_swing` | Festivall, Meroni reference | collectable venue source |
| 243 / 부산프렌즈, 어반 | `swingfriends-cafe`, `swing_friends` | Festivall, Meroni reference | 243 자체 인스타 소스 미확정. 부산프렌즈는 스윙프렌즈 경로로 대조, 어반은 공식 원본 추가 조사 필요 |
| 탐나홀 / 탐나 | `tamnahall` | Daily Swing | collectable venue source |
| 마얀 / 홀릭 | `swingholic` | Meroni reference | collectable community source |
| 강남웨스티스 / 웨스티, 웨코 | `gangnam_westies` | Daily Swing | collectable, daily |
| 쏘셜클럽 / 스윙피크닉 | `sosyalclub_swing` | `swingpicnic-allevents`, `swingpicnic-facebook` | venue source checked, official event source still needs session/source confirmation |

## Channel Split Notes

| 채널 | 이번 점검에서 확인된 쓰임 |
|---|---|
| Naver Cafe | 스윙스캔들, 스윙프렌즈, 스윙키즈, 스윙타운/스윙패밀리, 올어바웃스윙, 발보아랜드, 골든스윙, 천안 빅애플 |
| Daum Cafe | 네오스윙, 스위티스윙 |
| Instagram | venue/club 공식 포스터 원본. 해피홀, 타임, 피에스타, 봉천살롱, 루나, 비밥바, 인더무드, 스파, 스윙팝, 발보아랜드, 골든스윙 등 |
| Facebook | 스윙프렌즈, 스위티스윙, 발보아랜드, 스윙팝, 스윙피크닉처럼 세션 영향이 큰 원본 후보. 접근 실패는 “수집대상 없음”이 아니라 “접근/세션 필요”로 보고 |
| Littly / Linktree | 네오스윙, 스윙스캔들, 스윙키즈, 스윙프렌즈, 스윙패밀리, 스윙피버, 골든스윙, 올어바웃스윙, 스윙팝은 원본 역추적/원데이/강습/특강 활성 카드 확인용. 날짜와 이미지가 직접 확인된 Littly 카드만 저장 가능 |
| Website / Link Hub | Daily Swing, AllAboutSwing, Linktree/AllEvents는 원본 역추적과 씬 지도용. 포스터/날짜가 직접 확인된 Littly 활성 카드 외에는 직접 저장 금지 |

## Current Gaps

1. 대전 스윙유니버스/오나다는 공식 원본 포스트 경로가 검색 노출에서 아직 약하다. Linktree/AllAboutSwing/Meroni로 구조는 보이지만, Meroni는 제외 소스라 저장 원본으로 쓰지 않는다.
2. 천안올어스는 AllAboutSwing 공식 홈에서 천안 빅애플 수업 장소가 확인되고, Swing Kids 디렉터리에서 `https://cafe.naver.com/bigappleswing` 경로가 확인된다. 다만 주간 DJ 소셜 원본 게시판은 메뉴 단위 추가 확인이 필요하다.
3. Facebook 기반 공지는 세션/봇 접근 상태에 따라 자동 수집이 흔들릴 수 있다. Facebook은 원본 후보 발견용으로 두고, 가능하면 Instagram/Naver/Daum/Littly 원본으로 역추적한다.
4. Instagram 계정은 비로그인 환경에서 `no post links`가 자주 난다. 이 경우 “포스트 없음”과 “봇/세션 때문에 목록 접근 불가”를 계속 분리해서 보고해야 한다.
5. 소셜 지도 항목은 포스터가 없는 반복 일정이면 DB 후보로 넣지 않는다. 대신 `scripts/ingestion/audit-swing-social-map.mjs`로 매 실행마다 확인 상태를 남긴다.
6. 네이버/다음 카페는 주간표·모집글 원본 후보, Instagram은 포스터 원본 후보, Facebook은 세션 민감 후보, Linktree/Littly는 원본으로 들어가는 라우터로 분류한다. 같은 장면이라도 채널 역할이 다르므로 실패 메시지도 채널별로 다르게 기록해야 한다.

## Commands

```bash
node scripts/test-ingestion-standards.mjs
node scripts/ingestion/audit-swing-social-map.mjs
INGESTION_NATIVE_DRY_RUN=1 INGESTION_NATIVE_SOURCE_IDS=swinghouse-littly,goldenswing,goldenswing-littly,balboaland-instagram,swing_friends,neoswing-daum,swingkids_kr node scripts/ingestion/swing-daily-native.mjs
```
