# 수집/통계 개선 작업 보고서 - 2026-05-08

## 작업 범위

- `/admin/v2/ingestor` 모바일 UI, 페이지네이션, 중복 수집, 장소/장르 매핑 개선
- 자동 수집 실행 스크립트와 `web-search-ingestion` 스킬 안정화
- 사이트 통계 모달 방문자 카운팅 누락 원인 분석 및 개선
- 커밋/푸시는 하지 않음

## 수집 관련 변경

- `scripts/run-ingestion.sh`
  - `.env`의 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`를 직접 로드하도록 변경
  - 자동 수집 중 `netlify env:get` 의존 제거
  - Playwright screenshot 도구를 자동 수집 허용 목록에서 제거
- `.agents/skills/web-search-ingestion/SKILL.md`
  - 수집 시작 시 `.env` 또는 export된 환경변수를 우선 사용하도록 명시
  - `netlify env:get` 사용 금지 규칙 추가
  - `browser_take_screenshot` 대신 `browser_snapshot`/`browser_evaluate` 사용 규칙 추가
  - 원본 운영 DB 등록 기준에 맞춘 장소/장르/분류 매핑 규칙 추가
- `netlify/functions/scraped-events.ts`
  - 수집 임시 DB와 운영 `events` DB 양쪽을 기준으로 중복 검사 강화
  - 같은 `source_url` 또는 같은 날짜/장소/유사 제목이면 중복으로 처리
  - 수집 보관 데이터 삭제 시 같은 이미지 파일을 다른 레코드가 참조하면 스토리지 파일을 삭제하지 않도록 보호
- `src/pages/admin/v2/EventIngestorV2.tsx`, `EventEditModal.tsx`, `utils/ingestorMapping.ts`
  - 수집 데이터 등록 시 장소, venue_id, venue_name, category, genre, group_id 자동 매핑
  - 소셜은 `category=social`, `genre=소셜`, `group_id=2`로 등록되도록 정리
  - 등록 전 운영 `events` 테이블과 중복 비교 후 이미 있으면 신규 insert 없이 수집 완료 처리

## 자동 수집 실행 테스트

- 1차 실행 실패
  - 시간: 2026-05-08 14:48 KST
  - 원인: Claude/Playwright screenshot 이미지 처리 오류
  - 조치: 자동 수집 허용 도구에서 screenshot 제거
- 2차 실행 성공
  - 시간: 2026-05-08 14:49~14:57 KST
  - 종료 코드: 0
  - 신규: 0건
  - 기존 데이터 다수 스킵
  - 접근 불가 계정 다수 확인: 계정 비활성화 또는 핸들 변경 추정

## 통계 카운팅 원인

`admin-stats-wrapper` 자체는 현재 접속자 Presence 표시라서 수정 대상이 아니다.

문제는 클릭해서 여는 `SiteAnalyticsModal`이었다.

- 모달의 방문자 숫자가 `session_logs`가 아니라 `site_analytics_logs` 기반 RPC 값을 우선 사용하고 있었다.
- `site_analytics_logs`는 클릭/활동 로그라서, 로그인 세션이 있어도 클릭 로그가 부족하면 로그인 방문자로 안 잡힐 수 있었다.
- 이벤트 등록 성공 시 내부 통계용 `trackEvent()`를 호출하지 않고 GA용 `logEvent()`만 호출했다.
- 그래서 비관리자가 로그인 후 실제 이벤트를 등록해도 사이트 내부 통계 모달에는 등록 활동이 안 찍힐 수 있었다.
- 관리자는 기존처럼 계속 카운팅 제외된다.

2026-05-08 KST DB 확인값:

- `session_logs` 전체: 16
- 세션 기준 6시간 unique 총 방문: 16
- 세션 기준 로그인 방문: 5
- 세션 기준 Guest 방문: 11
- 클릭 로그 전체: 21
- 클릭 로그 기준 6시간 unique 총 방문: 6
- 클릭 로그 기준 로그인 방문: 1
- 오늘 생성된 events: 5
- `event_registration`/`event_update` 내부 활동 로그: 0

즉 기존 모달은 실제 로그인 방문 5건 중 1건만 보여줄 수 있는 상태였다.

## 통계 개선 변경

- `src/components/SiteAnalyticsModal.tsx`
  - 방문자 숫자를 `session_logs` 기준 6시간 unique로 계산하도록 변경
  - 클릭 로그는 PV/상세 활동 분석 보조 지표로 유지
  - 로그인 사용자 목록도 세션 기준으로 구성하고 `board_users`에서 닉네임을 매핑
  - 클릭 로그가 0이어도 세션 방문이 있으면 빈 화면으로 처리하지 않도록 수정
  - `event_registration`, `event_update` 타입명을 통계 모달에 추가
- `src/components/EventRegistrationModal.tsx`
  - 이벤트 생성 성공 후 `trackEvent({ target_type: 'event_registration' })` 기록
  - 이벤트 수정 성공 후 `trackEvent({ target_type: 'event_update' })` 기록
  - `is_admin` 값을 그대로 전달하므로 관리자는 기존 정책대로 내부 로그에서 제외

## 검증

- `npx tsc --noEmit`: 통과
- `npx eslint src/components/SiteAnalyticsModal.tsx src/components/EventRegistrationModal.tsx`: 에러 0개, 기존 경고만 있음
- `npm run build:only`: 통과
- DB 직접 조회로 기존 통계 누락 원인 확인 완료

## 남은 확인 사항

- 배포 후 비관리자 실제 등록 1건을 수행해서 `site_analytics_logs.target_type='event_registration'` 레코드가 생성되는지 확인 필요
- 자동 수집 Static Collection List의 접근 불가 Instagram 계정은 핸들 변경 여부 확인 후 목록 갱신 필요
- 로컬/관리자/빌보드 페이지는 의도적으로 통계에서 제외된다
