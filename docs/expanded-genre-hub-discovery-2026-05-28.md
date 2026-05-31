# 확장 장르 허브/씬 동향 소스 조사 2026-05-28

**목적**: 개별 이벤트를 바로 수집하는 것이 아니라, 각 장르 씬의 일정과 동향을 누가 주기적으로 모으는지 먼저 찾는다.  
**범위**: 스윙 제외. 살사, 바차타, 탱고, 스트릿.  
**상태**: 운영 DB/Storage 저장 없음. 인제스터 삽입 없음.

## 결론

타장르는 스윙처럼 “개별 공식 인스타를 바로 순회”하는 방식으로 시작하면 효율이 낮다. 먼저 아래 허브를 주기적으로 확인하고, 그 안에서 반복 venue/organizer를 뽑은 뒤 원본 게시물로 역추적하는 흐름이 맞다.

1. 라틴/바차타: `Latin in Seoul`, `Where to Dance Salsa`, `SalsaVida`, `PlaceOcean`
2. 탱고: `Tango Calendar Korea`, `PlaceOcean`, `Tanguear`, 공식 페스티벌/대회 사이트
3. 스트릿: `DanceCode`, `FREEZE`, `Flowdat`, `DanceChives`

즉시 저장 가능한 원본과, 씬 지도용 허브는 분리한다. 허브는 “어디서 뭐가 돌아가는지”를 파악하는 지도이고, 저장 후보는 날짜/장소/이미지/공식 원본 URL이 모두 확인된 개별 페이지나 게시물이어야 한다.

## 워처 실행 결과

`scripts/ingestion/expanded-hub-watch.mjs --date=2026-05-28`를 실행해 24개 우선 허브를 실제 점검했다.

- 접근 성공: 23/24
- 라틴 live hub: `latin-in-seoul-weekly`, `salsavida-seoul`, `salsavida-seoul-calendar`, `where-to-dance-salsa-seoul`, `korea-latin-dance-hub`, `latindancehub-seoul-guide`, `lsk-meetup`
- 바차타 live hub: `where-to-dance-bachata-seoul`
- 탱고 official candidate: `chuncheon-tango-festival`, `jeju-summ-milonga`, `tangotocup-seoul`
- 탱고 needs-js-route: `tangocalendar`
- 스트릿 live hub: `dancechives`
- 접근 문제: `freezekr-stage`는 현재 로컬 DNS 실패

결과 파일:

- `docs/expanded-genre-hub-watch-2026-05-28.md`
- `docs/research-data/expanded-genre-hub-watch-2026-05-28.json`

이번 결과로 다음 작업 순서는 `라틴 venue 추출 -> 탱고 공식 행사 후보 검증 -> 스트릿 DanceCode/Flowdat/DanceChives 보강 -> FREEZE DNS 대체 접근 확인`으로 잡는다.

## 라틴 / 바차타

| 우선순위 | 소스 | URL | 역할 | 살아있음 | 저장 정책 |
|---|---|---|---|---|---|
| A | Latin in Seoul weekly | https://salsa.atoo.kr/category/weekly-info/ | 서울 라틴 주간 현황판. 홍대/강남 venue별 요일, 시간, DJ, Salsa/Bachata 비율 제공 | Playwright 200, 본문 40k+, 이미지 223개, 2026-05-27~31 확인 | 허브. venue 공식 원본 역추적 후 저장 |
| A | Where to Dance Salsa Seoul | https://where-to-dance-salsa.com/cities/seoul/ | 서울 salsa/bachata/zouk recurring weekly social 디렉터리 | Playwright 200, weekly 표시 확인 | 외부 허브. 자체 저장 금지, venue 검증용 |
| A | Where to Dance Bachata Seoul | https://where-to-dance-salsa.com/bachata/seoul/weekly/ | 서울 바차타 weekly social 수/venue 구조 확인 | Playwright 200, weekly 표시 확인 | 외부 허브. 자체 저장 금지 |
| A- | SalsaVida Seoul Calendar | https://www.salsavida.com/guides/south-korea/seoul/calendar/ | 서울 라틴 캘린더. recurring social/class/festival 확인 | Playwright 200, 본문 13k+, 링크 384개 | 외부 허브. 공식 venue/organizer 역추적 |
| B | PlaceOcean | https://www.placeocean.kr/ | Salsa/Bachata/Tango/WCS 허브 진입점 | Playwright 200, 링크 적음 | 허브 링크 목적지 추출 필요 |
| B | LatinDanceHub Seoul Guide | https://latindancehub.co/blog/where-to-dance-salsa-bachata-in-seoul | venue 규모/문화 설명. 씬 구조 파악에 유용 | 기존 프로브 접근 성공 | 씬 설명용. 이벤트 저장 금지 |
| B | Korea Latin Dance Hub | https://latindance.kr/clubs-en | 전국 Latin club/community directory | 기존 프로브 접근 성공 | 원본 SNS/웹 역추적용 |
| B | Flowdat Korea | https://flowdat.co/ | 글로벌 이벤트 플랫폼. 한국 라틴 이벤트 발견 | 개별 AFTER JEJU 샘플 접근 성공 | 발견용. 원본 Instagram/공식 페이지 확인 전 저장 금지 |
| C | Meetup/JDC/LSK | https://www.meetup.com/seoul-latin-dance-salsa-bachata/ | 영어권 입문/클래스/커뮤니티 흐름 파악 | 검색 확인 | 발견용. 자체 저장 금지 |

### 라틴/바차타 판단

라틴/바차타는 이미 “이번 주 어디서 춤추는지”를 모으는 허브가 많다. Rhythmjoy가 모든 반복 소셜을 복제하면 중복과 원본성 문제가 커진다. 대신 허브를 통해 반복 venue를 뽑고, 공식 venue 계정 또는 공식 행사 페이지가 있는 것만 저장 후보로 승격한다.

## 탱고

| 우선순위 | 소스 | URL | 역할 | 살아있음 | 저장 정책 |
|---|---|---|---|---|---|
| A | Tango Calendar Korea | https://tangocalendar.kr/ | 서울 탱고 밀롱가/이벤트 캘린더 | 검색 확인. Playwright 본문은 JS 때문에 짧음 | 씬 지도 핵심. 별도 JS/API 렌더링 분석 필요 |
| A- | PlaceOcean Tango | https://www.placeocean.kr/ | Korea Milonga Schedule 진입점 | Playwright 200 | 링크 목적지 추출 필요 |
| B | Tanguear Seoul | https://tanguear.com/event/3af5-6126 | 글로벌 탱고 이벤트 캘린더에 서울 이벤트 노출 | Playwright 200 | 외부 허브. 공식 원본 확인 필요 |
| B | Enjoy Tango | https://www.enjoytango.com/ | 글로벌 밀롱가 디렉터리 | 기존 조사에서 서울 샘플 확인 | 발견용 |
| C | Korea Tango Cooperative | https://www.koreatango.co.kr/ | 대회/워크샵/공지 공식 축 | 기존 프로브 미래 날짜 2개, 이미지 8개 | 공식 게시물 단위 저장 후보 |
| C | TangotoCUP Seoul Preliminary | https://tangotocup.com/competition/65 | 2026 서울 예선 공식 대회 페이지 | Playwright 200, 2026-07-10~12 확인 | 공식 이벤트 후보 |
| C | Jeju SUMM Milonga | https://www.jejusummmilonga.com/ | 제주 탱고 행사 공식 페이지 | Playwright 200, August 일정 확인 | 공식 이벤트 후보 |
| C | Chuncheon International Tango Festival | https://kcctf.org/ | 춘천 탱고 페스티벌 공식 페이지 | Playwright 200, 2026-10-03~05 확인 | 공식 이벤트 후보 |
| C- | events1000 Milonga pages | https://www.events1000.com/ | Facebook성 미러/행사 디렉터리 | 검색 확인 | 원본성 낮음. 저장 금지 |

### 탱고 판단

탱고는 반복 밀롱가 캘린더가 따로 존재한다. Rhythmjoy는 `Tango Calendar Korea`를 외부 캘린더로 소개하거나 링크 허브로 쓰고, 공식 페스티벌/대회/워크샵처럼 이미지와 상세가 있는 것만 저장 후보로 삼는 편이 맞다.

## 스트릿

| 우선순위 | 소스 | URL | 역할 | 살아있음 | 저장 정책 |
|---|---|---|---|---|---|
| A | DanceCode | https://www.dancecode.kr/ | 스트릿 배틀/행사/모집 플랫폼. 신청, 명단, 대진표까지 포함 | Playwright 200, 행사 라인업 확인 | 개별 상세 페이지 단위 저장 후보 |
| A | FREEZE stage | https://www.freezekr.com/stage | 댄스 수업/행사 예약 플랫폼. 배틀/퍼포먼스/기타 | 검색 크롤러 확인. 현재 로컬 DNS 실패 | 자동 접근 안정화 필요. 살아있으면 개별 상세 후보 |
| B | Flowdat street samples | https://flowdat.co/ | 글로벌 이벤트 플랫폼. 한국 스트릿 배틀 샘플 노출 | 동방배틀 샘플 Playwright 200 | 발견용. Instagram/공식 주최자 역추적 |
| B | DanceChives | https://dancechives.com/ | 스트릿 이벤트/배틀 영상 아카이브, Instagram URL 기반 수집 도구 | Playwright 200 | 과거/아카이브 성격. 동향/주최자 발견용 |
| B- | Event-us dance category | https://event-us.kr/ | 일반 행사 플랫폼에서 댄스/스트릿 행사 일부 노출 | 검색 확인 | 발견용. 공식 원본 대조 필요 |
| C | DanceCode 개별 상세 | https://www.dancecode.kr/dance/view/258 | HSDF 2026 등 개별 배틀/행사 상세 | Playwright 200, 날짜/장소/비용/이미지 확인 | 공식 플랫폼 상세 후보 |
| C | World Supremacy Battlegrounds | https://worldsupremacybattlegrounds.com/ | 글로벌 스트릿 대회 구조 참고 | 검색 확인 | 한국 씬 직접 수집원은 아님 |

### 스트릿 판단

스트릿은 라틴/탱고보다 “소셜 일정”보다 “배틀/공연/모집/워크샵” 중심이다. DanceCode가 가장 구조화되어 있고, FREEZE는 후보지만 로컬 DNS 실패 때문에 자동화 안정성을 다시 봐야 한다. Flowdat/DanceChives는 원본 찾기 위한 보조 허브로 본다.

## 지금까지 실제 테스트한 것

- 기존 레지스트리 기반 33개 소스 Playwright 프로브: `docs/expanded-genre-research-probe-2026-05-28.md`
- 추가 허브 15개 수동 Playwright 접근 테스트:
  - 접근 성공: Latin in Seoul weekly, Where to Dance Salsa, Where to Dance Bachata, SalsaVida Calendar, PlaceOcean, Tango Calendar, Tanguear, TangotoCUP, Jeju SUMM Milonga, Chuncheon Tango Festival, DanceCode, DanceCode HSDF, DanceChives, Flowdat street sample, Flowdat latin sample
  - 접근 실패/주의: FREEZE는 검색에는 살아 있으나 현재 로컬 DNS에서 `www.freezekr.com` 해석 실패. `bsbachata.com`도 DNS 실패.

## 다음 수집 설계

### 1단계: 허브 워처

매일 또는 주 2~3회 아래 허브만 먼저 확인한다.

- Latin/Bachata: Latin in Seoul, Where to Dance Salsa, SalsaVida, PlaceOcean
- Tango: Tango Calendar Korea, PlaceOcean, Tanguear, Korea Tango Cooperative
- Street: DanceCode, FREEZE, Flowdat, DanceChives

산출물은 DB 저장이 아니라 `scene_source_snapshots` 성격의 로그다.

### 2단계: 원본 역추적

허브에서 발견한 venue/organizer를 공식 계정 또는 공식 상세 페이지로 이동한다.

- venue 이름
- 반복 요일
- 공식 URL
- 포스터 이미지 가능 여부
- Kakao 지도 매칭 가능 장소명
- 활동 타입: class/social/event/recruit

### 3단계: 저장 후보 승격

아래가 모두 충족될 때만 인제스터 후보로 넣는다.

1. 미래 날짜
2. 장소 또는 venue
3. 포스터/대표 이미지
4. 공식 원본 URL
5. 장르와 activity_type 확정
6. 중복 원본/운영 DB 중복 검사 통과

### 4단계: 사이트 반영 범위 결정

이미 전문 허브가 강한 장르는 Rhythmjoy가 모든 이벤트를 복제하지 않는다. 대신:

- 장르 홈/가이드에는 허브 링크와 씬 설명을 제공
- 공식 원본이 강한 대표 행사/워크샵만 캘린더/강습&행사에 선별 반영
- 관리자에게만 확장 장르 상세 후보를 먼저 노출

## 레지스트리 추가 후보

다음 파일에 후보로 추가할지 검토한다: `scripts/ingestion/collection-registry.mjs`

- `where-to-dance-salsa-seoul`: discovery-only
- `where-to-dance-bachata-seoul`: discovery-only
- `salsavida-calendar-seoul`: discovery-only
- `tanguear-seoul`: discovery-only
- `tangotocup-seoul`: official-event-page-allowed
- `jeju-summ-milonga`: official-event-page-allowed
- `chuncheon-tango-festival`: official-event-page-allowed
- `dancechives`: discovery-only
- `flowdat-street-search`: discovery-only

## 출처

- DanceCode: https://www.dancecode.kr/
- DanceCode HSDF sample: https://www.dancecode.kr/dance/view/258
- FREEZE stage: https://www.freezekr.com/stage
- Latin in Seoul weekly: https://salsa.atoo.kr/category/weekly-info/
- Where to Dance Salsa Seoul: https://where-to-dance-salsa.com/cities/seoul/
- Where to Dance Bachata Seoul: https://where-to-dance-salsa.com/bachata/seoul/weekly/
- SalsaVida Seoul calendar: https://www.salsavida.com/guides/south-korea/seoul/calendar/
- PlaceOcean: https://www.placeocean.kr/
- Korea Latin Dance Hub: https://latindance.kr/clubs-en
- LatinDanceHub Seoul guide: https://latindancehub.co/blog/where-to-dance-salsa-bachata-in-seoul
- Flowdat: https://flowdat.co/
- Flowdat AFTER JEJU: https://flowdat.co/events/2026-after-jeju-latin-conexion-in-seoul-72f12bcabede
- Flowdat Dongbang Battle: https://flowdat.co/events/vol32-dongbang-battle-vol32-490515364c27
- Tango Calendar Korea: https://tangocalendar.kr/
- Tanguear Seoul sample: https://tanguear.com/event/3af5-6126
- TangotoCUP Seoul: https://tangotocup.com/competition/65
- Jeju SUMM Milonga: https://www.jejusummmilonga.com/
- Chuncheon International Tango Festival: https://kcctf.org/
- Korea Tango Cooperative: https://www.koreatango.co.kr/
- DanceChives: https://dancechives.com/
