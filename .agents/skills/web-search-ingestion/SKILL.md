---
name: Web Search Ingestion V2
description: 대한민국 스윙 및 확장 댄스 장르의 미래 데이터(오늘 이후)를 수집하기 위한 자율 에이전트 지침서
---

# Web Search Ingestion V2: 전국구 스윙/확장 장르 미래 이벤트 수집 가이드

이 지침의 목적은 대한민국 스윙댄스 씬과 승인된 확장 장르(스트릿/살사/탱고/바차타)의 이벤트를 **미래 지향적(Future-only)**으로 수집하고, 이미지와 정보를 유실 없이 관리하는 것이다.

## ⏱ 실행 규율 (Execution Discipline) — 최우선 준수

### 시간 예산
- **전체 수집 제한: 20분** — 수집 시작 시각을 기록하고, 20분 경과 시 즉시 수집 중단 후 summary 출력하고 종료.
- **소스당 제한: 60초** — 한 소스(URL)에서 60초 내 결과가 없으면 즉시 다음 소스로 넘어간다.
- **Playwright 응답 제한: 20초** — browser_navigate, browser_snapshot 등 각 호출이 20초 내 응답 없으면 browser_close 후 다음 소스로.

### Turn 예산
- **max-turns 120 중 110턴 도달 시 즉시 수집 중단** — 남은 소스가 있어도 멈추고 summary 출력 후 종료.
- 수집 도중 현재 턴 수를 의식하며 진행할 것.

### Hang 대응 (가장 중요)
Playwright MCP 호출이 응답 없이 멈춘 경우:
```bash
pkill -9 -f "chrome-headless-shell" 2>/dev/null
pkill -9 -f "playwright" 2>/dev/null
sleep 1
```
실행 후 해당 소스는 **접근불가**로 기록하고 다음 소스로. **절대 같은 소스 재시도 금지.**

### 종료 시 절대 규칙
- **어떤 상황에서도 summary 블록을 출력하고 종료한다** — 에러, 타임아웃, 소스 전부 실패, 신규 0건 모두 해당.
- summary 없이 종료하는 것은 **실패**로 간주 (run-ingestion.sh가 오류 처리함).
- 자동 실행(`swing-daily`)에서는 수집 루프가 끝나는 즉시 summary를 먼저 출력하고 종료한다. DB 후검증, 수동 보정, 문서 갱신은 summary 전에 하지 않는다.
- 문서 갱신이 필요한 수동 점검은 별도 작업으로 분리한다. 자동 실행의 1차 로그는 `/Users/inteyeo/ingestion-runs/*.jsonl`, `.meta`, `.last.txt`, `/Users/inteyeo/claude_ingestion.log`다.

---

## ❌ 절대 금지 사항 (Hard Rules — 위반 시 수집 무효)
1. **실제 포스트 없이 삽입 금지** — "매주 하니까", "패턴상 있을 것 같다"는 추측 기반 삽입 절대 금지. 반드시 실제 게시물 URL과 내용이 확인된 것만 삽입한다.
2. **이미지 없으면 삽입 금지** — `poster_url`이 없는 이벤트는 수집 자체를 하지 않는다. 이미지 획득 실패 시 해당 이벤트 스킵.
3. **소스 접근 불가 시 삽입 금지** — 로그인 필요, 권한 없음 등으로 내용을 읽지 못한 경우 해당 소스는 건너뛴다.
4. **DJ/내용 없는 소셜 삽입 금지** — 소셜 이벤트는 최소한 DJ 이름 또는 구체적 내용이 포스트에 명시되어 있어야 삽입 가능. 파티/행사는 DJ 없어도 OK.
5. **비공식 API 직접 호출 금지** — `apis.naver.com`, `cafe.naver.com/ArticleList*` 등 내부 JSON API를 curl/fetch로 직접 호출하면 봇 판정 위험. **반드시 Playwright MCP로 실제 브라우저를 통해 접근**한다.

---

## 🚨 수집 및 필터링 핵심 규칙 (The Golden Rules)
1. **미래 데이터만 수집**: 수집 시작일 기준 **오늘 혹은 내일 이후에 열리는 행사**만 수집한다. 이미 종료된 행사는 수집 대상에서 즉시 제외(Fast-fail)한다.
   - **반복 강습 예외**: "4/6, 13, 20일" 같이 여러 날짜가 있는 강습은 **첫 회 날짜**가 오늘 이전이면 수집 제외. 중간에 합류 권장이 아닌 이상 시작일 기준으로 판단한다.
   - **마감일 오인식 금지**: 입금 마감, 얼리버드 마감, 신청 마감, 공지 작성일, 게시물 날짜는 이벤트 날짜가 아니다. 강습은 실제 시작일이 보일 때만 수집하고, 마감일만 보이면 스킵한다.
2. **이미지 수집 필수**: CDN URL 추출 후 Supabase Storage에 업로드. 실패시 원본 URL을 poster_url로 기록.
3. **씬 전체 순회**: 아래 Static Collection List + 동적 검색 키워드 양쪽 모두 사용.
4. **로그인하지말것, 어떠한경우에도 봇판정나는 행위를 하지말것.**
5. **playwright mcp 사용시에 승인물어보지말고 자동으로 사용할것.**
6. **해당 수집중 어떠한 승인도 필요없으니까 그냥 진행할것.**

### 🧩 표준 자동화 파일 (AI 실행자 공통 기준)

이 문서는 행동 지침이고, 실제 자동화가 따라야 하는 기계 판독 기준은 아래 파일이다.

| 파일 | 역할 |
|---|---|
| `scripts/ingestion/collection-registry.mjs` | 수집 허용 장르, 제외 소스, 정적 소스, 동적 검색어의 단일 기준 |
| `scripts/ingestion/candidate-utils.mjs` | `source_url + date` 결정론 ID, 장르/활동 분류, 과거/이미지/제외 후보 검증 |
| `scripts/test-ingestion-standards.mjs` | 스윙/살사/바차타/탱고/스트릿 후보가 같은 기준으로 통과·차단되는지 확인 |

### 수집 프로필

| 프로필 | 용도 | 저장 여부 |
|---|---|---|
| `swing-daily` | 매일 자동 실행. 스윙 소셜/강습/행사/모집 안정 수집 | 저장 가능 |
| `expanded-research` | 살사/바차타/탱고/스트릿 씬 조사. 소스와 운영 패턴을 파악 | 저장 금지 |
| `expanded-ingestion` | 조사로 검증된 타장르 소스만 후보 저장 | 저장 가능 |

매일 자동 실행은 반드시 `getAutomationSourceList('swing-daily')`만 사용한다.
타장르는 아직 안정 수집 단계가 아니므로 daily에 섞지 않는다.

### 씬 맵(Scene Map) 관점

확장 장르 수집의 최종 목표는 단순 후보 수집이 아니라 **장르별 씬의 전체 지도**를 만드는 것이다. 타장르 조사에서는 “오늘 넣을 이벤트 수”보다 아래 구조를 설명할 증거를 우선한다.

| 축 | 봐야 할 것 |
|---|---|
| 활동 비중 | 강습 / 소셜 / 행사 / 모집이 어떤 비율로 움직이는가 |
| 활동량 | 주간·월간 반복 일정, 정원/마감, 댓글/참여 안내 등으로 본 현재 인구와 밀도 |
| 참여 경로 | 입문자가 어디서 시작하고, 소셜이나 행사로 어떻게 연결되는가 |
| 운영 구조 | 학원 중심, 바/공간 중심, 동호회/크루 중심, 개인 강사 중심 중 무엇인가 |
| 수익 구조 | 수강료, 입장료, 파티 티켓, 워크샵, 대관, 멤버십 등 어떤 방식으로 돈이 도는가 |
| 장소 생태계 | 고정 venue가 있는가, 여러 장소를 순회하는가, 지도/주소 품질은 어떤가 |
| 강습 구조 | 정규 기수제, 원데이, 워크샵, 개인/아마추어 강습 중 무엇이 주류인가 |
| 커뮤니티 허브 | 공식 캘린더, 카페, 링크트리, 오픈채팅, 인스타그램 중 어디가 중심인가 |

확인되지 않은 추정은 저장 후보로 만들지 않고 `가설` 또는 `open_questions`로 남긴다.

수집 로직, 소스 목록, 후보 payload를 바꾼 경우 수집 전에 반드시 아래를 통과시킨다.

```bash
node scripts/test-ingestion-standards.mjs
```

후보 저장 전에는 `prepareCandidate()` 또는 `buildNetlifyPayload()`가 만드는 필드와 동일한 구조를 사용한다.
즉, 실행자가 Codex든 다른 AI든 최종 payload에는 `id`, `source_url`, `poster_url` 또는 `imageData`, `structured_data.date`, `activity_type`, `genre_family`, `dance_scope`, `dance_genre`, `tags`가 같은 기준으로 들어가야 한다.

### 🧭 장르 확장 분류 규칙

기본 수집 대상은 스윙이지만, 확장 수집 시에는 **스트릿 / 살사 / 탱고 / 바차타**만 같은 스키마로 저장한다.
메인 분류는 항상 `전체 / 강습 / 소셜 / 행사 / 모집` 구조에 맞춘다.

> 현재 확장 수집 범위에서 현대무용, 고전무용, 전통무용, 발레, K-pop/커버댄스/힐댄스 등 공연예술·상업 퍼포먼스 계열은 제외한다. 분류기는 제외 판단을 위해 감지하되, 저장 단계에서는 `status: "excluded"`로 마킹하고 신규 인제스터에는 노출하지 않는다.

#### activity_type
| 값 | 의미 | 중요 기준 |
|---|---|---|
| `class` | 강습/수업/워크샵/특강 | `강습`, `수업`, `레슨`, `클래스`, `워크샵`, `입문`, `초급`, `테크닉` |
| `social` | 소셜/프랙티카/밀롱가 | 실제 소셜 문화가 있거나 `소셜`, `social`, `practica`, `milonga`, `DJ` 명시 |
| `event` | 행사/공연/파티/페스티벌/배틀 | 공연, 파티, 페스티벌, 배틀 등 공개 행사 |
| `recruit` | 모집/오디션/참가자 모집 | `오디션`, `팀원 모집`, `크루 모집`, `참가자 모집`, `멤버 모집` |

> `참가자 모집`은 행사 태그가 아니라 반드시 `activity_type: "recruit"`로 저장한다.

#### genre_family / dance_genre
| genre_family | 예시 dance_genre |
|---|---|
| `partner` | `swing`, `lindyhop`, `balboa`, `blues`, `solojazz`, `salsa`, `bachata`, `tango`, `wcs` |
| `street` | `hiphop`, `waacking`, `popping`, `locking`, `house`, `breaking`, `krump` |
| `art` | `contemporary`, `ballet`, `jazzdance`, `korean_dance`, `tap`, `musical` — **감지만 하고 수집 제외** |
| `commercial` | `kpop`, `coverdance`, `heels`, `girlish`, `choreo_lab` — **감지만 하고 수집 제외** |
| `unknown` | 장르를 확정할 수 없을 때만 사용 — **신규 저장 전 재검토하고 확정 불가 시 수집 제외** |

#### tags
`tags`는 고정 메뉴가 아니다. 실제 수집 본문에서 확인된 세부 정보만 넣는다.

사용 가능한 예시:
`audition`, `team_recruit`, `crew_recruit`, `participant`, `choreo`, `technique`, `basic`, `partnering`, `freestyle`, `workshop`, `party`, `battle`, `dj`, `performance`, `open_class`, `cover`

### 🌐 확장 장르 수집 소스 우선순위

확장 장르는 아직 스윙만큼 검증된 고정 루트가 적으므로, 매 실행마다 아래 순서로 소스를 평가한다.

1. **공식 사이트/공식 인스타그램/전문 일정 허브** — 저장 가능 후보.
2. **장르별 커뮤니티 링크트리/공식 카페/공식 채널** — 실제 게시물과 이미지가 확인되면 저장 가능.
3. **Meetup, 소모임, 블로그, 여행/리뷰 사이트** — 원칙적으로 **발견용 보조 자료만**. 여기에만 있는 정보는 저장하지 말고, 연결된 공식 인스타그램/웹사이트/원본 포스트를 찾아 확인한다.

#### 확장 장르 기준 소스 레지스트리

아래 표는 사람이 읽기 위한 요약이다. 실행 자동화는 반드시 `scripts/ingestion/collection-registry.mjs`의 `collectionSources`와 `dynamicSearchQueries`를 기준으로 돌린다.

| 장르 | 소스 | 타입 | URL | 사용 기준 |
|---|---|---|---|---|
| 탱고 | Tango Calendar Korea | website | https://tangocalendar.kr/ | 서울 밀롱가/프랙티카 일정 허브. 개별 이벤트 제목/날짜/시간/DJ 확인 후 이미지 후보 확보 시 저장 |
| 살사/바차타 | Latin in Seoul | website | https://salsa.atoo.kr/ | 홍대/강남 라틴 소셜 주간 업데이트. DJ/비율/시간이 있는 소셜 확인용 |
| 살사/바차타 | Place Ocean | website | https://www.placeocean.kr/ | 코리아 소셜댄스 허브. 세부 이벤트 페이지 또는 공식 원본 링크 확인 후 저장 |
| 살사/바차타 | SalsaVida Seoul | website | https://www.salsavida.com/guides/south-korea/seoul/socials/ | 서울 라틴 소셜 캘린더. 반복 소셜/venue 발견용이며 자체 페이지를 source_url로 저장 금지 |
| 살사/바차타 | Korea Latin Dance Hub | directory | https://latindance.kr/clubs-en | 전국 라틴 클럽/커뮤니티 디렉터리. 원본 SNS/웹사이트 역추적용 |
| 살사/바차타 | LatinDanceHub Seoul Guide | website | https://latindancehub.co/blog/where-to-dance-salsa-bachata-in-seoul | 서울 라틴 venue 규모/구조 파악용. 이벤트 원본으로 저장 금지 |
| 살사/바차타 | SA Latin | linktree/community | https://linktr.ee/sa.latin.official | 공식 채널 진입점. 실제 카페/인스타/유튜브 원본으로 들어가 확인 |
| 살사/바차타 | La Conexión / AK Salsa | website | https://www.aksalsa.com/about-1 | 살사/바차타 클래스/소셜 커뮤니티. 일정 페이지나 공식 공지 확인 후 저장 |
| 살사/바차타 | LSK Latin Dance Meetup | meetup | https://www.meetup.com/ko-KR/seoul-latin-dance-meetup-group/ | 영어권 입문/커뮤니티 반복 일정 조사용. 공식 포스터 원본 확인 전 저장 금지 |
| 살사/바차타 | SIDF | website | https://sidf.kr/ | 서울 국제 살사/바차타 페스티벌 축. 날짜/라인업/이미지 확인 시 선별 저장 |
| 살사/바차타 | Social Dance Today | website | https://social-dance.today/ | 글로벌 소셜댄스 검색. 한국 이벤트 발견 후 공식 원본으로 역추적 |
| 살사/바차타 | Flowdat | website | https://flowdat.co/ | 글로벌 댄스 이벤트 플랫폼. 한국 이벤트 원본 Instagram/공식 페이지 확인 전 저장 금지 |
| 스트릿 | Freeze KR | website | https://www.freezekr.com/stage | 스트릿 행사/배틀/공연/클래스 허브. 날짜와 이미지가 명확한 항목만 저장 |
| 스트릿 | HY Dance Studio | website | https://www.hydancestudio.com/class/streetdance | 힙합/락킹/왁킹/소울댄스 클래스. 시간표/팝업/프로모션 원문 확인 |
| 스트릿 | 이댄스학원 | website | https://e-dance.co.kr/street-dance | 힙합/팝핑/락킹/왁킹/하우스/비보잉 클래스. 단순 소개 페이지는 저장 금지, 실제 모집/원데이 공지만 저장 |

> 소스 레지스트리는 “시작점”이다. 저장은 항상 실제 날짜/장소/이미지/원본 URL이 확인된 항목만 한다. 같은 행사가 여러 허브에 동시에 있으면 공식 원본 또는 가장 정보가 완전한 원본 하나만 저장하고 나머지는 중복 후보로 기록한다.
> `discoveryOnly` 허브는 후보 저장 URL로 쓰지 않는다. 발견한 항목은 venue 공식 Instagram, 공식 웹사이트, 예약/공지 원본으로 이동한 뒤 그 URL을 `source_url`로 사용한다.

## 🤖 봇판정 방지 규칙 (필수 준수)

Instagram, 네이버 카페 등은 자동화 감지가 매우 민감하다. 아래를 반드시 지킨다.

1. **소스 간 딜레이**: 각 계정/사이트 접근 사이에 대기 시간을 넣는다. 일반 웹사이트는 **8~15초**, Instagram/네이버 카페처럼 민감한 소스는 **45초 이상**을 기본으로 한다.
   ```bash
   sleep $((RANDOM % 16 + 45))  # 민감 소스 45~60초 랜덤
   ```
2. **한 소스당 탭 1개**: 여러 탭을 동시에 열지 않는다. 순차 접근만.
3. **스크롤은 천천히**: `browser_evaluate`로 스크롤 시 한 번에 끝까지 내리지 말고 분할해서 내린다.
4. **같은 페이지 반복 접근 금지**: 한 번 접근해서 내용을 못 읽었으면 재시도 1회만. 2회 이상 금지.
5. **Headless 기본 금지**: 자동 실행 기본값은 실제 Chrome 프로필 + headed Chrome이다. headless는 사용자가 명시적으로 테스트 목적을 밝힌 경우에만 켠다.
6. **User-Agent 변경 금지**: Playwright/Chrome 기본 UA를 그대로 사용한다. 변조 시 오히려 봇 감지됨.
7. **회로 차단**: 같은 계열 소스에서 접근 실패가 연속 3회 나오면 해당 계열 수집을 즉시 중단한다. 많이 실패할수록 더 돌리는 것이 아니라 멈추는 것이 원칙이다.
8. **접근 불가 판단 기준**:
   - 로그인 페이지로 리다이렉트 → 즉시 스킵 (재시도 금지)
   - "이 페이지를 사용할 수 없습니다" → 즉시 스킵
   - 5초 내 응답 없음 → 즉시 스킵
   - **스킵한 소스는 반드시 접근불가 목록에 기록**

## 🔧 Playwright MCP 브라우저 복구 절차 (수집 시작 전 필수)

Playwright MCP 툴 호출 시 `Target page, context or browser has been closed` 오류가 나면 **즉시** 아래를 실행한다. 여러 번 재시도하지 말고 첫 오류에서 바로 복구한다.

```bash
pkill -9 -f "chrome-headless-shell" 2>/dev/null
pkill -9 -f "playwright" 2>/dev/null
sleep 1
```

실행 후 Playwright MCP 툴을 다시 호출하면 MCP 서버가 새 브라우저를 자동 스폰한다.

> ⚠️ **크래시 방지**: `localhost:8888` 등 로컬 앱은 Playwright로 접근하지 않는다. 렌더러 크래시로 브라우저가 닫히는 원인이 된다.
> ⚠️ **이미지 처리 실패 방지**: 자동 수집 중에는 `browser_take_screenshot`을 사용하지 않는다. 화면 확인은 `browser_snapshot`/`browser_evaluate`로 DOM 텍스트와 이미지 URL을 추출하고, 포스터는 브라우저 컨텍스트의 `fetch()`로 blob/base64를 받아 저장한다.

### 네이버 카페 수집 주의사항

네이버 카페의 개별 글은 최상위 문서가 아니라 `cafe_main` iframe 안에 본문과 포스터가 들어오는 경우가 많다. 따라서 카페 글에서 이미지가 없다고 판단하기 전에 반드시 아래 순서로 확인한다.

1. 목록에서 얻은 실제 글 URL(`/articles/{id}`)을 연다.
2. `page.frames().find(frame => frame.name() === 'cafe_main')` 또는 동등한 방식으로 본문 프레임을 선택한다.
3. 본문 프레임 안의 텍스트와 이미지를 추출한다.
4. 포스터 후보는 `.se-image-resource`, `cafeptthumb`, `postfiles` 중 `naturalWidth * naturalHeight`가 가장 큰 이미지를 우선한다.
5. 브라우저 프레임 안의 `fetch()`가 CORS로 막히면, 같은 이미지 URL을 일반 HTTP 요청으로 내려받되 `Referer: https://cafe.naver.com/` 헤더를 붙인다.
6. `?type=f200_200` 같은 목록 썸네일은 포스터로 쓰지 않고, 글 본문의 `?type=w1600` 등 원본 크기 이미지를 사용한다.

최상위 문서만 보고 `no article poster image`로 스킵하면 스윙스캔들/스윙타운/스윙패밀리 같은 카페 소스가 누락될 수 있다.

### 🔑 환경변수 (원격 에이전트 / 로컬 공통)
```
SUPABASE_URL=https://mkoryudscamnopvxdelk.supabase.co
SUPABASE_SERVICE_KEY=<Netlify env SUPABASE_SERVICE_KEY>
```
로컬 실행 시에는 **반드시 `.env` 또는 이미 export된 환경변수를 우선 사용**한다. `netlify env:get`은 응답 없이 멈출 수 있으므로 수집 중 직접 호출 금지.
```bash
set -a
[ -f .env ] && . .env
set +a
SUPABASE_URL="${SUPABASE_URL:-$VITE_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY}"
```

---

## 🚫 수집 제외 목록 (Excluded Sources)
수집 금지 URL — 해당 URL이 source_url인 레코드는 DB에서 `status='excluded'`로 마킹되어 인제스터에 노출되지 않음.

| URL | 이유 |
|-----|------|
| https://allaboutswing.co.kr/20 | 사용자 지정 제외 |
| https://www.meroniswing.com/ | 사용자 지정 제외 — 자동 수집 대상에서 제외 |
| https://batswing.co.kr/ | 사용자 지정 제외 — 자동 수집 대상에서 제외 |
| https://www.instagram.com/batswing2003/ | 사용자 지정 제외 — BAT SWING 인스타그램도 수집 대상에서 제외 |

수집 중 `source_url`이 `https://www.meroniswing.com/` 하위 URL이면 저장하지 말고 즉시 스킵한다.
수집 중 `source_url`이 `https://batswing.co.kr/` 하위 URL이면 저장하지 말고 즉시 스킵한다.
수집 중 `source_url`이 `https://www.instagram.com/batswing2003/` 하위 URL이면 저장하지 말고 즉시 스킵한다.

> 새 제외 URL 추가 시:
> ```bash
> set -a; [ -f .env ] && . .env; set +a
> SUPABASE_URL="${SUPABASE_URL:-$VITE_PUBLIC_SUPABASE_URL}"
> SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY}"
> curl -s -X PATCH "$SUPABASE_URL/rest/v1/scraped_events?source_url=eq.제외할URL" \
>   -H "apikey: $SUPABASE_KEY" \
>   -H "Authorization: Bearer $SUPABASE_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"status":"excluded"}'
> ```
> 그리고 이 목록에도 추가할 것.

---

## 📋 Static Collection List (정적 수집 목록)

### 🍺 바 (Bar / Venue)
| 이름 | 타입 | URL |
|------|------|-----|
| 해피홀 | instagram | https://www.instagram.com/happyhall2004/ |
| 스윙타임 | instagram | https://www.instagram.com/swingtimebar/ |
| 피에스타 | instagram | https://www.instagram.com/fiesta_swingdance/ |
| 봉천살롱 | instagram | https://www.instagram.com/bongcheonsalon/ |
| 비밥바 | instagram | https://www.instagram.com/bebopbar_swing/ |
| 루나 | instagram | https://www.instagram.com/luna_swingbar/ |
| 인더무드신림 | instagram | https://www.instagram.com/inthemood_sillim/ |
| Dialogue | instagram | https://www.instagram.com/dialogue_swing/ |
| 아수라장 | instagram | https://www.instagram.com/asurajang_swing/ |
| 쏘셜클럽 | instagram | https://www.instagram.com/sosyalclub_swing/ |
| 스윙잇 | instagram | https://www.instagram.com/swingit_seoul/ |
| 스파(SPA) | instagram | https://www.instagram.com/spa_swingdance/ |
| LQ스튜디오 | instagram | https://www.instagram.com/lq_studio_swing/ |
| 탐나홀 (제주) | instagram | https://www.instagram.com/tamnahall/ |
| KP댄스홀 | instagram | https://www.instagram.com/kpdancehall/ |
| 스탭업댄스 | instagram | https://www.instagram.com/stepupdance_swing/ |

### 🕺 동호회 (Club)
| 이름 | 타입 | URL |
|------|------|-----|
| ~~네오스윙~~ | ~~instagram~~ | ~~https://www.instagram.com/neo_swing/~~ ← **2026-04-01부터 "네오살사"로 전환, 수집 제외** |
| 스윙스캔들 | naver_cafe | https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I |
| 올어바웃스윙 | instagram | https://www.instagram.com/allaboutswing_kr/ |
| 경성홀 | instagram | https://www.instagram.com/kyungsunghall/ | ⚠️ 주 초반에 이번주 토/일/화 일정 한번에 게시. 포스트 없으면 스킵. |
| 강남웨스티스 | instagram | https://www.instagram.com/gangnam_westies/ |
| 스윙키즈 | instagram | https://www.instagram.com/swingkids_kr/ |
| 스윙프렌즈 (카페) | naver_cafe | https://cafe.naver.com/f-e/cafes/10026855/menus/85?viewType=L | ⚠️ URL 접근 불가 시 https://cafe.naver.com/swingfriends 에서 타임바 게시판 메뉴를 찾아 URL 업데이트 |
| 스윙프렌즈 (페이스북) | facebook | https://www.facebook.com/Swingfriendstimebar |
| 스윙팩토리 | instagram | https://www.instagram.com/swingfactory_kr/ |
| 스윙타운 | naver_cafe | https://cafe.naver.com/f-e/cafes/10342583/menus/264?viewType=L |
| 스윙홀릭 (광주) | instagram | https://www.instagram.com/swingholic/ |

### 🎓 강습/워크숍
| 이름 | 타입 | URL |
|------|------|-----|
| 스윙패밀리 카페 [외강&행사&연습실] | naver_cafe | https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L |
| 스위티스윙 카페 [공지/신청] | daum_cafe | https://m.cafe.daum.net/sweetyswing/5ngW |
| ~~BAT SWING~~ | ~~website~~ | ~~https://batswing.co.kr/~~ ← **사용자 지정 제외, 수집 금지** |

> ⚠️ 강습 수집 규칙:
> - 네이버 카페는 로그인 없이 접근 가능한 첫 페이지만 수집 (15개 이내)
> - 강습 시작일이 오늘 이후인 것만 수집
> - 정기 강습(~8주 과정)은 시작일 기준 1건만 등록 (매주 쪼개기 금지)

### 🎪 연합/대형 행사
| 이름 | 타입 | URL |
|------|------|-----|
| CSI (CampSwingIt) | instagram | https://www.instagram.com/campswingit/ |
| 바다제 (제주) | instagram | https://www.instagram.com/badaje_jeju/ |
| 부산 린디합 위켄드 | instagram | https://www.instagram.com/busan_lindy_weekend/ |
| 서울 린디페스트 | instagram | https://www.instagram.com/seoulindyfest/ |

---

## 🔍 동적 검색 키워드 (Dynamic Search Keywords)
- `"스윙댄스 2026"`
- `"스윙댄스 소셜 모집"`
- `"스윙댄스 파티"`
- `"스윙댄스 라이브"`
- `"린디합 2026"`
- `"웨스트코스트스윙 2026"`
- `"스윙댄스 강습"`
- `"스윙 소셜 서울"`
- `"스윙 소셜 부산"`

### 확장 장르 검색 키워드
실제 포스트와 이미지가 확인된 경우에만 수집한다. 검색 결과가 홍보성 목록/블로그 요약뿐이면 삽입하지 않는다.

- `"site:instagram.com 서울 탱고 밀롱가"`
- `"site:instagram.com 서울 바차타 소셜"`
- `"site:instagram.com 서울 살사 소셜"`
- `"site:instagram.com 서울 힙합 워크샵"`
- `"site:instagram.com 왁킹 팝핑 락킹 워크샵 서울"`
- `"힙합 댄스 워크샵 2026"`
- `"왁킹 오디션 모집"`
- `"팝핑 워크샵 서울"`
- `"락킹 크루 모집"`
- `"브레이킹 배틀 참가자 모집"`
- `"살사 소셜 서울 2026"`
- `"살사 클래스 모집 서울"`
- `"탱고 밀롱가 서울 2026"`
- `"탱고 프랙티카 서울"`
- `"바차타 소셜 서울 2026"`
- `"바차타 클래스 모집 서울"`

---

## 🛠 수집 및 저장 절차

### 0. 과거 완료 데이터 자동 정리 (수집 시작 전 필수)
수집을 시작하기 전에 **반드시** `is_collected=true`이면서 이벤트 날짜(`structured_data.date`)가 오늘 이전인 레코드를 삭제한다.

자동 실행에서는 래퍼(`/Users/inteyeo/scripts/run-ingestion.sh`)가 아래 전용 스크립트를 먼저 실행한다.
따라서 자동 수집 에이전트는 raw `DELETE`를 다시 실행하지 말고, 환경변수 `INGESTION_PRE_CLEANUP_COUNT` 값을 summary의 `과거데이터삭제`에 사용한다.

```bash
node scripts/ingestion/cleanup-past-collected.mjs --apply --out "/Users/inteyeo/ingestion-runs/manual-cleanup-$(date +%Y%m%d_%H%M%S).json"
```

> 기준: **이벤트 해당일(`structured_data.date`) < 오늘** 인 완료 데이터만 삭제. 미래 이벤트는 건드리지 않음.
> 정리 결과 JSON에는 삭제 대상 `id`, `display_no`, 날짜, 제목, 장소, 원본 URL이 남아야 한다.

### 1. 검색 및 데이터 추출
- 게시물 주소(`source_url`), 내용 요약(`extracted_text`), 날짜(`structured_data.date`), 이미지를 추출한다.
- 날짜가 명확하지 않은 경우 본문 텍스트에서 요일을 대조하여 날짜를 확정한다.

### 2. 이미지 수집 및 Supabase Storage 업로드 (필수)

#### 이미지 품질 규칙 — 크롭/썸네일 금지

- Instagram/Facebook의 `twitter:image`, `og:image`는 미리보기용 정사각 크롭인 경우가 많으므로 **1순위로 사용 금지**.
- Instagram 개별 포스트는 반드시 **큰 데스크탑 뷰포트(예: 1600x1200, deviceScaleFactor 2)** 로 직접 열고, 렌더링된 `article img`의 `currentSrc`/`naturalWidth`/`naturalHeight`를 기준으로 고른다. 작은 뷰포트나 프로필 그리드에서 얻은 URL은 `p240x240` 저해상도 후보가 되기 쉽다.
- Instagram 메타 이미지가 크롭/저해상도이면 곧바로 스킵하지 말고, 큰 뷰포트로 포스트를 다시 로드해서 실제 본문 이미지를 재추출한다. 이 재추출 후에도 500px 미만/크롭 후보뿐일 때만 스킵한다.
- 아래 URL 패턴은 크롭/저해상도 가능성이 높다. 원본 포스터임을 별도 확인하지 못하면 사용하지 않는다.
  - `p240x240`, `s240x240`
  - `s640x640`
  - `stp=c...` 또는 `c숫자.숫자.숫자.숫자a_dst`
- 포스터를 고를 때는 페이지 안의 후보 이미지를 모두 모아 `naturalWidth * naturalHeight`가 가장 크고, 프로필 이미지/썸네일이 아닌 것을 선택한다.
- 저장 전 내려받은 파일의 크기와 비율을 확인한다. 포스터의 제목/날짜/본문이 이미지 가장자리에서 잘려 보이면 삽입하지 말고 스킵한다.
- 원본 또는 충분히 큰 비크롭 이미지를 확보하지 못하면 **후보를 저장하지 않는다**. 잘린 이미지를 넣는 것보다 스킵이 낫다.

**방법 A — Playwright로 CDN URL 추출 후 Supabase Storage 업로드 (권장)**
```bash
# 환경변수 세팅
set -a
[ -f .env ] && . .env
set +a
SUPABASE_URL="${SUPABASE_URL:-$VITE_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY}"

# 1. Playwright로 이미지 CDN URL 추출 후 임시 파일로 다운로드
curl -s -L "CDN_URL" -o /tmp/파일명.jpg

# 1-B. 이미지 크기 확인. 크롭/썸네일이면 저장 금지.
file /tmp/파일명.jpg
sips -g pixelWidth -g pixelHeight /tmp/파일명.jpg 2>/dev/null

# 2. Supabase Storage에 업로드
curl -s -X POST "$SUPABASE_URL/storage/v1/object/scraped/파일명.jpg" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: image/jpeg" \
  -H "x-upsert: true" \
  --data-binary @/tmp/파일명.jpg

# 3. poster_url은 Supabase Storage public URL
# poster_url = "$SUPABASE_URL/storage/v1/object/public/scraped/파일명.jpg"
```

**방법 B — PNG 이미지인 경우**
```bash
curl -s -X POST "$SUPABASE_URL/storage/v1/object/scraped/파일명.png" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: image/png" \
  -H "x-upsert: true" \
  --data-binary @/tmp/파일명.png
```

> ⚠️ **poster_url 경로 규칙**: Supabase Storage public URL을 사용한다.
> 형식: `https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg`
> 로컬 `/scraped/` 경로 및 `/.netlify/functions/scraped-image?file=` 형식은 **원격 에이전트에서 사용 금지**.

### 3. ID 생성 규칙 (L1 중복 방지 — 반드시 준수)

**ID는 `source_url + date`를 조합한 결정론적 해시로 고정 생성한다.**
같은 포스트 + 같은 날짜면 항상 같은 ID → DB의 PK 중복 제약이 자동으로 재삽입을 막는다.

자동화 코드에서는 직접 구현하지 말고 `scripts/ingestion/candidate-utils.mjs`의 `makeDeterministicId(source_url, date, suffix)`를 우선 사용한다.

```bash
ID=$(python3 -c "
import hashlib
source_url = 'https://실제_소스_URL'
date = '2026-MM-DD'
raw = f'{source_url}|{date}'
print(hashlib.md5(raw.encode()).hexdigest()[:16])
")
```

**규칙:**
- 하나의 포스트에서 날짜가 다른 여러 이벤트 → 날짜가 달라지므로 ID도 달라진다 → 정상
- 하나의 포스트에서 같은 날짜에 두 이벤트(예: 소셜 + 워크숍) → 접미사 `_2` 추가: `{hash}_2`
- **절대 UUID를 임의 생성하거나 임의 문자열로 ID를 만들지 말 것**

---

### 3-B. 삽입 전 크로스소스 중복 체크 (L2/L3 — 필수)

**L1(PK해시)만으로는 막지 못하는 중복이 있다:**
- 같은 행사가 Instagram + Facebook + 카페에 동시 게시 → 소스 URL이 달라서 L1 통과 → 3건 삽입
- 매주 반복 소셜이 새 포스트로 올라올 때마다 → 새 URL → 재삽입
- 동일 행사를 2주 전, 1주 전 두 번 공지 → 2건 삽입

**삽입 전 반드시 아래 체크를 수행하고, 중복으로 판단되면 삽입을 건너뛴다.**

#### L2 — 정규화 제목 시맨틱 해시 체크

삽입할 이벤트의 `(정규화제목 + date)`로 시맨틱 ID를 생성하고, DB에 같은 값이 있으면 스킵.

```bash
# 시맨틱 ID 생성 (제목 정규화: 소문자, 공백/특수문자 제거, 조사 제거)
TITLE="삽입할 이벤트 제목"
DATE="2026-MM-DD"

SEMANTIC_ID=$(python3 -c "
import hashlib, re
title = '$TITLE'
date = '$DATE'
# 정규화: 소문자, 영숫자+한글만 남김, 공백 제거
normalized = re.sub(r'[^\w가-힣]', '', title.lower().replace(' ', ''))
# 흔한 접두/접미 노이즈 제거 (장소 표시, @ 등은 이미 특수문자 제거로 처리됨)
raw = f'{normalized}|{date}'
print('sem_' + hashlib.md5(raw.encode()).hexdigest()[:12])
")

# DB에서 같은 시맨틱 ID가 있는지 확인
set -a
[ -f .env ] && . .env
set +a
SUPABASE_URL="\${SUPABASE_URL:-\$VITE_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="\${SUPABASE_KEY:-\$SUPABASE_SERVICE_KEY}"

EXISTING=\$(curl -s "\$SUPABASE_URL/rest/v1/scraped_events?semantic_id=eq.\$SEMANTIC_ID&select=id,structured_data->>title" \
  -H "apikey: \$SUPABASE_KEY" \
  -H "Authorization: Bearer \$SUPABASE_KEY")

COUNT=\$(echo "\$EXISTING" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
if [ "\$COUNT" -gt 0 ]; then
  echo "⏭ L2 시맨틱 중복 스킵: \$TITLE (\$DATE) — 이미 존재"
  # 스킵 카운터 증가 후 다음 이벤트로
fi
```

> `semantic_id` 컬럼이 DB에 없으면 L3 쿼리로만 체크해도 된다.

#### L3 — 같은 날짜 DB 조회 + 문자 trigram + 공통 접두어 유사도 체크

같은 날짜 이벤트를 DB에서 조회하고, 문자 trigram 유사도와 장소명 접두어 일치로 중복을 판단한다.
(단어 토큰 방식은 한글 복합어에 취약하므로 문자 단위 n-gram을 사용한다.)

```bash
DATE="2026-MM-DD"
TITLE="삽입할 이벤트 제목"

set -a
[ -f .env ] && . .env
set +a
SUPABASE_URL="${SUPABASE_URL:-$VITE_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY}"

# 같은 날짜 기존 이벤트 조회 (수집완료/미수집 모두 포함 — is_collected 필터 제거 필수)
SAME_DATE=$(curl -s "$SUPABASE_URL/rest/v1/scraped_events?structured_data->>date=eq.$DATE&select=id,structured_data->>title" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY")

IS_DUP=$(echo "$SAME_DATE" | python3 -c "
import sys, json, re

def norm(s):
    return re.sub(r'[^\w가-힣a-zA-Z0-9]', '', s.lower())

def trigrams(s):
    s = norm(s)
    return set(s[i:i+3] for i in range(len(s)-2)) if len(s) >= 3 else set(s)

def ngram_sim(a, b):
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb: return 0
    return len(ta & tb) / len(ta | tb)

def common_prefix_len(a, b):
    na, nb = norm(a), norm(b)
    i = 0
    while i < min(len(na), len(nb)) and na[i] == nb[i]:
        i += 1
    return i

def is_dup(t1, t2):
    ng = ngram_sim(t1, t2)
    cp = common_prefix_len(t1, t2)
    n1, n2 = norm(t1), norm(t2)
    s1, s2 = n1[cp:], n2[cp:]
    sfx_ng = ngram_sim(s1, s2) if s1 and s2 else 1.0

    # suffix가 길고(4자+) 내용이 완전히 다르면 → 다른 이벤트 (같은 기수 다른 레벨 등)
    if len(s1) >= 4 and len(s2) >= 4 and sfx_ng < 0.3 and cp < len(n1) * 0.85:
        return False

    if ng >= 0.55: return True
    if cp >= 5 and ng >= 0.25: return True
    if cp >= 3 and ng >= 0.45: return True
    return False

new_title = '$TITLE'
data = json.load(sys.stdin)
for row in data:
    ex_title = row.get('title') or ''
    if is_dup(new_title, ex_title):
        print(f'DUP:{ex_title[:35]}')
        break
else:
    print('OK')
")

if [[ "$IS_DUP" == DUP:* ]]; then
  DUP_INFO="${IS_DUP#DUP:}"
  echo "⏭ L3 중복 스킵: $TITLE  →  '$DUP_INFO'"
  # 스킵 카운터 증가 후 다음 이벤트로
fi
```

**L3 중복 판단 기준 (실 데이터 검증 완료, 정확도 91%):**
| 조건 | 판단 | 예시 |
|------|------|------|
| suffix 4자+ & suffix_ng < 0.3 & cp < 85% | **독립 이벤트** (먼저 판단) | 네오스윙 139기 베이직 ↔ 네오스윙 139기 초중급 |
| trigram 유사도 ≥ 0.55 | 중복 | 스윙타임바수요소셜 ↔ 스윙타임바수요소셜댄스 |
| 공통 접두어 ≥ 5자 + trigram ≥ 0.25 | 중복 | 봉천살롱토봉소셜 ↔ 봉천살롱토요소셜 |
| 공통 접두어 ≥ 3자 + trigram ≥ 0.45 | 중복 | 해피홀금요소셜 ↔ 해피홀금요일소셜 |
| 나머지 | 독립 이벤트 (삽입 OK) | 경성홀소셜 ↔ 봉천살롱소셜 |

> ✅ **같은 기수 다른 레벨 강습 자동 통과**: "네오스윙 139기 베이직" ↔ "네오스윙 139기 초중급" — suffix가 길고 달라서 자동으로 독립 이벤트 판정. 실 DB 검증 완료.
> ✅ **날짜 필터 선행**: 다른 날의 정기소셜끼리 오탐하는 케이스는 실전에서 발생하지 않음.

---

### 4. 데이터 저장 — Netlify 수집 API

- **실제 데이터 소스는 Supabase `scraped_events` 테이블**이다.
- `sqlite3` 명령 및 로컬 DB 파일은 **원격 에이전트에서 사용 금지**.
- **신규 후보 삽입은 반드시 `https://swingenjoy.com/.netlify/functions/scraped-events`로만 실행한다.**
- **Supabase REST API(PostgREST)로 `scraped_events`에 직접 INSERT/UPSERT 금지.**
  - 직접 INSERT는 운영 `events` 테이블 중복 검사와 `display_no` 부여를 우회한다.
  - 예: 이미 운영 DB에 있는 `Rockin' & Swingin' Festival 2026` 같은 행사가 새 후보로 다시 들어올 수 있다.
- L2/L3 자체 체크를 수행하더라도, 최종 삽입은 Netlify 함수가 한 번 더 검증하게 해야 한다.
- Netlify 응답의 `count: 0` + `skipped`는 정상 중복 스킵이다. 실패로 간주하지 말고 스킵 카운터에 반영한다.

```bash
# L1 ID 생성
ID=$(python3 -c "import hashlib; print(hashlib.md5('https://source_url|2026-MM-DD'.encode()).hexdigest()[:16])")

curl -s -X POST "https://swingenjoy.com/.netlify/functions/scraped-events" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$ID\",
    \"keyword\": \"키워드\",
    \"source_url\": \"https://source_url\",
    \"poster_url\": \"https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg\",
    \"extracted_text\": \"본문 요약\",
    \"structured_data\": {\"date\":\"2026-MM-DD\",\"day\":\"요일\",\"title\":\"이벤트명\",\"event_type\":\"소셜\",\"activity_type\":\"social\",\"genre_family\":\"partner\",\"dance_genre\":\"swing\",\"tags\":[\"dj\"],\"status\":\"정상운영\",\"djs\":[],\"times\":[],\"location\":\"장소\",\"fee\":\"금액\",\"note\":\"\"},
    \"is_collected\": false
  }"
```

**중복 체크 요약 (3단계 레이어):**
| 레이어 | 방법 | 감지하는 중복 유형 |
|--------|------|-------------------|
| L1 | source_url + date PK 해시 | 완전히 동일한 포스트 재수집 |
| L2 | 정규화 제목 + date 시맨틱 해시 | 다른 포스트지만 동일 내용 (리마인더 등) |
| L3 | 같은 날짜 DB 조회 + 자카드 유사도 | 크로스소스 중복 (Instagram + Facebook 등) |

### 4. event_type / activity_type 분류 기준
- `소셜` — 소셜댄스, 위클리 소셜, 오픈파티 (입문자 포함 누구나 참여)
- `파티/행사` — DJ 파티, 졸업파티, 특별행사
- `강습` — 강습, 클래스, 워크샵

> ⚠️ `event_type` 필드가 structured_data에 있으면 자동 분류를 덮어씀. 반드시 명시할 것.
> ⚠️ `activity_type`은 인제스터 필터용 세부 분류다. 모집/오디션/참가자 모집은 `event_type: "파티/행사"`가 아니라도 `activity_type: "recruit"`로 반드시 표시한다.

### 4-B. 운영 DB 등록 매핑 기준

수집 데이터는 관리자 검수용 원천 데이터이고, 운영 `events` 테이블 등록 시에는 아래 내부 코드로 변환된다.
수집 시 `structured_data.event_type`, `structured_data.location`, `structured_data.address`, `structured_data.venue_id`, `structured_data.location_link`를 가능한 한 정확히 채워서 등록 화면의 재입력을 줄인다.

| 수집 `activity_type` | 운영 `category` | 운영 `genre` | `group_id` |
|---|---|---|---|
| `social` | `social` | `소셜` | `2` |
| `class` | `class` | `강습` | `null` |
| `event` | `event` | `행사` | `null` |
| `recruit` | `event` | `모집` | `null` |

장소는 다음 우선순위로 저장한다.
1. 기존 `venues` 테이블과 매칭 가능한 `venue_id`, `address`, Kakao 지도 링크(`location_link`)
2. 카카오 지도 검색에 안전한 짧은 장소명
3. 소스 계정의 고정 장소명(예: `swingtimebar` → `스윙타임`)

장소명에 지역 보조표기가 붙어 있으면 `structured_data.location`에는 넣지 않는다.
예: `경성홀(신촌)`은 `location: "경성홀"`, `address: "서울 마포구 신촌로16길 30 지하 1층"`, `venue_id: "..."`, `location_link: "http://place.map.kakao.com/..."`로 저장한다.
지역/층/부가설명은 주소나 `note`에 둔다. 장소명에 섞으면 운영 등록 후 카카오 지도 인식률이 떨어진다.

DJ 이름은 장르가 아니다. DJ는 `structured_data.djs`와 제목/설명에만 사용하고, 소셜 장르는 `소셜`로 저장한다.

---

## 📋 완료 검증 (Final Checklist)
- [ ] `node scripts/test-ingestion-standards.mjs`가 통과했는가? (수집 규칙/소스/후보 구조 변경 시 필수)
- [ ] 실제 포스트 URL을 직접 열어서 내용을 읽었는가? (추측/패턴 삽입 아님)
- [ ] 소셜 이벤트는 DJ 이름이 포스트에 명시되어 있었는가?
- [ ] 이미지가 Supabase Storage에 업로드되었는가?
  ```bash
  curl -s "https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg" -o /dev/null -w "%{http_code}"
  # 200이면 OK
  ```
- [ ] 수집된 행사의 날짜가 오늘 이후인가?
- [ ] `structured_data.activity_type`, `genre_family`, `dance_genre`, `tags`가 실제 본문 기준으로 채워졌는가?
- [ ] 오디션/팀원/크루/참가자 모집이 `activity_type: "recruit"`로 분류되었는가?
- [ ] `poster_url`이 Supabase Storage public URL 형식인가?
  (`https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg`)
- [ ] Supabase DB에 정상 삽입되었는가?
  ```bash
  set -a
[ -f .env ] && . .env
set +a
SUPABASE_URL="${SUPABASE_URL:-$VITE_PUBLIC_SUPABASE_URL}"
  SUPABASE_KEY="${SUPABASE_KEY:-$SUPABASE_SERVICE_KEY}"
  curl -s "$SUPABASE_URL/rest/v1/scraped_events?is_collected=eq.false&order=created_at.desc&limit=5&select=id,poster_url,structured_data->>title" \
    -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
  ```
- [ ] `http://localhost:8888/admin/v2/ingestor` 신규 탭에서 이미지 썸네일이 표시되는가? (로컬 실행 시)

---

## 📝 수집 완료 후 — 실행 로그 보고서 갱신 (수동 점검 전용)

`swing-daily` 자동 실행 중에는 이 섹션을 수행하지 않는다. 자동 실행은 summary 출력이 최우선이며, 실행 기록은 래퍼가 run 파일과 Telegram으로 남긴다.

사용자가 별도 수동 보고서 갱신을 지시했을 때만 `/Users/inteyeo/Rhythmjoy2025555-5/docs/INGESTION_STATUS.md` 파일의 `## 📊 실행 로그` 섹션에 이번 회차 결과를 추가한다.

> ⚠️ **경로 고정**: 이 파일은 git 관리 대상. `/Users/inteyeo/scripts/INGESTION_STATUS.md` (구 경로)는 더 이상 사용하지 않는다.

### 추가 형식
```markdown
### YYYY-MM-DD HH:MM 실행
- **신규 수집**: N건
- **중복 스킵**: N건
- **접근 불가**: [계정명(사유), 계정명(사유), ...]
- **이슈**:
  - [발생한 문제 — 예: Stream timeout, 이미지 업로드 실패, 비공개 계정 등]
- **개선 필요**:
  - [다음 회차에 반영할 사항]
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | ... | ... | ... | ... |
```

### 갱신 절차
1. `/Users/inteyeo/Rhythmjoy2025555-5/docs/INGESTION_STATUS.md` 파일을 Read로 읽는다.
2. `## 📊 실행 로그` 섹션이 없으면 만든다.
3. **최신 회차를 맨 위에 추가**한다 (오래된 것이 아래).
4. 잔존 문제(`## 🚨 잔존 문제`) 섹션도 최신 상태로 업데이트한다.
   - 해결된 이슈는 ✅로 표시, 신규 이슈는 추가.
5. Write/Edit로 파일을 저장한다.

### ⚠️ 기록 필수 규칙 (모든 실행에 적용)
- **날짜+시간 헤더 필수**: `### YYYY-MM-DD HH:MM 실행` 형식 — 생략 불가
- **접근 불가 소스 전부 기록**: 이름 + 사유 (로그인 리다이렉트 / DNS 오류 / 렌더링 실패 등)
- **이슈 발생 시 즉시 기록**: 오류 메시지 원문 포함, 재발 방지를 위해 구체적으로 남길 것
- **잔존 문제 섹션 갱신**: 새 문제 발견 시 날짜 명시해서 추가, 기존 문제 해결되면 ✅ 처리
- 같은 문제를 두 번 조사하지 않도록 — **기록이 없으면 다음 에이전트가 반복한다**

---

## 📤 수집 종료 시 — Telegram 요약 출력 (필수 마지막 단계)

자동 실행에서는 수집 루프 직후 **반드시** 아래 형식을 stdout에 출력한다.
수동 점검으로 INGESTION_STATUS.md를 갱신하는 경우에도 마지막에는 같은 블록을 출력한다.
run-ingestion.sh가 이 블록을 파싱해서 Telegram으로 전송한다. **형식 절대 변경 금지.**

> ⚠️ **호출 방식과 무관하게 항상 출력 필수**: LaunchAgent 자동실행이든, 터미널 수동 실행이든, "직접 호출이라 생략" 같은 판단 절대 금지. 항상 출력한다.

> ⚠️ **신규/스킵 카운팅 기준**: `신규`는 DB에 실제로 새로 삽입된 건수. `ignore-duplicates`로 스킵된 건수는 `스킵`으로 기록한다. DB insert 응답이 빈 배열 `[]`이면 스킵된 것.

```
==TELEGRAM_SUMMARY_START==
신규: N건
스킵: N건
과거데이터삭제: N건
접근불가: 소스명(사유), 소스명(사유)
이슈: 없음  ← 또는 발생한 이슈 한 줄 요약
==TELEGRAM_SUMMARY_END==
```

예시:
```
==TELEGRAM_SUMMARY_START==
신규: 5건
스킵: 3건
접근불가: 봉천살롱(비공개), batswing.co.kr(DNS오류), 스위티스윙(렌더링실패)
이슈: 없음
==TELEGRAM_SUMMARY_END==
```

- 접근불가가 없으면: `접근불가: 없음`
- 평소에 되던 소스가 이번에 막혔으면 이슈 항목에 명시: `이슈: 해피홀 평소 접근 가능했으나 오늘 로그인 리다이렉트`
