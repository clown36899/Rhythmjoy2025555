# Local Dance Expansion Test Report

작성일: 2026-05-20

## 전제

- 운영 DB는 수정하지 않았다.
- 푸시하지 않았다.
- 로컬 Supabase DB와 `http://localhost:8888` 기준으로만 검증했다.
- 로컬 서버는 `netlify dev --offline --no-open --dir dist --port 8888`로 실행 중이다.

## 로컬 DB 상태

`public.events`

| scope | total | with image |
| --- | ---: | ---: |
| legacy_swing | 593 | 586 |
| street | 9 | 9 |
| salsa | 3 | 3 |
| bachata | 2 | 2 |
| tango | 12 | 12 |

`public.scraped_events`

| tab | count |
| --- | ---: |
| 신규 | 2 |
| 완료 | 18 |
| 중복 | 3 |

## 실제 수집 데이터 출처

- HY Dance Studio: `https://www.hydancestudio.com/class/streetdance`, `https://www.hydancestudio.com/class/popupclass`, `https://www.hydancestudio.com/class/schedule`
- Somoim / LatinSoul: `https://www.somoim.co.kr/%EC%82%B4%EC%82%AC%EB%8C%84%EC%8A%A4%EB%AC%B4%EB%A3%8C%EC%B2%B4%ED%97%98%EA%B5%90%EC%8B%A4-9bfe72d845be11e7ab4522000b04e99f1`, `https://www.somoim.co.kr/b8a2ccca-c4a8-11ee-a38f-0ac636f0bddd1`
- Tango Calendar: `https://tangocalendar.kr/`, `https://tangocalendar.kr/api/events?startDate=2026-05-20&endDate=2026-06-30`

Tango Calendar API에는 이벤트별 포스터 필드가 없어 공식 소스 아이콘을 이미지 필드로 사용했다.

## 인제스터 검증

URL: `http://localhost:8888/admin/v2/ingestor`

확인 결과:

- 상단 탭이 `신규 2`, `완료 18`, `중복 3`으로 구분된다.
- 신규 탭은 `바차타 1`, `스트릿 1` 장르 필터가 노출된다.
- 완료 탭은 `살사 3`, `바차타 2`, `탱고 4`, `스트릿 9` 장르 필터가 노출된다.
- 중복 탭은 `바차타 1`, `탱고 1`, `스트릿 1` 장르 필터가 노출된다.
- 중복 탭의 각 행은 기존 매칭 대상(`캘린더 등록DB #...`), 기존 제목, 날짜, 중복 사유, 원본 링크를 보여준다.
- 중복 행에는 `등록`, `이미지`, `신규전환`, `제외` 액션이 표시된다.
- `중복 -> 탱고 필터 -> 신규` 흐름에서 필터가 남아 신규 데이터가 비는 문제가 있었고, 탭 전환 시 필터를 전체로 리셋하도록 수정했다.
- `신규전환`은 `pending` 상태로 저장해 중복 재검사를 우회하게 했다. 임시 로컬 row로 `duplicate -> pending -> new tab 노출` 흐름을 검증하고 테스트 row는 삭제했다.
- `등록/완료 처리`는 `collected` 상태로 저장되어 중복 탭에서 빠지고 완료 탭에 노출된다. 임시 로컬 row로 `duplicate -> collected -> 완료 tab 노출` 흐름을 검증하고 테스트 row는 삭제했다.
- 모바일 390px 폭에서 문서 전체 가로 overflow는 없고, 탭/장르 버튼과 카드 행이 화면 안에 들어온다.

## 화면 검증

- `/admin/ui/dance-expansion-guide`: 실제 로컬 확장 데이터가 노출된다.
- `/calendar?dance=street`: HY 스트릿 데이터가 노출된다.
- `/calendar?dance=tango`: Tango Calendar 기반 데이터가 노출된다.
- `/events?dance=salsa`: 살사 데이터가 노출된다.
- `/calendar`, `/events`, `/admin/v2/ingestor`에서 확인한 범위의 표시 이미지는 로드된다.
- `/admin/ui/dance-expansion-guide`는 화면 밖 lazy 이미지가 즉시 `naturalWidth=0`으로 잡힐 수 있으나, 파일 자체는 `http://localhost:8888/scraped/real/...`에서 200으로 응답한다.

## 검증 명령

- `npm run build:only`: 성공
- `npx eslint src/pages/admin/v2/EventIngestorV2.tsx netlify/functions/scraped-events.ts src/pages/admin/v2/EventIngestorV2.css src/pages/admin/v2/utils/ingestorMapping.ts`: 에러 0, 기존 경고만 남음

## 산출물

- 데스크탑 인제스터 중복 탭 캡처: `/Users/inteyeo/Rhythmjoy2025555-5/.codex-ingestor-duplicate-check.png`
- 모바일 인제스터 캡처: `/Users/inteyeo/Rhythmjoy2025555-5/.codex-ingestor-mobile-check.png`

## 2026-05-21 추가 점검

### 적용한 개선

- `/events` 모집 섹션은 선택 장르에 묶이지 않고 전체 장르의 `activity_type=recruit` 후보를 기준으로 노출되도록 분리했다.
- `/events` 모바일 420px 이하 간격을 재조정해 장르/활동/태그 툴바가 본문을 덮지 않게 했다.
- `/calendar?scrollToToday=true` 진입 및 오늘 버튼 이동은 이미지/카드 높이 확정 후 3회 재보정하도록 수정했다.
- 2차 메뉴 라벨을 `행사정보`에서 `강습&행사`로 변경했다.
- `/v2` 신규 이벤트 광고는 사용자가 선택한 장르를 `localStorage(home_ad_dance_scope)`에 저장하고, 해당 장르 후보가 2개 미만이면 다른 장르를 보강 노출하며 현재 노출 상태를 표시한다.
- Web Search Ingestion V2 스킬에 확장 장르 소스 우선순위와 기준 소스 레지스트리를 추가했다. 소모임/Meetup/블로그류는 저장 소스가 아니라 공식 원본을 찾기 위한 발견용 보조 자료로 제한했다.

### 로컬 뷰 검증

- `/events?dance=bachata` 모바일 390x844
  - 가로 overflow 없음.
  - 툴바와 본문 겹침 없음.
  - 2차 메뉴 라벨 `강습&행사` 확인.
- `/calendar?dance=swing&scrollToToday=true` 모바일 390x844
  - 첫 진입 후 오늘 행 `top`과 sticky controls `bottom` 차이 약 `0.24px`.
  - 가로 overflow 없음.
- `/v2` 데스크탑 1365x820
  - 신규 광고가 좌측 배너/우측 장르 컨트롤 구조로 표시된다.
  - 장르를 `탱고`로 변경 후 새로고침해도 선택 유지 확인.
  - `탱고 신규가 적어 다른 장르를 함께 노출 중` 안내 확인.
- `/admin/v2/ingestor` 모바일 390x844
  - `신규 2`, `완료 18`, `중복 3` 탭 표시 확인.
  - 신규 탭에서 `바차타`, `스트릿`, 활동/계열/태그 필터 표시 확인.
  - 가로 overflow 없음.

### 검증 명령

- `npm run build:only`: 성공
- `npm test -- --run`: 성공 (`src/App.test.tsx`, 1 passed)

### 현재 남은 리스크

- 로컬 신규 수집 후보가 아직 2건뿐이라 확장 UI의 밀도 검증에는 부족하다.
- 기존 로컬 데이터 중 Somoim 기반 항목이 남아 있다. 신규 수집 전략에서는 더 이상 1차 소스로 쓰지 않고, 공식 사이트/인스타/전문 허브에서 원본 확인 가능한 항목만 추가해야 한다.
- Tango Calendar는 일정 허브로는 유용하지만 이벤트별 포스터가 부족할 수 있다. 저장 전 공식 포스터/원본 링크 확보 여부를 매번 검증해야 한다.
