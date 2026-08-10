# Project Issue Log

이 문서는 프로젝트의 과거 문제, 조사, 해결 방법, 운영 이슈를 Git에 남기기 위한 중심 기록이다.

## 기록 원칙

- 버그, 장애, 운영 문제, 데이터 손상 위험, 배포 문제, 장시간 조사, 재발 방지 조치가 있으면 항목을 남긴다.
- 간단한 UI 문구 수정처럼 추적 가치가 낮은 변경은 생략할 수 있다.
- 커밋 전이면 관련 커밋은 `pending`으로 적고, 커밋 후 해시를 보강한다.
- 민감 정보는 적지 않는다. 비밀번호, 토큰, SSH 키, 쿠키, 운영 `.env` 값은 기록 금지.

## 빠른 링크

- 변경 이력: [../CHANGELOG.md](../CHANGELOG.md)
- Cafe24 단일 운영 정책: [cafe24-full-migration.md](./cafe24-full-migration.md)
- Cafe24 전환 점검: [cafe24-only-migration-audit.md](./cafe24-only-migration-audit.md)
- Cafe24 재해 복구: [cafe24-disaster-recovery.md](./cafe24-disaster-recovery.md)
- 수집 자동화 현황/장애 기록: [INGESTION_STATUS.md](./INGESTION_STATUS.md)
- Ingestor V3 설계: [ingestor-v3-design.md](./ingestor-v3-design.md)
- 키오스크 작업 기록: [../ops/kiosk/mini-pc/WORKLOG.md](../ops/kiosk/mini-pc/WORKLOG.md)
- 코드 리뷰 보고서: [../code_review_report.md](../code_review_report.md)
- 사이트 리뷰 보고서: [../site_review_report_v2.md](../site_review_report_v2.md)
- ESLint 유실 조사: [../eslint_final_investigation_report.md](../eslint_final_investigation_report.md)

## 2026-08-11 관리자 알림 설정 표시·아침 Push·알림함 카드 불일치

- 상태: 운영 배포 완료 (2026-08-11 03:20 KST)
- 현상:
  - 관리자가 저장한 알림 설정이 화면에서 풀린 것처럼 보였고 2026-08-04~10 매일 08:30 아침 Push가 한 번도 성공하지 않았다.
  - 오른쪽 위 종의 모바일 알림함은 여러 일정을 한 카드와 잘못된 숫자로 표시했고, 종을 여는 즉시 모든 신규등록 알림이 읽음 처리됐다.
- 운영 근거:
  - 계정의 정규 알림 설정은 활성·08:30·매일·전체 대상으로 저장돼 있었다. 같은 기간 아침 cron은 매번 정상 실행됐지만 대상 1명, Push 성공 0건이었다.
  - 최근 전달 실패는 HTTP 410 만료 응답이었다. `generic_records.record_id`는 160자인데 FCM endpoint는 188자여서 저장 키가 잘렸고, 삭제는 원래 188자 값으로 시도해 실제 0건을 지우면서 요청 행 수를 삭제 성공으로 기록했다.
  - 아침 Push payload에는 일정 `items`가 있었지만 서버 `user_notifications.data_json`에는 종류·날짜·합계만 저장돼 인앱 알림함이 한 개의 집계 카드로 렌더링했다.
- 원인:
  - 계정 설정의 ON/OFF를 현재 브라우저 endpoint 소유 여부로 대체했고, 브라우저에 남은 만료 endpoint를 그대로 재사용했다. 같은 OS를 같은 기기로 간주하는 정리도 여러 Android 기기를 오삭제할 위험이 있었다.
  - 아침 알림함 INSERT를 Push 발송의 중복 방지 값으로도 사용해, 인앱 저장 뒤 Push가 실패하면 같은 날 재시도할 수 없었다. 큐 상태도 인앱 저장만 성공하면 `sent`로 기록했다.
  - 신규등록 인앱 생성은 마지막 사이트 방문 시각으로 제외됐고, 종 클릭은 사용자의 카드 확인 전 전체 읽음을 수행했다.
- 해결:
  - endpoint SHA-256 기반 고정 길이 키와 기존 행 이관을 추가하고, 만료 삭제는 실제 DB 영향 행 수를 사용한다. UA/OS 기반 기기 삭제는 제거했다.
  - 계정 설정을 화면의 원본으로 사용하고 기기 연결을 별도 상태로 표시한다. 계정 설정이 켜져 있고 이 기기에서 명시적으로 끄지 않았다면 서버가 소유하지 않는 브라우저 구독을 자동 갱신한다.
  - 아침 알림을 사용자·날짜별 결정적 큐 항목으로 만들고 실제 Push 성공이 없으면 제한적으로 재시도한다. Push 성공만 `sent`, 인앱만 저장되면 `inbox_only`로 구분한다.
  - 인앱에는 요약의 전체 일정 항목을 저장하고 뱃지는 실제 표시 카드 수를 계산한다. 모바일과 데스크톱은 같은 서버 원본을 사용한다.
  - 종 클릭의 자동 전체 읽음을 제거하고 최근 신규등록의 과거 자동 읽음 상태를 1회 데이터 마이그레이션으로 복구한다.
- 검증:
  - endpoint 키·실삭제, 410 재시도, 아침 큐·전체 카드, 신규등록 명시적 읽음, 계정 ON·기기 만료 UI를 포함한 관련 테스트 98개가 통과했다. 대상 ESLint는 오류 0건이고 프로덕션 빌드가 성공했다.
  - 첫 배포 검증에서 운영 MariaDB 5.5가 `JSON_UNQUOTE`를 지원하지 않아 SQL 이관이 중단된 것을 확인했다. cron 파일을 즉시 복구한 뒤, JSON을 Node.js에서 파싱하고 한 트랜잭션으로 이관하는 호환 마이그레이션으로 교체했다.
  - 최종 운영 버전은 `1786386034008`이다. 공개·서버 `version.json`과 service worker SHA-256이 일치하고 서비스 및 cron이 active이다.
  - 운영 구독 3건은 모두 69자 해시 키로 이관됐고 레거시 키는 0건이다. 읽음 복구 마커는 1건이며 2026-08-03 이후 신규등록 알림 306건이 명시적 미확인 상태로 복구됐다. 08:30 활성 설정 1건도 유지됐다.
  - 배포 후 03:21 cron에서 정규 일정, 아침 digest 큐 등록, 알림 전달 큐가 모두 HTTP 200으로 완료됐다.
- 관련 결정: `docs/decisions/2026-08-11-notification-delivery-lifecycle.md`
- 관련 커밋: `e0fcf669`, `583942d3`

## 2026-08-03 연습실 탐색 화면 및 지도 로딩 개선

- 상태: 완료
- 범위: 홈 연습실 바로가기, 연습실 목록·검색·지역 필터·지도 전환, 외부 링크 이동
- 증상:
  - 연습실 검색 진입점이 화면에 상시 노출되지 않았고 지도 컴포넌트 호출 규격이 실제 구현과 맞지 않았다.
  - 연습실 카드를 누르면 예약 또는 지도 링크 대신 소개 상세 모달을 먼저 거쳤다.
  - 지도 SDK가 늦게 로드되거나 차단되면 빈 지도 영역만 남았다.
- 해결:
  - 홈의 기존 바로가기 두 개 아래에 연습실 버튼을 추가했다.
  - 운영 `venues` 데이터를 한 번 불러와 기본 리스트, 즉시 검색, 서울/기타 필터, 지도 보기에 함께 사용하도록 정리했다.
  - 카드와 지도 마커는 홈페이지·추가 링크·등록 지도 링크·주소 검색 순으로 목적지를 결정해 바로 이동한다.
  - 지도 SDK를 일정 시간 재확인하고 끝내 사용할 수 없으면 빈 화면 대신 재시도 안내를 표시한다.
  - 일반 카드 이미지와 지도 마커 이미지는 브라우저 기본 드래그 대상에서 제외했다.
- 검증:
  - Cafe24 운영 DB 연결 로컬 화면에서 활성 연습실 16개 노출 확인
  - `사당` 검색 결과 1개, 리스트 기본 선택, 지도 전환, 모바일 가로 넘침 없음 확인
  - 링크 해석 단위 테스트 4개 통과, 대상 파일 ESLint 통과, 프로덕션 빌드 통과
- 관련 파일:
  - `src/pages/practice/page.tsx`
  - `src/pages/practice/components/PracticeRoomList.tsx`
  - `src/pages/practice/components/VenueMapView.tsx`
  - `src/pages/practice/utils/venueLinks.ts`
  - `src/pages/v2/components/NewEventsBanner.tsx`
- 관련 커밋: pending

## 2026-07-26 소셜 캘린더 릴스 생성 자동화

- 상태: 해결
- 범위: swingenjoy 캘린더 캡처, 릴스용 15초 영상 생성, 동적 오버레이 배치
- 증상:
  - 모바일 편집 앱에서는 화살표 회전과 정밀 배치가 불안정했다.
  - 화면 잠금 또는 잠자기 상태에서 에뮬레이터 기반 자동화가 중단됐다.
  - 오늘 날짜의 요일 열이 매일 바뀌어 고정 좌표로는 글자와 화살표가 다른 요소를 가릴 수 있었다.
- 해결:
  - 캘린더의 `오늘` 버튼을 누른 뒤 파란 오늘 표시의 실제 DOM 좌표를 읽는다.
  - 오늘 위치에 따라 글자 상자를 항상 위쪽 좌·우 중 한쪽으로 자동 배치한다.
  - 화살표 방향과 각도를 오늘 좌표에 맞춰 다시 계산하고, 글자와 오늘 표시의 안전거리를 유지한다.
  - 고해상도 PNG 캡처에서 2160×3840, 15초, BT.709 H.264 영상을 직접 생성한다.
  - 좌·가운데·우 배치와 안전거리 테스트를 추가했다.
  - 운영 실행기에 중복 실행 잠금, 최대 3회 재시도, 4K 결과 검증과 상태 기록을 추가했다.
- 검증:
  - `npm run test:social-reel`: 7개 테스트 통과
  - 실제 사이트 DOM 좌표로 2026-07-26 영상 생성
  - 2160×3840, 30fps, 15초, yuv420p, BT.709 자동 검증 통과
  - 움직임 양끝 프레임에서 흰 상자·글자·요일·오늘 날짜 비가림 확인
- 관련 파일:
  - `scripts/social-reels/generate-social-reel.mjs`
  - `scripts/social-reels/run-social-reel.mjs`
  - `scripts/social-reels/layout.mjs`
  - `scripts/social-reels/layout.test.mjs`
  - `docs/social-reel-automation.md`
  - `docs/decisions/2026-07-26-social-reel-dynamic-layout.md`
- 관련 커밋: `7badf4d0`

## 2026-07-26 자유게시판 댓글 알림 누락 개선

- 상태: 완료
- 범위: 자유게시판 댓글 등록, 웹 푸시, 오른쪽 위 알림함
- 배경: 자유게시판 글에 댓글이 등록되어도 글 작성자가 알 수 없었고, 사이트 알림함에도 댓글 활동이 남지 않았다.
- 원인: 댓글은 `board_comments`에 직접 등록되지만 글 작성자를 대상으로 푸시를 만드는 후속 처리가 없었다.
- 해결:
  - 새 댓글 등록 성공 후 인증된 댓글 ID로 서버 알림 API를 호출한다.
  - 서버가 현재 로그인 사용자, 댓글 작성자, 원글 작성자를 다시 검증한다.
  - 본인 댓글은 제외하고 모든 로그인 원글 작성자의 서버 알림함에 댓글 알림을 기록한다.
  - 기존 웹 푸시 구독이 있는 작성자에게만 기기 푸시를 추가 발송한다.
  - 오른쪽 위 알림함은 서버 알림과 기기 푸시 기록을 합치고, 같은 댓글은 중복 표시하지 않는다.
- 검증: 댓글 작성자 대상 제한, 구독 없는 작성자의 알림함 저장, 푸시 구독 대상 제한, 본인 댓글 제외 테스트 통과 및 프로덕션 빌드 완료.
- 관련 파일:
  - `src/pages/board/components/CommentForm.tsx`
  - `server/cafe24/app.js`
  - `server/cafe24/push-api.js`
  - `server/cafe24/push-api.test.js`
  - `server/cafe24/migrations/2026-07-26-user-notifications.sql`
  - `src/lib/notificationStore.ts`
- 관련 커밋: pending

## 2026-07-14 기록 체계 도입

- 상태: 완료
- 범위: 프로젝트 기록 방식 정리
- 배경: 과거 이슈, 변천사, 문제점, 해결 방법이 남아 있는지 확인한 결과 Git 커밋, `CHANGELOG.md`, `docs/`, `ops/`에 기록이 흩어져 있었다. GitHub Issues와 PR 목록은 현재 비어 있다.
- 확인된 기존 기록:
  - Git 커밋 히스토리 466개가 기능 변화와 버그 수정 흐름을 보유한다.
  - `CHANGELOG.md`는 버전별 사용자 영향 변경을 보유한다.
  - `docs/INGESTION_STATUS.md`는 수집 자동화 장애, 원인, 조치, 검증까지 상세히 보유한다.
  - Cafe24 관련 문서는 운영 전환, 감사, 복구 절차를 보유한다.
  - `ops/kiosk/mini-pc/WORKLOG.md`는 키오스크 구축과 운영 조치 기록을 보유한다.
  - 코드/사이트/ESLint 조사 보고서는 특정 문제의 원인 분석과 해결책을 보유한다.
- 조치:
  - 이 통합 이슈 로그를 추가했다.
  - 장기 의사결정 기록을 위한 `docs/decisions/` 구조를 추가했다.
  - 향후 작업 기록 기준을 `AGENTS.md`에 추가했다.
- 해결 방법: 앞으로는 문제성 작업은 이 파일에 요약하고, 장기 정책과 아키텍처 결정은 `docs/decisions/`에 별도 기록한다.
- 검증: 문서 파일 생성 및 링크 경로를 로컬 파일 구조 기준으로 확인한다.
- 관련 파일:
  - `AGENTS.md`
  - `docs/ISSUE_LOG.md`
  - `docs/decisions/README.md`
  - `docs/decisions/2026-07-14-project-record-keeping.md`
- 관련 커밋: pending

## 2026-07-14 Cafe24 DB 백업 복구 가능성 점검

- 상태: 해결
- 범위: Cafe24 운영 DB와 업로드 파일 로컬 백업
- 증상: DB가 날아갔을 때 복구 가능한 백업 방법이 있는지 확인이 필요했다.
- 확인:
  - 백업 문서가 이미 존재한다: `docs/cafe24-local-backup.md`
  - 복구 문서가 이미 존재한다: `docs/cafe24-disaster-recovery.md`
  - 백업 스크립트가 존재한다: `scripts/backup-cafe24-to-local.sh`
  - 복구 스크립트가 존재한다: `scripts/restore-cafe24-from-local.sh`
  - macOS LaunchAgent가 설치되어 있고 매일 04:30 실행 설정이다: `com.rhythmjoy.cafe24-local-backup`
  - 로컬 백업 위치는 `~/RhythmjoyBackups/swingenjoy-cafe24/YYYYMMDD-HHMMSS/`다.
  - 2026-07-13 04:30 백업에는 `swingenjoy_app.sql.gz` DB 덤프가 있고 `gzip -t` 검증을 통과했다.
- 발견한 문제:
  - 백업 스크립트가 원격에서 `SHA256SUMS`를 만든 뒤 로컬에서 `manifest.txt`에 내용을 추가했다. 그 결과 최신 백업의 DB 덤프는 정상이지만 `manifest.txt` 체크섬 검증이 실패했다.
- 원인:
  - 체크섬 생성 시점이 최종 로컬 파일 작성보다 빨랐다.
- 조치:
  - 백업 스크립트 마지막 단계에서 로컬 최종 파일 상태 기준으로 `SHA256SUMS`를 다시 생성하도록 수정했다.
  - `sha256sum`이 없을 경우 macOS 기본 `shasum -a 256`으로 fallback하도록 했다.
  - 백업 정상성 점검 명령을 `docs/cafe24-local-backup.md`에 추가했다.
- 검증:
  - `bash -n scripts/backup-cafe24-to-local.sh`
  - `bash -n scripts/restore-cafe24-from-local.sh`
  - 최신 DB 덤프 `gzip -t` 통과
  - 최신 백업의 `SHA256SUMS`를 최종 파일 상태 기준으로 재생성한 뒤 `shasum -a 256 -c SHA256SUMS` 통과
  - LaunchAgent 설치 및 마지막 실행 exit code 0 확인
- 재발 방지:
  - 앞으로 백업 후 `gzip -t`와 `SHA256SUMS` 검증을 같이 본다.
  - 복구 테스트는 실제 운영 서버가 아니라 새 VPS 또는 임시 DB에서 먼저 수행한다.
- 관련 파일:
  - `docs/cafe24-local-backup.md`
  - `docs/cafe24-disaster-recovery.md`
  - `scripts/backup-cafe24-to-local.sh`
  - `scripts/restore-cafe24-from-local.sh`
- 관련 커밋: pending

## 2026-07-16 수집 후보 중복 재등록 방지 보강

- 상태: 해결
- 범위: Cafe24 `scraped_events` 수집 저장 API
- 증상: 같은 수집 후보가 반복 실행 때마다 다시 신규처럼 저장되거나, 제목이 `강습 안내`처럼 일반적인 후보가 운영 이벤트와 중복 매칭되지 않을 수 있었다.
- 원인:
  - 같은 후보 ID가 이미 존재해도 `collected`, `duplicate`, `excluded` 같은 terminal 상태가 아니면 다시 upsert했다.
  - 운영 이벤트 중복 비교가 같은 원본 URL/날짜 또는 높은 제목 유사도에 치우쳐 있어, 같은 출처/날짜/장소의 일반 제목 후보를 놓칠 수 있었다.
- 조치:
  - 같은 ID의 검토 대기 후보가 이미 있으면 다시 저장하지 않고 스킵하도록 했다.
  - 일반 제목 후보는 같은 출처 정체성, 날짜, 장소, 활동 유형이 같으면 운영 이벤트 중복으로 판단하도록 보강했다.
- 검증:
  - `node scripts/test-ingestion-standards.mjs`
  - `node --check server/cafe24/function-api.js`
  - `bash -n /Users/inteyeo/scripts/run-ingestion.sh`
  - `bash -n scripts/run-ingestion.sh`
  - `npx vitest run server/cafe24/generic-data-api.event-metadata.test.js server/cafe24/push-api.test.js`
- 재발 방지:
  - 제목이 일반적인 Instagram/카페 후보는 원본 URL만 보지 말고 출처 계정/카페, 날짜, 장소, 활동 유형을 함께 본다.
- 관련 파일:
  - `server/cafe24/function-api.js`
  - `docs/ISSUE_LOG.md`
- 관련 커밋: pending

## 2026-07-18 09시 priority2 수집 예산 초과

- 상태: 해결
- 범위: `swing-daily` 09:00 priority2 LaunchAgent 및 native 수집 wrapper
- 증상: 2026-07-18 09:00 실행이 native collector와 Telegram summary는 정상 출력했지만 20분 예산에 도달해 priority2 소스 14개를 확인하지 못했다.
- 원인:
  - priority2 자동수집 소스가 20개까지 늘어난 상태에서 Instagram 안전 대기와 소스당 2개 포스트 스캔이 같이 적용되어 09:00 실행 창을 초과했다.
- 조치:
  - 09:00 priority2 LaunchAgent에 `INGESTION_NATIVE_INSTAGRAM_POST_LIMIT=1`을 설정해 모든 priority2 계정을 얕게 순회하도록 조정했다.
  - 설치된 LaunchAgent를 같은 값으로 갱신하고 reload했다.
  - wrapper meta에 `native_instagram_post_limit`을 기록하도록 했다.
- 검증:
  - `bash -n /Users/inteyeo/scripts/run-ingestion.sh`
  - `bash -n scripts/run-ingestion.sh`
  - `plutil -lint scripts/com.rhythmjoy.codex-ingestion-priority2.plist /Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.codex-ingestion-priority2.plist`
  - `node scripts/test-ingestion-standards.mjs`
  - `TELEGRAM_DRY_RUN=1 INGESTION_NATIVE_DRY_RUN=1 INGESTION_SKIP_CLEANUP=1 INGESTION_NATIVE_SOURCE_PRIORITY=2 INGESTION_NATIVE_SOURCE_IDS=gangnam_westies INGESTION_NATIVE_INSTAGRAM_POST_LIMIT=1 INGESTION_NATIVE_RUN_BUDGET_MS=300000 TIMEOUT_SECONDS=360 /bin/bash /Users/inteyeo/scripts/run-ingestion.sh`
- 재발 방지:
  - priority2 소스 수가 더 늘면 LaunchAgent 분할 또는 별도 source priority 재배치를 검토한다.
- 관련 파일:
  - `scripts/com.rhythmjoy.codex-ingestion-priority2.plist`
  - `/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.codex-ingestion-priority2.plist`
  - `/Users/inteyeo/scripts/run-ingestion.sh`
  - `docs/ISSUE_LOG.md`
- 관련 커밋: pending

## 2026-07-21 09시 priority2 네트워크 단절 조기 중단

- 상태: 해결
- 범위: `swing-daily` 09:00 priority2 native 수집
- 증상: 2026-07-21 09:03 실행이 native collector와 Telegram summary는 출력했지만 `ERR_INTERNET_DISCONNECTED`가 반복된 뒤 20분 예산에 도달해 14개 소스를 남겼다.
- 원인:
  - Playwright의 전체 네트워크 단절 오류를 일반 소스 접근불가와 동일하게 처리해, 네트워크가 복구되지 않는 상태에서도 다음 소스로 계속 이동했다.
- 조치:
  - native 수집기가 `ERR_INTERNET_DISCONNECTED`, 네트워크 변경, 프록시/터널 연결 실패를 네트워크 장애로 분류하도록 했다.
  - 해당 장애가 발생하면 현재 소스를 포함한 남은 소스를 summary에 기록하고 조기 종료하도록 했다.
- 검증:
  - `bash -n /Users/inteyeo/scripts/run-ingestion.sh`
  - `bash -n scripts/run-ingestion.sh`
  - `node scripts/test-ingestion-standards.mjs`
  - `TELEGRAM_DRY_RUN=1 INGESTION_NATIVE_DRY_RUN=1 INGESTION_SKIP_CLEANUP=1 INGESTION_NATIVE_SOURCE_IDS=swingfamily-lessons INGESTION_NATIVE_RUN_BUDGET_MS=120000 TIMEOUT_SECONDS=180 /bin/bash /Users/inteyeo/scripts/run-ingestion.sh`
- 재발 방지:
  - 전체 네트워크 장애는 소스별 실패가 아니라 실행 환경 장애로 보고 예산 소모 전에 다음 자동 실행으로 넘긴다.
- 관련 파일:
  - `scripts/ingestion/swing-daily-native.mjs`
  - `docs/ISSUE_LOG.md`
- 관련 커밋: pending

## 2026-07-24 아침 수집 CDP 상태 확인 장기 대기

- 상태: 해결
- 범위: `swing-daily` 08:00/09:00 native 수집 wrapper
- 증상: 두 실행 모두 native collector와 summary는 출력했지만, collector 시작 전에 각각 약 14분과 16분을 소진해 20분 수집 예산에 도달했고 대부분의 소스를 확인하지 못했다.
- 원인: 기존 Chrome의 CDP 포트가 연결은 수락하지만 `/json/version`에 응답하지 않는 상태에서 wrapper의 `curl` 상태 확인에 연결/전체 시간 제한이 없었다.
- 조치: CDP 상태 확인에 2초 연결 제한과 3초 전체 제한을 추가해 응답 없는 Chrome 때문에 collector 시작이 장시간 지연되지 않도록 했다.
- 검증:
  - `bash -n /Users/inteyeo/scripts/run-ingestion.sh`
  - `bash -n scripts/run-ingestion.sh`
  - `node scripts/test-ingestion-standards.mjs`
  - `TELEGRAM_DRY_RUN=1 INGESTION_NATIVE_DRY_RUN=1` 단일 소스 단축 실행
- 재발 방지: 외부 프로세스 상태를 확인하는 wrapper 네트워크 호출은 항상 명시적인 짧은 시간 제한을 둔다.
- 관련 파일:
  - `/Users/inteyeo/scripts/run-ingestion.sh`
  - `docs/ISSUE_LOG.md`
- 관련 커밋: pending

## 2026-07-25 native 소스 timeout 후 페이지 정리 장기 대기

- 상태: 해결
- 범위: `swing-daily` 08:00/09:00 native collector
- 증상: 두 실행 모두 native collector와 summary는 출력했지만, timeout 처리된 소스의 페이지 정리에서 장시간 대기해 20분 예산에 도달했고 각각 18개와 17개 소스를 확인하지 못했다.
- 원인: `withBoundedStep()`의 `Promise.race`가 timeout을 반환한 뒤에도 Playwright 작업은 남아 있었고, 소스별 `page.close()`와 최종 브라우저 연결 종료가 그 미완료 작업을 제한 없이 기다렸다.
- 조치: timeout 뒤의 페이지 및 브라우저 연결 정리를 각각 최대 2초만 기다리도록 제한했다.
- 검증:
  - `bash -n /Users/inteyeo/scripts/run-ingestion.sh`
  - `bash -n scripts/run-ingestion.sh`
  - `node scripts/test-ingestion-standards.mjs`
  - `TELEGRAM_DRY_RUN=1 INGESTION_NATIVE_DRY_RUN=1` 단일 소스 단축 실행
- 재발 방지: 수집 작업의 timeout뿐 아니라 timeout 이후 Playwright 자원 정리에도 별도 상한을 둔다.
- 관련 파일:
  - `scripts/ingestion/swing-daily-native.mjs`
  - `docs/ISSUE_LOG.md`
- 관련 커밋: pending

## 2026-07-26 외부 일정 API 배포 후 이미지 런타임 의존성 누락

- 상태: 해결
- 범위: Cafe24 Swing Enjoy 서버와 외부 일정 이미지 업로드 API
- 증상: 서버 파일 배포 후 `sharp` 모듈을 찾지 못해 `swingenjoy.service`가 기동하지 못했다. 최신 버전을 운영 설치한 뒤에는 구형 CentOS `libstdc++`와 바이너리 호환 오류가 발생했다.
- 원인:
  - 런타임에서 사용하는 `sharp`가 `devDependencies`에 들어 있었다.
  - 배포 스크립트가 `package.json`과 잠금 파일을 전송한 뒤 운영 의존성을 설치하지 않았다.
  - 최신 `sharp` 바이너리가 운영 서버에서 제공하는 `GLIBCXX`보다 새 버전을 요구했다.
- 조치:
  - `sharp`를 운영 의존성으로 이동하고 최초 복구 시 Cafe24 OS 호환 버전 `0.32.6`을 적용했다.
  - 후속 보안 감사에서 구버전 libvips 취약점이 확인됐다. 운영 CentOS 7/glibc 2.17에서 수정 바이너리 `0.35.3`이 기동되지 않아, 공급자 공식 우회책대로 취약 GIF·TIFF·VIPS 디코더를 프로세스 시작 시 차단했다. API 허용 형식에도 이 세 형식은 포함하지 않는다.
  - 패키지 파일이 변경된 배포에서는 `npm install --omit=dev`를 자동 실행하도록 배포 스크립트를 보강했다.
  - CRS가 포함되기 전에 로드되는 설정에서 이미지 업로드 경로의 Content-Type 정책 규칙만 제외하고, 나머지 ModSecurity 검사와 애플리케이션의 키 인증·용량·실제 디코딩 검사를 유지했다.
  - 운영 DB 백업 후 외부 API용 새 테이블만 생성했으며 기존 `events` 레코드는 변경하지 않았다.
- 검증:
  - 운영 서버에서 `sharp` 런타임 로딩 확인
  - `swingenjoy.service` active 및 `/__health` 응답 확인
  - 외부 일정 API 테스트 통과
- 관련 파일:
  - `package.json`
  - `package-lock.json`
  - `scripts/deploy-cafe24.sh`
  - `deploy/cafe24/apache/swingenjoy-modsecurity-exceptions.conf`
  - `server/cafe24/external-events-api.js`
- 관련 커밋: pending

## 2026-07-26 외부 일정 API 양방향 동기화·이미지 보안 보강

- 상태: 해결
- 범위: 파트너 일정 API, 이미지 저장, 혜택 이벤트 수집 판별
- 증상: 외부 URL 이미지는 원격 서버에 의존했고 4종 이미지가 생성되지 않았으며, 파트너 원본 수정·삭제 동기화와 엄격한 혜택 판별이 없었다.
- 조치:
  - 모든 이미지 방식을 실제 디코딩 후 WebP 4종으로 자체 저장하도록 통일했다.
  - DNS·사설 IP·리디렉션·응답 크기·Content-Type 검증과 공인 IP 고정 연결을 적용했다.
  - `partner_id + external_id` 소유권에 한정한 수정·삭제 API를 추가했다.
  - 관리자 세션 전용 파트너 목록·활성 상태·요청 로그 API를 추가했다.
  - 명시적인 무료 금액/무료 행사/정기권 판매만 혜택 대상으로 표시하고 부정 표현은 제외했다.
  - 운영 OS 호환 이미지 디코더에서 공급자 권고 취약 디코더 3종을 명시적으로 차단하고, SSRF 차단에 IPv4-mapped IPv6, 예약·문서·멀티캐스트 대역을 포함했다.
  - 운영 E2E에서 발견한 Undici의 `lookup({ all: true })` 계약 불일치를 수정해, DNS 검증을 통과한 공인 IP 목록만 배열 형식으로 연결 계층에 전달한다.
  - ModSecurity의 PUT/DELETE 정책 예외를 전체 서버가 아닌 `/api/external/v1/events/{external_id}` 경로에만 적용하고 애플리케이션의 키·소유권 검사를 유지한다.
- 검증:
  - 전체 단위 테스트 60개 및 외부 API 테스트 18개 통과
  - 수집 기준 테스트, TypeScript, ESLint, OpenAPI YAML 파싱 및 프로덕션 빌드 통과
- 관련 파일:
  - `server/cafe24/external-events-api.js`
  - `server/cafe24/app.js`
  - `scripts/ingestion/candidate-utils.mjs`
  - `docs/external-event-api.md`
  - `docs/external-event-api.openapi.yaml`
- 관련 커밋: pending

## 2026-07-26 외부 일정 API 파트너 문서와 주소 확인 보강

- 상태: 해결
- 범위: 파트너 전달 문서, API 인증 설명, 이미지 없는 소셜 주소 입력
- 증상: 파트너용 문서에 관리자 명령과 내부 광고 설명이 섞여 있었고, 주소 형식 설명만으로는 카카오맵에서 실제 검색되는 주소를 보장할 수 없었다.
- 조치:
  - 파트너 문서를 존댓말 안내서로 다시 작성하고 관리자 운영 절차를 별도 문서로 분리했다.
  - 최상위 분류 `category`와 하위 분류 `genre`를 조합별 표와 사용 사례로 설명했다.
  - 서버용 API Key 인증과 웹 로그인 세션을 사용하지 않는 이유·요청 흐름·소유권 범위를 명시했다.
  - 파트너 인증이 필요한 카카오 주소 확인 API를 추가하고, 이미지 없는 소셜 등록·수정 시 서버가 주소를 다시 확인하도록 했다.
- 검증:
  - 외부 API 단위 테스트, OpenAPI 파싱, TypeScript, ESLint, 프로덕션 빌드
  - 운영 배포 후 실제 API Key를 사용한 주소 검색·등록 거절 및 인증 차단 E2E
- 관련 파일:
  - `docs/external-event-api.md`
  - `docs/external-event-api-operations.md`
  - `docs/external-event-api.openapi.yaml`
  - `server/cafe24/external-events-api.js`
  - `server/cafe24/app.js`
- 관련 커밋: pending

## 2026-07-26 외부 API Key 회원 귀속과 관리자 통제 화면

- 상태: 해결
- 범위: 외부 일정 API 인증 운영, 관리자 메뉴, 감사 추적
- 증상: 파트너 키를 어느 계정에 귀속하고 두 관리자 계정이 어떻게 발급·통제할지 관리 화면과 기록 체계가 없었다.
- 조치:
  - 신규 파트너 키를 기존 회원 계정에 필수 연결하고 API 일정의 내부 소유자로 사용했다.
  - 햄버거 메뉴의 `관리자 콘솔 → 회원 & 보안`에 외부 API 파트너 관리 화면을 추가했다.
  - 발급·중지·재활성화·재발급·회원 연결·분류·호출 한도 설정과 요청 로그 조회를 제공했다.
  - 관리자 세션과 동일 출처를 함께 검사하고 모든 관리자 변경을 별도 감사 로그에 기록했다.
  - 키 원문은 발급·재발급 때 한 번만 반환하고 DB에는 해시만 저장하며, 재발급 시 이전 키를 즉시 무효화했다.
  - 운영 MariaDB 호환성을 위해 감사 세부정보는 JSON 문자열을 담는 `LONGTEXT`로 저장하도록 수정했다.
- 검증:
  - 두 운영 관리자 계정의 권한 확인
  - 비로그인·비관리자·교차 출처 차단, 키 발급·재발급·중지·요청 로그·감사 로그 API 테스트
  - 외부 API 단위 테스트, TypeScript, ESLint, 프로덕션 빌드 및 운영 배포 후 E2E
- 관련 파일:
  - `src/components/ExternalApiPartnerManagementModal.tsx`
  - `server/cafe24/external-events-api.js`
  - `server/cafe24/migrations/2026-07-26-external-api-admin-audit.sql`
  - `docs/external-event-api-operations.md`
- 관련 커밋: pending

## 2026-07-26 외부 API 승인·테스트 운영 절차 및 공개 안내 페이지

- 상태: 해결
- 범위: 파트너 신청, 관리자 승인, 장르 권한, 테스트 격리, 공개 매뉴얼
- 증상: 관리자가 키를 바로 발급하는 구조라 신청 승인 절차가 없었고, 단일 기본 장르와 실운영 직접 등록 방식은 파트너 개발 테스트와 복수 장르 권한을 안전하게 처리하기 어려웠다.
- 조치:
  - 로그인한 파트너가 공개 안내 페이지에서 연동을 신청하고 관리자가 승인 설정을 불러오는 흐름을 추가했다.
  - 최상위 분류는 반드시 1개만 지정하고, 그 안의 하위 장르만 복수 선택하도록 사이트 분류 구조와 통일했다. 하위 장르 미선택 시에는 지정한 최상위 분류의 하위 장르 전체만 허용한다.
  - 신규 키를 테스트 모드로 발급해 실제 일정은 변경하지 않고 검증 결과와 로그만 남기며, 검토 후 운영 모드로 전환하도록 했다.
  - 관리자 화면 탭을 `승인·파트너`, `기록`으로 단순화하고 공개 페이지 공유 버튼과 공유 메타데이터를 추가했다.
  - 문서의 기준 경로(`/`) 때문에 단순 해시 링크가 메인으로 이동하던 문제를 문서 절대 경로 해시 링크로 수정했다.
  - 파트너 Key가 하나의 최상위 분류만 사용하고, 일정 요청 한 건은 그 안의 하위 장르 하나를 보내는 규칙을 문서에 명시했다.
  - 이미지 없는 소셜은 등록 시 카카오맵 표준 주소로 자동 변환하고, 안내 페이지에서 저장 결과를 미리 확인하는 로그인 사용자용 주소 변환기를 제공했다.
  - 이미지 전달 방식을 선택하는 이유와 `upload` 2단계 요청, `url` 자동 다운로드, 실제 파일 검사, WebP 4종 생성, 내부 주소 연결 및 실패 시 일정 미등록 절차를 공개 문서에 명시했다.
  - 파트너 계정과 `external_id`를 일정·이미지 CRUD의 연결 고리로 명시하고, 수정 시 이전 이미지 교체·정리와 삭제 시 연결 이미지 정리를 구현했다.
  - 주소 확인 API와 일정 전체 수정·삭제를 파트너 서버에서 바로 구현할 수 있도록 JavaScript 예제를 공개 안내 페이지와 문서에 추가했다.
  - 정상적인 개발 테스트에 한해 연락처로 파트너명과 Key 앞부분을 보내 한도 증액 또는 사용량 초기화를 요청하는 절차를 명시했다.
  - 공유 API 안내 링크에 비로그인으로 진입하면 로그인 모달을 자동으로 열고, 로그인 후 신청 폼에는 연결될 본인 계정을 수정 불가 값으로 표시했다.
  - 외부 API 이미지 원본 수신 한도를 32MB로 확대하되 4천만 픽셀 제한과 실제 이미지 검사를 유지하고, 변환 후 원본은 저장하지 않도록 명시했다.
  - 큰 원본을 4종으로 동시에 변환할 때의 순간 메모리 부하를 줄이기 위해 사전 디코딩 검사 후 순차 변환하고, 각 WebP 결과를 재검사하도록 보강했다.
  - 카카오 주소 검색 첫 결과를 자동 채택하면 다른 장소가 저장될 수 있어, 파트너용 주소 API가 후보 목록을 반환하고 사용자가 선택한 표준 주소와 등록값이 정확히 일치할 때만 저장하도록 변경했다.
  - 테스트 한도 증액의 관리자 병목을 없애되 도배 우회를 막기 위해, 로그인 계정 소유의 활성 테스트 파트너에 한해 분당 60회·일 3,000회까지 24시간 1회 자동 상향하도록 구현했다. 운영 키는 자동 상향 대상에서 제외했다.
  - 운영 Apache 보안 모듈이 한글 주소 URL 쿼리를 애플리케이션 도달 전에 403으로 차단함을 운영 요청으로 재현했다. 주소 검색 입력을 URL이 아닌 인증된 POST JSON 본문으로 전달하도록 파트너 API와 체험 도구를 함께 변경했다.
  - 운영 브라우저 클릭 검증에서 문서 하단의 상대 해시 링크가 전역 `base href="/"` 때문에 홈페이지로 이동하는 문제를 발견했다. 안내 페이지 절대 경로가 포함된 해시 링크로 수정했다.
  - 운영 DB를 연결한 로컬 Playwright 검증에서 Vite 화면 포트와 API 프록시 포트 차이를 동일 출처 위반으로 오인했다. production의 정확한 host 일치 규칙은 유지하고, 비운영 loopback 호스트끼리만 포트 차이를 허용했다.
  - 로컬 운영 DB 테스트 서버가 카카오 REST 설정을 전달하지 않아 주소 UI를 운영 조건으로 검증할 수 없었다. 테스트 실행 중에만 운영 서버 환경에서 해당 키를 전달하도록 시작 스크립트를 보완했으며 값은 출력하거나 파일에 저장하지 않는다.
- 검증:
  - TypeScript, ESLint, 서버 문법, 외부 API 단위 테스트 23개, 프로덕션 빌드
  - 데스크톱·모바일 헤드리스 렌더링 및 가로 넘침·런타임 오류 검사
- 관련 파일:
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `src/components/ExternalApiPartnerManagementModal.tsx`
  - `server/cafe24/external-events-api.js`
  - `server/cafe24/migrations/2026-07-26-external-api-permissions-and-environment.sql`
- 관련 커밋: pending

## 2026-07-26 외부 일정 주소 입력 목적 및 비용 구조 정정

- 상태: 해결
- 범위: 외부 일정 API 주소 필드, 파트너 안내 페이지
- 증상: 주소를 이미지 없는 소셜의 필수값으로 한정하고 Dance Billboard가 카카오 주소 검색을 대행해, 실제 목적보다 제한이 강하고 외부 호출 비용 가능성이 생겼다.
- 원인: 주소의 목적을 모든 일정의 상세 장소·지도 연동 정확성 안내가 아니라 특정 화면의 대체 콘텐츠로 잘못 해석했다.
- 조치:
  - 주소를 이미지·분류와 무관한 선택값으로 변경했다.
  - Dance Billboard의 카카오 주소 대행 API와 등록 시 재검색을 제거했다.
  - 부정확한 주소는 상세 지도 검색의 첫 결과가 사용되어 다른 위치가 표시될 수 있음을 안내 페이지와 계약 문서에 명시했다.
  - 파트너가 원하면 다음 우편번호, 카카오맵, 네이버지도 또는 공공 도로명주소 검색으로 미리 확인할 수 있게 예시를 제공하되 확인 수단 입력은 강제하지 않았다.
  - Google Maps의 `formatted_address`, 영문 주소, Plus Code와 장소명은 카카오 주소검색 호환이 보장되지 않음을 확인하고, Google을 쓰는 파트너도 대한민국 도로명주소로 정리해 보내도록 안내했다.
- 검증: 외부 API 단위 테스트, TypeScript, ESLint, 프로덕션 빌드, 배포 후 브라우저 실사용 확인
- 관련 파일:
  - `server/cafe24/external-events-api.js`
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `docs/external-event-api.md`
  - `docs/external-event-api.openapi.yaml`

## 2026-07-26 외부 일정 요청 예시값과 CRUD 연결 설명 보강

- 상태: 해결
- 범위: 외부 일정 API 공개 안내 페이지와 전달용 문서
- 증상: 등록 코드 예시에서 어떤 값이 자유 입력이고 어떤 값이 고정 형식인지 바로 알기 어려웠으며, 수정·삭제가 등록값과 어떻게 연결되는지 설명이 분산돼 있었다.
- 조치:
  - 요청 주소·메서드·헤더·필드명은 유지하고 예시 필드값은 실제 일정에 맞게 바꾼다는 원칙을 등록 예시 바로 아래에 추가했다.
  - 자유 문자열, 날짜 형식, 허용 분류, HTTPS URL, 이미지 방식별 변경 규칙을 표로 정리했다.
  - 등록·수정·삭제는 동일 API Key와 동일 `external_id`로 연결되고, 수정은 전체 본문 재전송, 삭제는 본문 없이 식별자만 사용한다는 공통 규칙을 명시했다.
- 검증: 외부 API 단위 테스트, TypeScript, 대상 ESLint, 프로덕션 빌드, 운영 브라우저 확인
- 관련 파일:
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `docs/external-event-api.md`

## 2026-07-26 외부 API 신청 담당자 연락처 필수화

- 상태: 해결
- 범위: 외부 API 연동 신청 폼과 서버 검증
- 증상: 기술 담당자 연락처가 이메일 또는 전화번호 한 칸으로 되어 있어 긴급 연락과 기술 안내에 필요한 두 연락수단이 모두 확보되지 않았다.
- 조치:
  - 기술 담당자 이메일과 전화번호를 별도 필수 입력으로 변경하고 서버에서도 형식을 검증한다.
  - 로그인 계정에 유효한 이메일이 있으면 해당 이메일 사용 체크박스를 기본 선택하고 읽기 전용으로 자동 입력한다.
  - 소셜 로그인에서 이메일이 제공되지 않거나 형식이 유효하지 않으면 체크박스를 비활성화하고 직접 입력하게 한다.
  - 전화번호는 로그인 제공자 정보와 무관하게 항상 직접 입력한다.
- 검증: 연락처 정규화 단위 테스트, TypeScript, 대상 ESLint, 프로덕션 빌드, 운영 브라우저 확인
- 관련 파일:
  - `server/cafe24/external-events-api.js`
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `src/pages/external-api/ExternalEventApiGuidePage.css`

## 2026-07-26 파트너 API Key 보관 안내 명확화

- 상태: 해결
- 범위: 외부 API 공개 안내 페이지와 전달용 문서
- 증상: `파트너 서버에서만 사용`이라는 표현만으로는 `.env`만 사용해야 하는지, 다른 서버 비밀 저장 기술도 가능한지 판단하기 어려웠다.
- 조치:
  - 기술을 강제하지 않고 방문자에게 키가 노출되지 않아야 한다는 보안 원칙을 먼저 설명했다.
  - HTML·브라우저 JavaScript·공개 앱 번들·공개 저장소는 금지하고, 서버 환경변수·호스팅 비밀변수·Secret Manager·암호화 설정을 가능한 예로 제시했다.
  - `process.env`는 Node.js 서버 예시이며 다른 언어와 플랫폼에서는 동등한 비밀 저장 기능을 사용한다고 명시했다.
- 검증: TypeScript, 대상 ESLint, 프로덕션 빌드, 모바일·데스크톱 브라우저 렌더링 확인
- 관련 파일:
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `docs/external-event-api.md`

## 2026-07-26 cURL 예시와 실제 연동 코드 구분

- 상태: 해결
- 범위: 외부 API 등록 요청 안내
- 증상: cURL 예시가 모든 파트너가 그대로 사용해야 하는 고정 소스코드인지, 플랫폼별로 바꿔 구현해야 하는지 설명이 부족했다.
- 조치:
  - cURL은 터미널 시험용 예시이며 실제 서버 구현 코드는 언어와 플랫폼에 따라 달라진다고 명시했다.

## 2026-07-26 서버 환경별 외부 일정 등록 예시

- 상태: 해결
- 증상: 공개 안내 페이지가 cURL과 플랫폼 차이만 설명하고 있어, 파트너 개발자가 자신의 서버 환경에 맞는 최초 등록 코드를 직접 변환해야 했다.
- 해결:
  - Node.js, PHP, Python, Java 서버용 등록 예시를 선택형 탭으로 추가했다.
  - 프론트엔드 프레임워크와 무관하게 API Key는 서버 또는 서버리스 함수에서만 사용한다는 경계를 예시 바로 위에 표시했다.
  - 언어별 구현은 달라도 요청 주소·메서드·인증 헤더·JSON 계약은 동일하다고 문서화했다.

## 2026-07-26 외부 API 안내 검색 접근성

- 상태: 해결
- 증상: 안내 내용이 길어지면서 파트너가 이미지·장르·수정·오류 같은 필요한 항목을 목차만으로 빠르게 찾기 어려웠다.
- 해결:
  - 상단에 모든 방문자가 사용할 수 있는 문서 검색 버튼과 모달을 추가했다.
  - 섹션 제목·요약·API 키워드를 입력 즉시 자동완성하고 선택하면 해당 섹션으로 이동하게 했다.
  - 바깥 영역 클릭, 닫기 버튼, Escape 키를 지원하고 모바일에서는 하단 시트 형태로 표시한다.

## 2026-07-26 카카오톡 공유 링크 PWA 초기화 오류

- 상태: 해결
- 증상: Android 카카오톡 인앱 브라우저에서 외부 API 안내 링크를 열면 가상 PWA 모듈의 `registerSW`가 없는 상태에서 구조 분해되어 앱 오류 화면이 표시됐다.
- 원인: 일부 WebView에서 `virtual:pwa-register` 모듈 결과가 정상 export를 제공하지 않는데도 서비스 워커 등록을 무조건 실행했다.
- 해결:
  - 카카오톡을 포함한 인앱 브라우저에서는 서비스 워커 등록 자체를 건너뛴다.
  - PWA 모듈과 `registerSW` 함수 존재 여부를 검사하고 import 실패도 앱 부팅을 막지 않도록 처리했다.
  - Android 카카오톡에서 API 안내 링크를 열면 Chrome 외부 브라우저 Intent를 우선 실행한다.
  - Intent가 차단된 경우에는 반복 이동을 막는 fallback URL로 인앱에서도 문서를 정상 표시한다.

## 2026-07-26 모바일 API 문서 검색창 키보드 가림

- 상태: 해결
- 증상: Android에서 문서 검색 입력창에 포커스하면 소프트 키보드가 모달 위를 덮고, 자동완성 항목 수에 따라 모달 전체가 밀려 입력창이 가려졌다.
- 원인: 검색 모달이 레이아웃 뷰포트의 `100vh`와 화면 하단을 기준으로 배치되어 키보드가 줄인 `visualViewport` 높이와 위치를 반영하지 못했다.
- 해결:
  - 검색 배경과 모달을 `visualViewport`의 top·left·width·height CSS 변수에 맞춰 고정했다.
  - 제목과 입력창은 고정 영역으로 유지하고 자동완성 결과만 별도 세로 스크롤되도록 분리했다.
  - 모달이 열린 동안 배경 문서 스크롤을 잠그고 결과 영역에 터치 스크롤·overscroll 제한을 적용했다.

## 2026-07-26 API 문서 자동완성 띄어쓰기 불일치

- 상태: 해결
- 증상: `연동 신청`은 검색되지만 같은 의미의 `연동신청`은 검색 결과가 없었다.
- 원인: 검색어와 색인 문자열을 소문자로만 변환하고 공백과 구분 문자를 그대로 비교했다.
- 해결:
  - 검색어와 문서 색인을 유니코드 NFKC로 정규화한다.
  - 공백·줄바꿈·하이픈·슬래시·일반 구두점을 제거한 뒤 비교해 띄어쓰기와 간단한 구분 기호 차이를 무시한다.

## 2026-07-26 API 문서 복합 키워드 검색과 결과 구분

- 상태: 해결
- 증상: `API`는 검색되지만 `연동api`처럼 한글과 영문 키워드를 붙여 입력하면 두 단어 사이에 다른 문구가 있는 결과를 찾지 못했다. 검색 결과 카드도 입력창과 시각적으로 비슷하고 목록 스크롤 가능 여부가 명확하지 않았다.
- 해결:
  - 한글과 영문·숫자의 경계에서 검색어를 자동 분리하고, 여러 키워드가 순서와 간격에 관계없이 모두 포함된 항목을 찾는다.
  - 검색 결과를 별도 패널로 감싸고 결과 제목·건수·순번·스크롤 안내를 표시한다.
  - 결과 패널에 항상 세로 스크롤 영역과 눈에 보이는 스크롤바를 적용하고 입력창과 다른 배경·카드 구조를 사용한다.
  - WAI-ARIA combobox/listbox 패턴에 맞춰 결과 건수를 실시간 알리고 방향키·Home·End로 결과를 이동하며 Enter로 선택할 수 있게 했다.

## 2026-07-26 모바일 검색 선택 핸들·결과 표시 간격

- 상태: 해결
- 증상: Android 텍스트 선택 핸들이 검색창 바로 아래 안내 문구와 겹쳤고, `검색 결과`와 `1개`가 양쪽에 분리되어 결과 건수를 한눈에 읽기 어려웠다.
- 해결:
  - 입력창과 안내 문구 사이에 모바일 선택 핸들을 위한 간격을 확보했다.
  - 결과 머리말을 `검색 결과 N개` 한 문장으로 표시한다.
  - 결과 개수와 관계없이 결과 패널 오른쪽에 스크롤 레일과 하단 영역 안내를 항상 표시한다.

## 2026-07-26 외부 API 안내 헤더 고정 실패

- 상태: 해결
- 증상: 헤더에 `position: sticky`가 선언되어 있었지만 실제 운영 페이지를 1,800px 스크롤하면 헤더의 top이 `-1,800px`가 되어 화면에서 사라졌다.
- 해결:
  - 헤더를 viewport 기준 `position: fixed`로 전환하고 충분한 z-index와 그림자를 적용했다.
  - 페이지에 데스크톱 66px, 모바일 58px 상단 여백을 추가해 첫 콘텐츠가 헤더 아래에 가려지지 않도록 했다.

## 2026-07-26 모바일 헤더 아이콘 의미 불명확

- 상태: 해결
- 증상: 모바일 헤더가 검색·관리·공유 기능을 아이콘만 표시해 기능 이름을 바로 알아보기 어려웠고, 문서 섹션으로 이동하는 전용 메뉴가 없었다.
- 해결:
  - 모바일 헤더에 `검색`, `섹션`, `관리`, `공유` 이름을 직접 표시한다.
  - `섹션` 버튼과 1~9번 섹션 이름·요약을 보여주는 별도 선택 화면을 추가한다.
  - 섹션을 선택하면 해당 문서 위치로 이동하고 고정 헤더 아래에 맞춰 표시한다.
  - 플랫폼과 무관하게 고정되는 항목을 HTTP 메서드, URL, 인증 헤더, Content-Type, JSON 필드 계약으로 구분했다.
  - 브라우저 코드가 아닌 파트너 서버에서 동일한 HTTP 계약을 구현하도록 안내했다.
- 검증: TypeScript, 대상 ESLint, 프로덕션 빌드, 브라우저 렌더링 확인
- 관련 파일:
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `docs/external-event-api.md`

## 2026-07-26 Android 키보드 전환 중 검색 결과 하단 잘림

- 상태: 해결
- 증상: 같은 Android Chrome에서도 주소창과 키보드 애니메이션 상태에 따라 검색 결과 패널 하단이 키보드 뒤에 가려졌다.
- 원인: 전역 `visualViewport` CSS 변수가 한 번 갱신된다는 전제에 의존해, 키보드가 단계적으로 열리거나 브라우저가 늦게 viewport 값을 보고하면 모달 높이가 이전 화면 높이에 남았다.
- 해결:
  - viewport 메타에 `interactive-widget=resizes-content`를 선언해 지원 브라우저가 키보드 표시 시 레이아웃 영역도 줄이도록 했다.
  - 검색 모달이 열려 있는 동안 `visualViewport.height`, `innerHeight`, 문서 표시 높이 중 가장 작은 값을 사용하고 키보드 애니메이션 800ms 동안 매 프레임 다시 측정한다.
  - resize·focus·회전 이벤트에도 재측정하며, 낮아진 화면에서는 제목과 도움말을 압축하고 남은 높이를 결과 목록의 내부 스크롤에 배정한다.
- 관련 파일:
  - `index.html`
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `src/pages/external-api/ExternalEventApiGuidePage.css`

## 2026-07-26 공개 API 안내 진입 경로

- 상태: 해결
- 증상: API 안내가 관리자 하위 메뉴에만 있어 일반 사용자가 공개 문서에 접근하기 어렵고, 비로그인 방문 시 로그인 창이 자동 표시되었다.
- 해결:
  - 햄버거 메뉴의 빠른 기능 영역에 누구나 볼 수 있는 `API 연동` 버튼을 추가하고 일정 등록 버튼 왼쪽에 배치했다.
  - 화면 모드 버튼은 한 줄짜리 작은 버튼으로 축소했다.
  - 관리자 하위 메뉴의 중복 링크를 제거하고, 공개 문서는 로그인 없이 읽을 수 있게 했다.
  - 로그인은 연동 신청이나 테스트 한도 요청을 누를 때만 요구한다.
- 관련 파일:
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`
  - `src/styles/theme-completion.css`
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`

## 2026-07-26 햄버거 메뉴 API 버튼 의미 불명확

- 상태: 해결
- 증상: `API 연동`이라는 짧은 이름만으로는 외부 사이트 일정을 자동 등록하는 기능인지 바로 알기 어려웠다.
- 해결: 버튼 제목을 `자동등록 API`로 변경하고 `외부 사이트 일정 연동` 설명을 별도 줄로 표시해 제목과 용도를 한눈에 구분하도록 했다.
- 관련 파일:
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`

## 2026-07-26 햄버거 메뉴 전체 가독성

- 상태: 해결
- 증상: 영문 구역명과 비슷한 대비의 카드가 연속되어 빠른 기능, 사이트 현황, 관리자 기능을 한눈에 구분하기 어려웠다.
- 해결:
  - 구역명을 `빠른 기능`, `사이트 현황`, `관리자 메뉴`처럼 한국어 중심으로 변경하고 영문은 작은 보조표기로 낮췄다.
  - 각 구역에 배경·간격·경계선을 적용해 정보 위계를 분리했다.
  - 빠른 기능 카드의 높이와 대비를 통일하고 화면 모드 버튼은 한 줄 보조 기능으로 유지했다.
  - 관리자 하위 기능을 그룹 카드와 행 형태로 정리하고 메뉴 스크롤 위치를 확인할 수 있는 얇은 스크롤바를 표시했다.
  - 메뉴 이미지와 일반 요소의 불필요한 드래그 및 텍스트 선택을 차단했다.
- 관련 파일:
  - `src/layouts/MobileShell.tsx`
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`

## 2026-07-26 햄버거 메뉴 로그아웃 영역 높이 점유

- 상태: 해결
- 증상: 로그아웃과 버전 영역이 스크롤 영역 밖에 고정되어 좁은 모바일 화면에서 메뉴가 사용할 수 있는 높이를 계속 줄였다.
- 해결: 하단 영역을 메뉴 스크롤의 마지막 항목으로 이동해 끝까지 스크롤했을 때만 로그아웃 버튼이 보이도록 했다.
- 관련 파일:
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`

## 2026-07-26 햄버거 메뉴 명도 대비 부족

- 상태: 해결
- 증상: 다크 모드에서 메뉴 바탕, 기능 카드, 통계 카드의 명도가 비슷하고 보조 문구가 어두워 카드 경계와 설명을 읽기 어려웠다.
- 해결:
  - 다크 모드의 전체 배경, 구역 배경, 기능 카드, 통계 카드를 네 단계 명도로 분리했다.
  - 카드 테두리와 그림자를 강화하고 제목은 흰색, 보조 설명은 밝은 회색으로 대비를 높였다.
  - 일반 메뉴 아이콘에도 밝은 아이콘 타일을 적용해 메뉴 행을 빠르게 구분하도록 했다.
  - 라이트 모드는 회색 메뉴 배경 위에 흰색 카드를 사용하고 테두리와 본문 대비를 강화했다.
- 관련 파일:
  - `src/styles/domains/overlays.css`

## 2026-07-26 프로필 지역·외부 링크 줄 낭비

- 상태: 해결
- 증상: Instagram 대표 링크, 지역, Website 링크가 각각 별도 행을 사용해 충분한 가로 공간이 있는데도 프로필 영역이 여러 줄로 늘어났다.
- 해결:
  - 지역, 관심 장르, 모든 외부 링크를 하나의 가로 칩 행으로 통합했다.
  - Instagram과 Website 등 외부 링크는 접근 가능한 이름과 툴팁을 유지하면서 아이콘 전용 버튼으로 축소했다.
  - 공간이 부족한 경우에만 칩 행이 자동 줄바꿈되도록 했다.
- 관련 파일:
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`

## 2026-07-26 프로필 외부 링크 클릭 가능성 불명확

- 상태: 해결
- 증상: 축소된 SNS·웹사이트 아이콘이 모두 같은 색이면 서비스 구분이 어렵고 단순 상태 표시처럼 보여 클릭 가능한 링크인지 알기 어려웠다.
- 해결:
  - Instagram은 브랜드 그라데이션과 채움 아이콘, YouTube는 빨강, 웹사이트는 청록, 카카오 오픈채팅은 노랑, 기타 링크는 보라색 버튼으로 표시한다.
  - 호버와 키보드 포커스 시 밝은 테두리, 외곽선, 이동 효과를 표시해 클릭 가능한 링크임을 명확히 했다.
- 관련 파일:
  - `src/components/SideDrawer.tsx`
  - `src/styles/domains/overlays.css`

## 2026-07-26 자유게시판 신규·건의·숨김 글 식별 개선

- 상태: 해결
- 범위: 자유게시판 목록과 전역 하단 포럼 메뉴
- 증상:
  - 최근 등록 글, 건의사항, 관리자에게만 보이는 숨김 글의 시각적 구분이 약했다.
  - 다른 페이지에 있을 때 자유게시판에 새 글이 등록돼도 하단 메뉴에서 알 수 없었다.
- 조치:
  - 등록 후 14일 동안 데스크톱·모바일 목록 제목 옆에 `NEW`를 표시한다.
  - 건의/신청 말머리를 주황 계열로 분리하고 행 왼쪽 강조선을 추가했다.
  - 숨김 글도 목록의 정렬 위치와 신규 글 숫자에는 포함한다.
  - 숨김 글은 행의 존재, NEW, 날짜, 댓글 수 등만 표시하고 제목·작성자 아이디/닉네임·본문·이미지는 일반 사용자에게 전달하지 않는다.
  - 관리자와 해당 글 작성자에게만 원래 목록 정보와 상세 진입 권한을 제공한다.
  - 등록 후 14일 이내의 모든 자유게시판 글 수를 실제 모바일 하단 자유게시판 메뉴의 숫자 배지로 표시하며, 숨김 글의 실시간 신규 등록도 반영한다.
  - 자유게시판에 방문해도 14일 기간 안에는 숫자 배지를 유지한다.
- 검증:
  - `npx tsc --noEmit`
  - `npm run build:only`
- 관련 파일:
  - `src/pages/board/components/StandardPostList.tsx`
  - `src/pages/board/board.css`
  - `src/pages/board/hooks/useBoardPosts.ts`
  - `src/hooks/useFreeBoardUnreadCount.ts`
  - `src/layouts/BottomNavigation.tsx`
- 관련 커밋: pending

## 2026-07-26 다장르 혜택 이벤트 수집·노출 경로 완성

- 상태: 해결
- 범위: 스윙·살사·바차타·탱고·스트릿 무료·할인 이벤트 및 정기권 판매 수집
- 증상:
  - 혜택 판별과 전용 화면은 있었지만 등록된 검색어가 실제 일일 수집기에서 실행되지 않았다.
  - 후보의 `benefit_eligible`가 관리자 승인 뒤 운영 `events` 행으로 전달되지 않아 화면에 노출되지 않았다.
- 원인:
  - 정적 계정 소스 수집과 동적 혜택 검색이 연결되지 않았고, 검색엔진 차단 시 대체 발견 경로가 없었다.
  - 수집 후보와 운영 이벤트 사이의 혜택 메타데이터 계약이 누락됐다.
- 조치:
  - 스윙 전용 4개와 확장 장르 8개의 단계별 혜택 검색 소스를 추가했다.
  - Google → Bing → Naver 프로필 발견 → 실제 Instagram 게시물 검증 순서의 폴백을 구현했다.
  - 실제 본문·미래 날짜·원본 이미지·명시적 무료/정기권 표현을 모두 통과한 후보만 허용한다.
  - 확장 장르는 `expanded-research`에서 저장 없이 검증하고 `expanded-ingestion`에서만 저장 가능하게 했다.
  - 승인 시 `benefit_eligible`와 허용된 `benefit_kind`를 운영 이벤트에 보존하고 알 수 없는 값은 차단한다.
  - 관리자 수집센터 상단을 `신규 | 완료 | 중복 | 무료, 할인 이벤트` 독립 탭으로 구성하고, 해당 탭에는 검증 대기 중인 무료·할인·정기권 후보를 표시한다.
  - 일정 전체가 유료여도 무료 강습·입장·체험·제공·주차 등 명시된 무료 요소가 있으면 혜택 후보로 분류한다.
  - 동호회와 바의 정기권·시즌권·월정액·멤버십 판매도 같은 탭으로 분류한다.
  - 후보 등록은 기존 운영 이벤트 등록 흐름을 그대로 사용하며, 운영 일정 목록에 노출되는 동시에 메인의 `무료, 할인 이벤트` 버튼이 연결된 혜택 목록에도 추가 노출한다.
  - 08시 우선순위 1, 09시 우선순위 2에 이어 10시 우선순위 3(무료·정기권), 11시 우선순위 4(할인) 자동 실행을 추가하고 `benefit_search`만 실행해 일반 수집 예산과 분리한다.
  - 3·4단계 스윙 혜택 검색을 무료 강습·입장·워크숍·동호회 혜택, 할인·특가·얼리버드·쿠폰, 바·동호회·댄스홀 정기권/패스 등 14개 검색 축으로 확장했다.
  - 소셜 및 모든 혜택 후보(무료·할인·정기권·시즌권·멤버십·패스)는 원문·미래 날짜 등 나머지 조건이 확인되면 이미지가 없어도 검수 후보로 저장하고 이미지 보완 경고를 남긴다.
  - 기존 Instagram 접근 지연, 연속 실패 회로 차단, 20분 실행 제한은 그대로 유지해 봇 판정과 장기 실행 위험을 제어한다.
  - 같은 후보를 다시 검증했을 때 새 혜택 메타데이터가 기존 대기 후보에 갱신되도록 했다.
  - 수집 summary에 소스별 발견·검사·일치 건수를 추가했다.
- 검증:
  - 수집 표준 및 오탐·URL·프로필·필드 계약 테스트 통과
  - TypeScript, 관련 서버 테스트 29개, 프로덕션 빌드 통과
  - 스윙 무료 강습 실브라우저 드라이런에서 2026-08-01 후보 2건 확인
  - 로그인된 브라우저에서 2026-11-04 DDP 무료 스윙 이벤트 원본 본문·이미지 확인 및 후보 저장
  - 살사·바차타·탱고·스트릿 확장 드라이런에서 무결과, 명시 혜택 불일치, Instagram 접근 실패를 저장 없이 분리 기록
- 관련 파일:
  - `scripts/ingestion/collection-registry.mjs`
  - `scripts/ingestion/benefit-search-utils.mjs`
  - `scripts/ingestion/swing-daily-native.mjs`
  - `scripts/com.rhythmjoy.codex-ingestion-priority3.plist`
  - `scripts/com.rhythmjoy.codex-ingestion-priority4.plist`
  - `scripts/ingestion/candidate-utils.mjs`
  - `server/cafe24/ingestion-benefit-fields.js`
  - `server/cafe24/function-api.js`
  - `src/pages/admin/v2/EventIngestorV2.tsx`
  - `src/pages/v2/components/HomeNavButtonsSection.tsx`
  - `src/styles/components/HomeNavButtonsSection.css`
  - `src/pages/benefit-events/BenefitEventsPage.tsx`
- 관련 커밋: `78af6020`, `16d8e111`, `a796a641`, `db9dc114`

## 2026-07-26 메인 혜택 버튼 위치 누락 수정

- 상태: 해결
- 범위: 모바일·데스크톱 메인 신규 이벤트 영역
- 증상: `무료, 할인 이벤트` 진입점이 하단 메뉴에는 표시됐지만, 지정된 `원데이 모집` 버튼 아래에는 표시되지 않았다.
- 원인: 버튼용 반응형 스타일만 구현되어 있고 `NewEventsBanner`의 실제 버튼 마크업이 누락됐다.
- 조치:
  - `원데이 모집` 버튼 바로 아래에 `무료, 할인 이벤트` 버튼을 추가했다.
  - 기존 혜택 목록 `/benefit-events`로 연결하고 버튼 내부 요소는 드래그 대상이 되지 않도록 구성했다.
  - 모바일 혜택 목록의 가로 전체 이미지를 72px 정사각형 썸네일로 축소하고 날짜·이미지·정보를 한 행에 정렬했다.
  - 혜택 카드를 누르면 전체 설명이 포함된 상세창을 열고, 목록과 상세창의 외부 이동 명칭을 `원본 링크`로 통일했다.
  - 첫 미래 이벤트 자동 스크롤을 제거해 진입 시 항상 페이지 제목이 보이는 최상단에서 시작하게 했다.
  - 메인 빠른 진입 버튼 두 개를 하나의 세로 그룹으로 묶어 모바일에서는 오늘일정 왼쪽, 데스크톱에서는 기존 좌측 고정 영역에 `원데이 모집` 바로 아래 혜택 버튼이 유지되게 했다.
  - 상세창에 잘리지 않는 대형 포스터를 추가하고, 포스터를 누르면 원본 이미지를 단독으로 열어 모바일 브라우저 기본 확대를 사용할 수 있게 했다.
  - 페이지별 액션이 없는 화면에서도 사이드 메뉴 빠른 기능에 `이벤트 등록`을 기본 표시하고 기존 등록 선택창을 직접 열게 했다.
  - 상세 포스터에 원본 링크 버튼의 알약형 CSS가 잘못 적용되던 선택자 충돌을 제거하고 직사각형 원본 비율로 표시했다.
  - 상세 포스터는 목록용 `micro` 대신 `image_full → image → image_medium` 순서로 고해상도 파일을 사용한다.
- 검증: TypeScript, 프로덕션 빌드, 모바일 실화면 노출 및 이동 확인
- 관련 파일:
  - `src/pages/v2/components/NewEventsBanner.tsx`
  - `src/pages/v2/components/NewEventsBanner.css`
- 관련 커밋: pending

## 2026-07-26 상시 정기권 판매의 과거 게시물 수집 허용

- 상태: 해결
- 범위: 3단계 무료·정기권 혜택 검색
- 증상: 현재도 계속 판매하는 정기권·월정액·멤버십 안내가 과거 게시물 날짜 또는 미래 행사 날짜 부재 때문에 후보에서 제외됐다.
- 원인: 일회성 행사와 상시 판매 상품에 동일한 미래 날짜 검증을 적용했다.
- 조치:
  - 상시 판매·현재 구매 가능·정기권 가격 안내 등 지속 판매 근거를 별도로 판별한다.
  - 판매 종료·마감·중단·폐지·품절 표현은 상시 판매에서 제외한다.
  - 지속 판매가 확인되면 원 게시물 날짜는 `source_post_date`로 보존하고 수집일을 후보 날짜로 사용한다.
  - 당일 행사 시작 시간 검증을 상시 판매 상품에는 적용하지 않는다.
- 검증: 과거 게시물의 현재 판매 중 정기권은 통과하고 판매 종료 게시물은 거부하는 자동 테스트 추가
- 관련 파일:
  - `scripts/ingestion/candidate-utils.mjs`
  - `scripts/ingestion/swing-daily-native.mjs`
  - `scripts/test-ingestion-standards.mjs`
- 관련 커밋: pending

## 새 항목 템플릿

```md
## YYYY-MM-DD 제목

- 상태: 조사중 | 해결 | 보류 | 재발감시
- 범위:
- 증상:
- 원인:
- 조치:
- 검증:
- 재발 방지:
- 관련 파일:
- 관련 커밋:
```
## 2026-07-26 — Compact multi-day social notice collapsed to one candidate

- Status: resolved
- Context: A Naver Cafe notice titled `7월 25,26일` described Saturday and Sunday as separate social sessions with different DJ/time sections, but only one candidate appeared.
- Root cause: the social section parser required a numeric date beside each body section. Compact dates in the title plus weekday-only body headings fell back to generic date extraction, losing per-session details; already-past dates were then correctly filtered by the future-only policy.
- Resolution: added title-date/weekday-section matching so each future/current social session becomes its own candidate with section-scoped details. Social candidates remain exempt from first-date expansion collapse.
- Verification: covered by `scripts/test-ingestion-standards.mjs`.

### Follow-up: past session hidden after manual recovery

- The 2026-07-25 session was successfully stored during a 2026-07-26 manual recovery but did not appear in the admin new-candidate list because the normal future-only list filter hid it.
- Added a narrowly scoped `manual_recovery_until` exception. It keeps an explicitly recovered past candidate visible only through the specified review date; ordinary automated past candidates remain hidden.

## 2026-07-26 모바일 달력 연속 일정과 날짜 헤더 간격 겹침

- 상태: 해결
- 범위: 모바일 월간 달력의 날짜·요일 헤더 및 연속 일정 표시
- 증상: 연속 일정이 2줄 이상 표시될 때 첫 일정이 날짜·요일 표시부에 너무 가까워지고, 연속 일정 아래의 일반 이벤트와도 간격이 불균일했다.
- 원인: 모바일 날짜 헤더의 실제 최대 높이는 오늘 날짜 배지를 포함해 20px인데, 연속 일정의 시작 위치는 행 상단 18px로 고정되어 있었다. 연속 일정 뒤 본문 여백도 별도 기준값을 사용했다.
- 조치: 연속 일정 시작 위치를 날짜 헤더 아래 28px로 이동했다. 연속 일정의 실제 줄 수에 20px 줄 간격을 곱한 높이를 런타임 CSS 변수로 전달하고, 그 높이 뒤에 16px의 공통 여백을 적용해 1·2·3줄 이상에서도 아래 이벤트가 자동으로 밀리게 했다. 기존 3줄 표시 제한도 제거했다.
- 검증: CSS 규칙 확인 및 프로덕션 빌드
- 관련 파일:
  - `src/pages/calendar/components/FullEventCalendar.tsx`
  - `src/pages/calendar/styles/FullEventCalendar.css`
- 관련 커밋: pending

## 2026-07-26 인스타그램 소셜 캘린더 릴스 화질·배치·커버 오류

- 상태: 해결
- 범위: `swingenjoy.com/calendar` 기반 15초 Instagram Reel 생성 및 게시
- 증상: 데스크톱 비율 캡처 때문에 사이트 글자가 작고 화면이 잘렸으며, 색 보정으로 원본 색이 과장됐다. 글자 상자가 작거나 중앙에서 벗어났고 외곽선·라운드가 일관되지 않았다. 프로필 그리드에서는 영상 커버가 의도한 구도로 보이지 않았다.
- 원인: 모바일 페이지를 실제 모바일 viewport로 재배치하지 않은 캡처, 고정 좌표 기반 오버레이, 불필요한 색상 필터, Instagram 프로필 커버 크롭 미설정이 함께 발생했다.
- 연결 불안정 원인:
  - Mac 잠금 자체는 ADB를 끊지 않지만 잠자기에 들어가면 에뮬레이터와 ADB 실행이 정지한다.
  - Instagram 편집기는 앱 메모리 회수, 네트워크 지연, 로그인 세션 갱신 때 편집 화면 상태를 잃을 수 있다.
  - 장시간 UI 제어 연결이 끊겨도 에뮬레이터 앱 상태와 영상 파일은 남지만, 진행 단계 확인 없이 다시 누르면 중복 게시 위험이 생긴다.
- 조치:
  - Android 모바일 환경의 390×844 CSS viewport와 5배 device scale로 캘린더를 다시 캡처해 사이트 글자를 약 10% 키우고, 4K 축소 단계에서 약한 선명화만 적용한다.
  - 오늘 파란 날짜의 실제 DOM 좌표를 읽어 글자 상자를 위쪽 좌·우 중 여유 있는 곳에 배치하고 화살표 방향을 동적으로 계산한다.
  - 글자 상자를 1080 기준 440×150, 100px·굵기 500 글자, 흰색 배경, 20px 라운드, 4px 연회색 외곽선으로 고정하고 가로·세로 중앙 정렬한다.
  - 배경 색상 보정은 제거하고 BT.709 limited H.264 2160×3840, 30fps, 15초, CRF 16으로 출력한다.
  - 첫 프레임과 동일한 4K 커버를 별도 생성하고 Instagram 프로필 크롭은 확대·이동 없이 기본 원본 상태를 사용한다.
  - 실행 연결이 끊겨도 같은 날짜 결과를 중복 생성하지 않도록 잠금·재시도·검증·실행 상태 파일을 추가한다.
  - Instagram UI는 단계별 화면 확인 후 다음 동작으로 진행하고, 게시 완료 화면과 프로필 그리드를 각각 검증한다.
- 검증:
  - 동적 레이아웃 자동 테스트 7개 통과.
  - 2026-07-26 생성 영상의 2160×3840, 30fps, 15초, H.264 High Profile 및 BT.709 메타데이터 확인.
  - 기존 저가독성 Reel을 삭제하고 개선본을 다시 게시했다. 새 게시물에서 `Take Five — Dave Brubeck` 음악, 4K 캘린더 화면과 프로필 첫 번째 그리드의 기본 원본 크롭 노출을 확인했다.
- 재발 방지: `npm run social-reel:run`으로 동일한 생성 규칙과 레이아웃 테스트를 재사용하고, 게시 전 4K 커버와 기본 원본 프로필 크롭을 확인한다. 음악은 게시 회차마다 다른 재즈곡을 선택한다.
- 관련 파일:
  - `scripts/social-reels/generate-social-reel.mjs`
  - `scripts/social-reels/run-social-reel.mjs`
  - `scripts/social-reels/layout.mjs`
  - `scripts/social-reels/layout.test.mjs`
  - `docs/social-reel-automation.md`
  - `docs/decisions/2026-07-26-social-reel-dynamic-layout.md`
- 관련 커밋: `7badf4d0`

## 2026-07-26 Instagram Reel 자동 게시 예약과 연결 안정화

- 상태: 배포 완료
- 범위: Mac Android 에뮬레이터 기반 Instagram Reel 자동 등록, 화·목·토 12:30 예약 실행
- 문제:
  - 수동 UI 제어가 길어지고 연결이 끊길 때 현재 단계를 알 수 없었다.
  - 녹화 좌표 방식은 Instagram 팝업, 앱 업데이트, 네트워크 지연 때 다른 버튼을 누를 위험이 있었다.
  - 공유 직후 연결이 끊기면 무조건 재실행할 경우 같은 Reel이 중복 게시될 수 있었다.
- 해결:
  - 매 단계에서 Android UI 계층의 접근성 ID·텍스트·설명을 확인하는 ADB 상태 기반 제어기를 추가했다.
  - 실행 중인 `Medium_Phone` AVD를 재사용하고, 꺼져 있으면 자동으로 시작하도록 했다.
  - 로그인 계정과 게시물 수, 최신 영상, 정확한 음악 제목·아티스트, 4K 커버, 공유 버튼을 각각 검증한다.
  - 직전 게시 곡과 다른 재즈곡을 순환 선택하고, 검색 결과가 없으면 다음 후보를 사용한다.
  - 공유 전 실패와 공유 후 불명확 상태를 분리했다. 공유 후에는 프로필 게시물 수 증가가 확인되지 않으면 자동 재시도를 차단한다.
  - 화·목·토 12:30 KST LaunchAgent와 `caffeinate`, 실행 잠금, 상태 파일, 로그·알림을 구성했다.
- 검증:
  - `npm run test:social-reel`: 동적 배치·UI XML·음악 순환 테스트 10개 통과
  - 실제 Instagram 439.0.0.37.89에서 `Do What You Wanna — Ramsey Lewis` 선택, 4K 커버 설정, 기본 프로필 크롭 유지, `Share` 직전 화면 확인
  - 드라이런은 실제 게시 없이 편집 내용을 자동 폐기했고 UI 구간 106.5초 소요
  - 2160×3840, 30fps, 15초, H.264, yuv420p, BT.709 결과 재검증
  - `com.rhythmjoy.social-reel-publish`를 Mac 사용자 LaunchAgent로 설치하고 화(2)·목(4)·토(6) 12:30 트리거, `caffeinate`, 작업 경로와 로그 경로를 `launchctl print`로 확인
- 알려진 운영 상태:
  - 초기 드라이런에서 Telegram Bot 환경 값이 HTTP 404를 반환했다. 원인은 토큰 만료가 아니라 캘린더 동기화 설정의 셸 기본값 문법을 `dotenv`가 확장하지 않은 것이었다. 셸 호환 환경 로더를 추가해 기존 캘린더 동기화 봇과 채팅 ID를 함께 사용하도록 수정했다.
  - Telegram 전송 자체가 실패해도 게시 성공을 실패 처리하지 않으며 macOS 알림·로그로 대체한다.
  - Mac 잠금은 허용되지만 잠자기·종료·로그아웃·네트워크 단절 중에는 실행할 수 없다.
- 관련 파일:
  - `scripts/social-reels/instagram-reel-adb.mjs`
  - `scripts/social-reels/run-scheduled-social-reel.mjs`
  - `scripts/social-reels/install-macos-launch-agent.sh`
  - `ops/macos/com.rhythmjoy.social-reel-publish.plist`
  - `docs/social-reel-automation.md`
  - `docs/decisions/2026-07-26-social-reel-dynamic-layout.md`
- 관련 커밋: `7badf4d0`

## 2026-07-28 Instagram Reel 화·목·토 예약 게시 실패

- 상태: 코드 수정 및 회귀 테스트 완료, 2026-07-28 누락분 재게시 대기
- 현상: 화요일 12:30 예약 작업이 영상·커버 생성까지 완료했지만 Instagram 공유 단계로 진입하지 못했다.
- 원인:
  - 키오스크 ADB 연결과 `Medium_Phone` 에뮬레이터가 동시에 존재했다.
  - 게시기가 모든 ADB 명령을 serial 지정 없이 실행해 `more than one device/emulator`로 중단됐다.
  - 실패 뒤 남은 에뮬레이터 Quick Boot 스냅샷은 ADB `offline` 상태로 복원돼 자동 재게시도 진행할 수 없었다.
- 조치:
  - `adb devices` 결과를 파싱하고 실행 중인 AVD 이름을 확인해 `Medium_Phone` serial만 선택하도록 변경했다.
  - 이후 모든 ADB 명령에 `-s <serial>`을 적용해 키오스크나 다른 에뮬레이터가 함께 연결돼도 게시 대상을 혼동하지 않도록 했다.
  - `Share` 이전 실패만 최대 3회 재시도하고, `Share` 이후 검증 불명확 상태는 중복 게시 방지를 위해 재시도하지 않도록 실행기를 보강했다.
  - 다중 장치와 offline 장치가 섞인 회귀 테스트를 추가했다.
- 검증:
  - `npm run test:social-reel`: 12개 테스트 통과
  - 예약 작업 실행 기록에서 2026-07-28 영상은 2160×3840, H.264, 30fps, 15초, BT.709로 정상 생성됐고 실패 지점은 공유 전 ADB 대상 선택임을 확인
- 후속:
  - 실제 게시 환경은 `Medium_Phone`의 영구 사용자 데이터다. Quick Boot
    스냅샷은 게시 환경 또는 앱 설치 상태의 근거로 사용하지 않는다.
  - 당시 스냅샷 RAM 문자열만으로 `com.instagram.android` 설치 상태를
    재확인했다는 기록은 잘못이었다. 설치 여부의 단일 기준은 실행 중인
    대상 AVD에서 조회한 Android Package Manager의 `pm path` 결과다.
  - `Medium_Phone_2`는 게시 환경으로 사용하지 않으며 `Medium_Phone`은
    항상 snapshot load/save를 비활성화하고 cold boot한다.
  - Mac 잠금 해제에 의존하지 않고 emulator gRPC 화면 제어로 기존 스냅샷 상태를 확인할 수 있음을 검증했다.
  - 이후 모든 장애 대응은 AVD 이름·snapshot 경로·ADB serial·Instagram 패키지 확인 결과를 먼저 기록하고 진행한다.
- 관련 파일:
  - `scripts/social-reels/instagram-reel-adb.mjs`
  - `scripts/social-reels/instagram-reel-adb.test.mjs`

## 2026-07-28 Instagram 앱·로그인 상태 Quick Boot 롤백

- 상태: 원인 확인 및 재발 방지 적용, 앱 재설치·로그인 복구 필요
- 현상: 이전에 Instagram 설치와 `korea_swing_social` 로그인을 완료한
  `Medium_Phone`에서 앱 패키지가 보이지 않아 자동 게시가 중단됐다.
- 원인:
  - `default_boot` Quick Boot 스냅샷은 2026-07-26 14:56 KST에 저장됐고
    해당 스냅샷 화면과 Package Manager 상태에는 Instagram이 없었다.
  - 실제 Instagram 자동화 드라이런 성공은 같은 날 19:43 KST였다.
  - 게시기 시작 옵션은 snapshot save만 막고 snapshot load는 허용했다.
    따라서 2026-07-28 시작 시 14:56 스냅샷이 로드되어 그 뒤 설치·로그인한
    상태가 이전 시점으로 되돌아갔다. 앱 삭제 명령이나 AVD 재생성 기록은
    발견되지 않았다.
  - RAM 바이너리 문자열을 앱 설치 증거로 잘못 판단해 Package Manager
    검증이 코드에 추가되기 전까지 상태 손실을 조기에 차단하지 못했다.
- 조치:
  - 자동 실행 인자에 `-no-snapshot-load -no-snapshot-save`를 함께 적용해
    Quick Boot 상태를 읽거나 저장하지 않도록 했다.
  - 단 하나의 에뮬레이터만 실행 중이어도 AVD 이름이 `Medium_Phone`과
    일치하지 않으면 게시 대상으로 사용하는 fallback을 제거했다.
  - 게시 전에 `pm path com.instagram.android`, AVD 이름, ADB serial을
    검증하고 패키지가 없으면 미디어 선택이나 `Share` 전에 중단한다.
  - `Medium_Phone` 설정도 force cold boot로 변경해 Android Studio에서
    수동 시작해도 오래된 Quick Boot 스냅샷을 복원하지 않도록 했다.
- 검증:
  - 7월 26일 스냅샷 저장 시각과 실제 드라이런 성공 시각의 선후관계를
    상태 파일과 AVD 파일 메타데이터로 교차 확인했다.
  - 두 AVD 모두 `pm path com.instagram.android`가 비어 있음을 확인했다.
  - 중복 조사용 `Medium_Phone_2` 실행을 종료하고 `Medium_Phone`만 남겼다.
  - `Medium_Phone`을 실제 cold boot로 다시 시작해 실행 인자에
    `-no-snapshot-load -no-snapshot-save`가 기록되고 snapshot load 로그가
    생성되지 않는 것을 확인했다.
  - `npm run test:social-reel`: 17개 테스트 통과
  - 실제 게시 사전검증은 AVD·serial을 정확히 선택한 뒤 Package Manager에서
    앱 누락을 `failed-before-share`로 기록하고 공유 전에 중단했다.
- 남은 복구:
  - Instagram을 공식 경로로 다시 설치하고 `korea_swing_social`에 한 번
    로그인해야 오늘 누락 게시와 이후 예약 게시를 재개할 수 있다.
- 관련 파일:
  - `scripts/social-reels/instagram-reel-adb.mjs`
  - `scripts/social-reels/instagram-reel-adb.test.mjs`
  - `docs/social-reel-automation.md`
  - `docs/decisions/2026-07-28-instagram-avd-state-persistence.md`

# 2026-07-26 — 키오스크 홈 광고 하단 UI 정렬

- 상태: 수정 완료, 1080×1920 키오스크 화면 및 프로덕션 빌드 검증 완료
- 현상: 1024px 이상 세로형 키오스크에서 일반 데스크톱 2열 배치가 적용되어 원데이 모집/무료·할인 버튼과 광고 제목의 기준선이 어긋나고, 오늘 일정이 광고 오른쪽에 표시됨. 이미지가 없는 소셜 이벤트 광고는 장소 정보 대신 기본 누락 이미지만 노출됨.
- 원인: 키오스크 전용 레이아웃 안에서도 `.NEB-quickActions`의 데스크톱 `position: fixed` 규칙이 남아 하단 그리드 배치를 벗어남.
- 조치: 키오스크를 모바일과 같은 단일 열 순서로 변경하고 버튼 묶음을 하단 그리드로 되돌려 두 버튼의 폭과 간격을 통일함. 오늘 일정은 전면 광고 하단에 표시함. 이미지가 없는 소셜 광고는 전용 배경 위에 이벤트 제목·날짜·시간·장소를 표시하도록 대체 화면을 추가함. 키오스크 내 이미지는 드래그되지 않도록 제한함.
- 관련 파일: `src/styles/kiosk-mode.css`, `src/pages/v2/components/NewEventsBanner.tsx`, `src/pages/v2/components/NewEventsBanner.css`

## 후속 수정

- 소셜 상세 화면은 포스터 미등록뿐 아니라 등록된 포스터 URL이 모두 로딩 실패한 경우에도 주소가 있으면 카카오맵 장소 화면으로 전환하도록 보완함.
- 키오스크 오늘 일정에 모바일과 같은 카드형 목록 스타일, 고정 높이 내부 스크롤, 위치 표시 스크롤바를 적용함. 키오스크 폭이 모바일 미디어쿼리를 벗어나 내부 스타일이 누락되던 문제를 수정함.
- 후속 확인에서 키오스크 전용 오늘 일정 패널을 220px로 확대한 값이 광고와 하단 영역의 기존 비율을 바꾸는 문제가 확인되어, 모바일과 같은 152px 패널·105px 목록 높이로 복원함. 광고와 버튼 배열은 유지하고 오늘 일정 목록만 내부 스크롤되도록 제한함.
- 키오스크 캘린더에서도 모바일 셀 배치를 강제하고 날짜 헤더를 일반 흐름에 배치함. 연속 일정이 없는 셀에서 절대 배치된 날짜와 첫 이벤트가 겹치던 문제를 수정함.
- 일반 데스크톱 캘린더는 날짜 아래 기본 여백을 모든 주에 적용하고, 한 주의 일부 날짜에만 연속 일정 막대가 있어도 그 주 전체 셀이 동일한 막대 높이를 예약하도록 수정함. 연속 일정이 없는 토·일 카드가 날짜와 겹치거나 다른 요일보다 위로 올라오던 문제를 해결함.
- 관련 파일: `src/pages/v2/components/EventDetailModal.tsx`, `src/pages/calendar/components/FullEventCalendar.tsx`, `src/pages/calendar/styles/FullEventCalendar.css`

## 2026-07-26 휴무·졸공 과거 재수집 백테스트

- 상태: 백테스트 완료, 운영 저장 미적용
- 목적: 기존 저장자료가 아니라 현재 `swing-daily` 수집 대상을 다시 방문해 과거 휴무·졸업공연을 실제로 발견할 수 있는지 검증함.
- 조치: 운영의 미래 일정 규칙과 분리된 읽기 전용 백테스트 모드를 추가했다. 최대 180일(실행 인자로 조정 가능) 과거 날짜, 휴무·취소·쉬어감·졸업공연 문구, 게시 시각 기준 상대 요일을 판별하며 결과는 로컬 JSON 보고서에만 기록한다.
- 오탐 방지:
  - `6/6 취소, 6/13 정상`처럼 한 본문에 여러 날짜가 있을 때 휴무 표현과 가장 가까운 명시 날짜만 선택한다.
  - `이번 주 금요일`은 게시 시각과 서울 시간대를 기준으로 날짜를 계산한다.
  - 여러 달 휴무는 임의의 하루에 연결하지 않고 월 단위 기간으로 보존한다.
  - Instagram 추천 게시물이 다른 계정 소스에 섞이면 작성자 계정을 대조해 제외한다.
  - 미래 졸업공연을 과거 강습 시작일에 잘못 연결하지 않는다.
- 실제 재수집 확인:
  - 네오스윙: 2026-07-17 금햅 휴무
  - 피에스타: 2026-06-06 발보아 소셜 취소
  - 봉천살롱: 2026년 7~8월 서울 발보아 클럽 휴무 기간
  - 스윙타운: 2026-06-27 졸업파티
  - 스윙스캔들: 2026-07-04 졸업파티
- 검증: 선택한 현재 Instagram·Naver Cafe·Daum Cafe 대상에 재실행했으며 접근 실패 0건, 운영 API/DB 쓰기 0건을 확인했다. `npm run test:ingestion` 통과.
- 관련 파일: `scripts/ingestion/swing-daily-native.mjs`, `scripts/ingestion/run-swing-exception-backtest.mjs`

## 2026-07-26 정규 소셜 미래 일정 공백

- 상태: 수정 및 운영 적용 준비 완료
- 현상: 실제로 매주 운영되는 정규 소셜도 날짜가 명시된 DJ 공지가 아직 나오지 않으면 미래 캘린더에서 사라졌다.
- 원인: 기존 수집 정책은 이미지와 날짜가 있는 개별 포스트만 저장하며, 반복 운영 규칙을 미래 개별 일정으로 구체화하지 않았다.
- 조치: 공식 공지에서 반복성이 확인된 소셜 15개 규칙을 오늘부터 90일간 개별 일정으로 생성하는 롤링 조정기를 추가했다. 실제 DJ·졸공 소셜이 같은 날짜와 장소에 등록되면 기본 일정을 제거하며, 휴무·취소 후보가 있으면 해당 날짜를 억제한다.
- 범위 제한: 정규 소셜만 적용한다. 강습·워크숍·파티·기타 행사는 기존 수집 흐름을 유지한다.
- 검증: 운영 데이터 읽기 전용 미리보기에서 15개 규칙, 생성 대상 190건, 이미지 누락 0건을 확인했다. 조정기 단위 테스트 3건, 수집 표준 테스트, Cafe24 프로덕션 빌드가 통과했다.
- 관련 파일: `server/cafe24/regular-social-rules.js`, `server/cafe24/regular-social-reconciler.js`, `scripts/run-cafe24-cron-notifications.mjs`

## 2026-07-26 외부 API 정규 소셜 반복·예외 지원

- 상태: 배포 완료
- 배경: 기존 외부 API는 모든 장르의 날짜별 개별 일정만 지원해, 매주 반복되는 정규 소셜도 매 날짜를 다시 전송해야 했다.
- 조치: `social` 권한 API Key에 한해 반복 규칙과 날짜별 `closure`·`override` 예외 API를 추가했다. DJ 확정은 해당 날짜의 override만 전송하고, 졸공·별도 행사는 기존 개별 일정 API를 유지한다.
- 데이터 우선순위: 공식 개별 일정 → 공식 날짜별 예외 → 수집 변동 → 공식 반복 규칙 → 내부 기본 규칙.
- 안전장치: 기존 파트너 인증, 소유권, 테스트 모드, 호출 제한과 요청 로그를 동일하게 적용한다. 규칙 삭제·비활성화 및 예외 삭제 시 생성된 미래 일정도 조정한다.
- 배포 점검에서 인증 없는 요청이 인증보다 본문 검증을 먼저 수행해 `400`을 반환하는 순서 문제를 발견했다. 기존 API와 동일하게 인증·호출 제한을 먼저 수행하고 입력을 검증하도록 수정했다.
- 중복 처리: 수집 시 기존 공식 API 일정을 먼저 대조한다. 소셜은 날짜·정규화 장소가 같으면 DJ·제목 차이와 무관하게 공식 일정을 유지하고 수집 후보를 중복 처리한다. 다른 분류는 같은 날 한 장소의 복수 일정을 보존하기 위해 제목 유사도까지 확인한다.
- 입력 순서 보정: 수집본이 먼저 등록된 뒤 공식 API 일정이 들어온 경우에도 캘린더 응답에서 같은 중복 판정을 다시 수행한다. 수집 기록은 감사용으로 보존하고 화면에는 공식 API 일정만 노출한다.
- 기본 이미지 정책: 정규 일정이 과거 회차의 DJ 포스터를 임의로 재사용하던 동작을 제거했다. 확인 전에는 `DJ 미정`, 포스터 없음, 장소 카카오맵을 노출하고 해당 날짜의 공식 API 개별 일정이나 수집본이 있을 때만 대체한다.
- 공개 문서 보완: 등록 예시 최상단에 모든 장르의 날짜별 일정과 정규 소셜 반복 규칙을 구분하는 선택 메뉴를 추가했다. 반복 규칙·DJ 예외·휴무·포스터 회차의 전체 cURL과 우선순위·중복 규칙을 본문 및 OpenAPI에 맞췄다. 데스크톱 목차는 첫 문서 섹션 옆의 기존 위치에서 시작해 스크롤을 따라오고 현재 읽는 섹션을 파란색으로 표시하며, 모바일은 기존 섹션 모달을 유지한다.
- 등록 방식 가독성: `/events`와 `/regular-socials` 카드 위에 하나의 선택 지점에서 두 카드로 나뉘는 분기선을 추가했다. 모바일에서는 가로 스크롤을 유지하기 위해 분기선만 축약한다. 문서 전체에 텍스트 선택을 명시적으로 허용해 제목·본문·표·코드·카드·목차를 마우스로 선택하고 복사할 수 있게 했다.
- 실행 예시 검증: 왼쪽 `/events` 분기는 같은 섹션 상단 대신 실제 요청 예시 앵커로 조금 내려가도록 수정했다. Node.js·PHP·Python·Java 코드를 독립 실행 가능한 형태로 보완하고, 로컬 모의 API에 대한 cURL 포함 5개 실제 요청 테스트를 추가했다. PHP는 공식 PHP 8.3 Docker 환경에서 cURL 확장을 구성해 실행했으며, 모든 예시에서 POST·Bearer 인증·JSON 본문·2xx 응답 처리를 확인했다.
- 검증: 관련 단위 테스트 40개, 수집 표준 테스트, ESLint, Cafe24 프로덕션 빌드가 통과했다. 운영에서 기본 일정 190건을 교체한 뒤 포스터 0건, `DJ 미정` 190건, 지도 주소 190건을 확인했고 재실행 드라이런은 생성 0·삭제 0·유지 190건이었다.
- 관련 파일: `server/cafe24/external-regular-socials-api.js`, `server/cafe24/regular-social-reconciler.js`, `server/cafe24/migrations/2026-07-26-external-regular-socials-api.sql`, `docs/external-event-api.md`

## 2026-07-27 홈 데스크톱 3열 레이아웃 복원

- 상태: 수정 및 데스크톱 화면 검증 완료
- 현상: 데스크톱 홈에서 원데이 모집·무료/할인 버튼이 메인 광고 아래쪽에 고정되어, 기준 레이아웃의 왼쪽 보조 메뉴·가운데 광고·오른쪽 오늘 일정 구조가 무너졌다.
- 원인: 메인 배너와 오늘 일정만 외부 2열 그리드에 배치하고, 보조 버튼은 배너 내부 하단 영역에서 화면 기준 고정 위치를 사용했다.
- 조치: 1200px 이상 일반 데스크톱에서 배너 내부를 왼쪽 보조 메뉴와 가운데 광고의 2열로 나누고, 외부 오늘 일정 열과 합쳐 3열이 되도록 구성했다. 데스크톱 본문과 헤더의 최대 폭을 1060px로 통일하고 좌측 보조 열 146px·가운데 간격 18px·우측 일정 열 360px로 조정했다. 태블릿·모바일·키오스크 규칙은 제외했다.
- 검증: 운영 데이터 프록시를 연결한 1422×800 화면에서 햄버거와 원데이 메뉴 왼쪽이 181.1px, 사용자 썸네일과 오늘 일정 오른쪽이 1241.1px로 일치했다. 활성 광고·`모아보기 + 숫자` 오른쪽은 837.1px로, 활성 광고와 하단 제목의 중심은 720.6px로 일치하는 것을 실측했다.
- 관련 파일: `src/pages/v2/components/NewEventsBanner.tsx`, `src/styles/components/MobileShell.css`

## 2026-07-27 데스크톱 홈 제목 및 캘린더 헤더 정렬 보정

- 상태: 수정 및 로컬 화면 검증 완료
- 현상: 홈 데스크톱에서 광고 아래 제목 요소의 박스는 가운데였지만 실제 글자 정렬이 왼쪽으로 남아 있었다. 캘린더 데스크톱 헤더는 보기 전환 버튼과 오른쪽 버튼 묶음이 달력 영역이 아닌 화면 전체 폭 기준으로 배치되어 가이드 선과 맞지 않고 좁은 화면에서 겹칠 수 있었다.
- 원인: 홈 제목에는 이전 데스크톱 규칙의 `text-align: left`가 더 높은 우선순위로 남아 있었다. 캘린더 헤더는 달력 본문 폭과 별도 그리드를 사용했고 `오늘` 버튼이 보기 전환 버튼 옆에 있어 오른쪽 아이콘 묶음과 독립적으로 움직였다.
- 조치: 일반 데스크톱 홈 제목과 메타 정보를 실제 텍스트까지 가운데 정렬하도록 보정했다. 캘린더 헤더는 달력 본문과 같은 폭의 트랙을 사용해 보기 전환 버튼은 왼쪽, 월 선택은 중앙, `오늘`·번역·알림·검색·프로필 묶음은 오른쪽에 정렬하고, 721~860px 구간에서는 버튼 폭과 간격을 줄이도록 조정했다.
- 검증: 로컬 1422px 화면에서 캘린더 그리드 361.99~1059.97px, 헤더 트랙 361~1061px로 맞았고, 보기 전환 왼쪽 361px·월 선택 중심 711px·오른쪽 버튼 묶음 오른쪽 1061px를 확인했다. 800px 화면에서도 보기 전환 24~204px, 월 선택 306~494px, 오른쪽 버튼 묶음 598.47~776px로 겹침이 없었다. 홈 광고 제목 실제 글자 중심과 제목 박스 중심 오차는 0px였다.
- 후속 수정: 최초 배포 검증이 가로 좌표 중심이라 캘린더 헤더 세로 정렬 문제를 놓쳤다. 데스크톱 캘린더 헤더 트랙을 42px 단일 행으로 고정하고 보기 전환·월 선택·오른쪽 버튼·햄버거를 같은 y축 중심선에 배치했다.
- 관련 파일: `src/layouts/MobileShell.tsx`, `src/styles/components/MobileShell.css`

## 2026-07-27 관리자 콘텐츠 조회수 미집계

- 상태: 해결
- 현상: 관리자가 비공개 문의 게시물을 상세 화면에서 읽어도 조회수가 `0`으로 유지됨.
- 원인: 방문 분석에서 관리자 트래픽을 제외하는 보호 조건이 게시물·이벤트 콘텐츠 조회수에도 적용됐고 서버도 관리자 세션의 조회 기록을 거부함.
- 조치: 방문 분석의 관리자 제외는 유지하되 콘텐츠 조회수는 관리자도 사용자별 최초 1회만 집계하도록 분리함. 같은 관리자가 다시 열거나 새로고침해도 중복 증가하지 않음.
- 관련 파일: `src/hooks/useViewTracking.ts`, `server/cafe24/generic-data-api.js`

## 2026-07-27 데스크탑 캘린더 날짜 숫자 세로 정렬

- 상태: 해결
- 현상: 데스크탑 월간 캘린더의 날짜 머리글에서 작은 요일 표시는 중앙에 맞지만 큰 날짜 숫자는 위아래 중앙에서 벗어나 보였다.
- 원인: 요일은 flex 정렬을 사용하지만 날짜 숫자는 일반 inline 박스를 사용해 글꼴 행간 기준이 서로 달랐다.
- 해결: 날짜 숫자를 1em 높이의 inline-flex 박스로 바꾸고 수직·수평 중앙 및 고정 행간을 적용했다.
- 관련 파일: `src/pages/calendar/styles/FullEventCalendar.css`

## 2026-07-27 오전 이벤트 수집 사후 점검

- 상태: 정상, 운영 수정 불필요
- 점검 범위: 08:00 실행 `20260727_080005_53216`과 09:00 실행 `20260727_090005_61465`의 메타데이터, native collector 출력, Telegram summary, cleanup 기록을 대조함.
- 결과: 두 실행 모두 `swing-daily` native collector가 실행되었고 exit code 0, summary 블록, 전체 소스 처리, `deadlineReached=false`를 확인했다. 신규 저장은 각각 0건이며 스킵은 42건과 29건이었다. 접근 실패와 Instagram 회로 차단은 없었다.
- cleanup: deprecated cleanup은 정책대로 `legacy cleanup retired`로 스킵되었으며 삭제는 0건이었다.
- 검증: 외부·저장소 wrapper의 `bash -n`, `node scripts/test-ingestion-standards.mjs`가 통과했다. 20초 예산의 Telegram/native dry-run도 exit code 0과 summary 블록을 남겼다. dry-run의 `deadlineReached=true`와 잔여 18개 소스는 의도한 짧은 검증 예산에 따른 결과이며 운영 장애가 아니다.
- 남은 위험: Instagram fallback의 작성자 불일치 스킵과 날짜가 명시되지 않은 원데이 공지는 계속 보수적으로 제외된다. Chrome의 updater/new-tab 진단 메시지는 수집 결과에 영향을 주지 않았다.

## 2026-07-27 캘린더 DJ 미정 문구 노출

- 상태: 해결
- 현상: DJ가 확정되지 않은 정규 소셜 일정에 캘린더가 `DJ 미정`을 표시했다.
- 원인: 소셜 캘린더가 `dj_name`과 제목에서 추출한 DJ 값을 실제 이름인지 확인하지 않고 표시했다.
- 조치: DJ 값이 `미정` 또는 `DJ 미정`이면 빈칸으로 처리하고, 실제 이름이 있을 때만 `DJ 이름`을 표시한다.
- 관련 파일: `src/pages/calendar/components/FullEventCalendar.tsx`

## 2026-07-27 무료·할인·정기권 검색 후보 전량 작성자 불일치

- 상태: 해결
- 범위: 10시 무료·정기권 및 11시 할인 혜택 자동수집
- 증상: 검색 결과에서 인스타그램 게시물과 프로필을 발견했지만 무료·할인·정기권 후보가 한 건도 본문 판정 단계로 진행되지 않았다. 과거 게시물의 현재 판매 중 정기권도 같은 이유로 누락됐다.
- 원인: 혜택 검색 소스의 URL은 Google 검색 URL인데, 인스타그램 원문 작성자 검증이 이 URL의 첫 경로인 `search`를 기대 계정명으로 사용했다. 따라서 실제 모든 인스타그램 작성자가 `instagram author mismatch (search)`로 거부됐다.
- 조치: 혜택 검색에서 직접 발견한 게시물은 Google 경로를 작성자 계정명으로 간주하지 않는다. 등록된 인스타그램 프로필 소스와 검색 결과에서 발견한 프로필 소스의 실제 계정명 검증은 그대로 유지한다.
- 검증: 혜택 검색 URL은 기대 작성자 없음, 실제 인스타그램 프로필 URL은 기대 작성자 유지 조건을 자동 테스트에 추가했다.
- 관련 파일: `scripts/ingestion/benefit-search-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`

## 2026-07-27 혜택 탭 부가 경품 오판 및 만료 후보 잔존

- 상태: 해결
- 범위: 관리자 무료·할인·정기권 후보 탭
- 증상: DDP 무료 행사를 제외하면 유료 파티의 무료강습권 경품과 이미 종료된 무료 원데이 강습이 현재 혜택 후보처럼 표시됐다.
- 원인: 무료강습권·무료 음료·주차 등 부가 제공도 행사 자체의 무료 혜택으로 판정했고, 혜택 탭은 날짜가 지난 모든 무료·할인 후보를 계속 표시했다.
- 조치: 행사 참가·입장·관람·수강 자체가 무료인 명시적 표현만 무료 이벤트로 인정한다. 부가 경품·편의 혜택은 제외하고, 과거 후보 예외는 현재 판매 중임이 확인된 정기권·상시 혜택에만 적용한다.
- 검증: 유료 파티의 무료강습권·무료 주차·음료·상담·대관 혜택 거부, DDP의 누구나 무료 유지, 만료 후보 숨김 및 상시 정기권 유지 테스트를 추가했다.
- 후속 조치: 검색엔진이 노출한 2024년 게시물의 연도 없는 월·일을 2026년 미래 일정으로 해석한 재수집 후보 2건을 제외 처리했다. 날짜형 혜택은 게시 후 180일이 지난 원문이면 저장하지 않고, 현재 판매가 본문에서 확인된 상시 정기권만 예외로 허용한다.

## 2026-07-27 정기 할인권 유사 표현 검색 누락

- 상태: 검색어·판정 규칙 개선 및 재수집 검증 완료
- 증상: 이용자가 약 한 달 전 스윙프렌즈 인스타그램에서 본 정기권성 판매 공지를 기존 `정기권` 중심 검색이 찾지 못했다.
- 원인: 검색·판정 어휘가 `정기권`, `시즌권`, `월정액`, `멤버십`에 치우쳐 `정기 할인권`, `다회권`, `N회권`, `월간권`, `시즌패스`, `프리패스`, `티켓북`, 입장권 묶음 같은 표현을 포괄하지 못했다. Google의 최신 Instagram 색인에서도 해당 공식 계정 결과가 반환되지 않았다.
- 조치: 위 유사 표현을 정기권성 혜택으로 판정하고, 일반 다회권 검색과 스윙프렌즈 공식 계정 전용 검색을 추가했다. 부정·종료 표현과 상시 판매 판정에도 같은 어휘를 적용했다.
- 검증: 유사 표현 7종 자동 테스트가 통과했다. 신규 검색 2개 재수집은 정상 종료했으나 Google에서 검증 가능한 Instagram 게시물 링크가 반환되지 않아 신규 후보는 0건이었다. 로그인된 공식 계정의 2026년 5월 말~6월 게시물 36개 캡션도 직접 대조했지만 해당 문구는 확인되지 않았다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/collection-registry.mjs`, `scripts/test-ingestion-standards.mjs`

## 2026-07-27 수동 일정의 무료·할인 노출 선택 부재

- 상태: 해결
- 증상: 사용자가 일정을 직접 등록하거나 수정할 때 무료·할인 이벤트 여부를 명시적으로 선택할 수 없어 혜택 페이지 노출을 제어할 수 없었다.
- 원인: `benefit_eligible`, `benefit_kind` 필드는 자동수집 후보에만 연결되어 있었고 공통 일정 등록 모달에는 입력 UI와 저장 연결이 없었다.
- 조치: 모든 일정 등록 진입점이 공유하는 상세 등록 화면 하단에 `일반`, `무료`, `할인 이벤트` 선택을 추가했다. 무료·할인을 선택한 경우에만 혜택 필드를 저장하고, 일반을 선택하면 혜택 노출을 해제한다. 수정 시 기존 무료·할인 값을 복원하며 혜택 페이지의 종류 라벨도 저장값을 우선 사용한다.
- 검증: Cafe24/MySQL 운영 설정의 프로덕션 빌드와 수집 기준 테스트, diff 검사가 통과했다.
- 관련 파일: `src/components/EventRegistrationModal.tsx`, `src/components/EditableEventDetail.tsx`, `src/styles/components/EditableEventDetail.css`, `src/lib/cafe24Client.ts`, `src/pages/benefit-events/BenefitEventsPage.tsx`
- API 후속 조치: 외부 일정 등록·수정 API에 선택 필드 `benefit_kind`를 추가했다. `free_event`, `discount_event`, `null`만 허용하고 서버가 `benefit_eligible`을 자동 계산한다. API 가이드의 요청 필드표와 서버 예제를 갱신했으며 외부 API 테스트 27개가 통과했다.
- 등록 경로 후속 수정: 최초 조치는 공통 행사·강습 폼에만 적용되어 별도 구현인 소셜 일정과 원데이 모집 링크 등록에는 선택지가 없었다. 공용 혜택 선택 컴포넌트를 분리해 행사·강습, 소셜 일정, 원데이 모집 링크 세 등록 경로에 모두 적용했다. 소셜은 이벤트 혜택 필드를 직접 저장하며, 무료·할인으로 등록한 상시 원데이 모집 링크도 혜택 페이지 데이터에 합쳐 노출한다.

## 2026-07-28 수집 소셜 등록 시 정규일정 대체 지연

- 상태: 해결
- 증상: 실제 DJ 공지를 수집 후보에서 등록해도 같은 날짜의 자동 생성 정규 소셜이 다음 일일 동기화 전까지 함께 남을 수 있었다. 장소가 비어 있고 출처 키워드만 있는 후보는 동기화 후에도 정규일정을 대체하지 못할 수 있었다.
- 원인: 정규일정 대체 판단이 일일 동기화에만 있었고, 장소 또는 요일이 포함된 정규 제목 중심으로만 업장을 비교했다.
- 조치: 수집 등록 API가 날짜와 소셜 분류를 확인한 뒤 장소·제목·출처 키워드로 같은 업장의 자동 정규 소셜을 찾아 즉시 제거한다. 이미 등록된 후보를 재처리하는 경우에도 같은 보정을 수행하며, 관리자에게 대체 건수를 알린다.
- 검증: 출처 키워드만으로 스윙타운 정규 소셜을 찾는 경우와 다른 날짜·다른 업장을 보존하는 경우를 포함한 정규 소셜 테스트 9개 및 프로덕션 빌드가 통과했다.
- 관련 파일: `server/cafe24/function-api.js`, `server/cafe24/regular-social-reconciler.js`, `server/cafe24/regular-social-reconciler.test.js`, `src/pages/admin/v2/components/EventEditModal.tsx`

## 2026-07-28 수집 후보 장소 일관성 실측

- 상태: 수집 규칙 개선 완료
- 범위: 운영 DB의 미래 대기 후보 16건
- 측정: 장소 필드 존재율과 `location`/`venue_name` 일치율은 각각 100%였지만, 14건(87.5%)은 원문 장소 확인값이 아니라 검색 소스명을 그대로 두 필드에 복사한 값이었다. 소셜 후보 14건 중 자동 정규일정과 단일 매칭되는 후보는 9건(64.3%), 복수 정규일정과 모호하게 매칭되는 후보는 0건이었다.
- 발견: `스윙패밀리 강습/행사`, `무료 강습 검색`, `스윙타운` 같은 소스명이 장소로 저장됐다. 2026-07-28을 수요일로 해석한 과거 스윙타임 공지 2건과 강습 모집을 소셜로 분류한 3건도 포함됐다.
- 조치: 장소를 찾지 못했을 때 소스명을 장소로 대입하는 동작을 제거했다. 스윙타운·스윙패밀리 소스의 검증 장소를 `봉천살롱`으로 등록하고, 장소가 본문·소스 레지스트리·소스 별칭 중 어디에서 결정됐는지 `venue_provenance`로 기록한다. 날짜와 명시 요일이 다른 후보 및 모집·강습을 소셜로 분류한 후보는 저장 전에 거부한다.
- 재측정: 개선된 검증 규칙을 기존 16건에 재적용했을 때 오분류·날짜 불일치 5건(31.3%)이 자동 거부 대상으로 식별됐다. 기존 운영 후보는 읽기 전용으로 측정했으며 자동 수정하지 않았다.
- 검증: 수집 표준 테스트, 정규 소셜 테스트 9개, 프로덕션 빌드 및 diff 검사를 수행한다.
- 관련 파일: `scripts/ingestion/audit-ingestor-consistency.mjs`, `scripts/ingestion/collection-registry.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/ingestion/candidate-utils.mjs`, `scripts/test-ingestion-standards.mjs`
- 운영 상태 후속 수정: 스윙패밀리는 현재 운영되지 않는다는 사용자 확인에 따라 자동수집·발견용 소스와 원데이 모집 링크에서 제거했다. 과거 스윙패밀리 메뉴·카페·Linktree 및 후보 식별자는 운영 종료 소스로 차단한다. 봉천살롱 장소 매핑은 현재 운영 중인 스윙타운 소스에만 유지한다.
- 장소 역할 후속 수정: `스윙스캔들`은 장소가 아닌 집단명이다. 스윙스캔들 수집 소스의 검증 장소를 `사보이볼룸`으로 분리하고 `사보이`, `사보이홀`, `사보이볼룸(사당)` 표기를 `사보이볼룸`으로 정규화한다.
- 승인 후보 전수조사 후속 수정: 승인 완료 150건 중 URL+날짜로 운영 일정과 직접 연결되는 후보는 84건(56%)이었다. 연결된 후보의 제목 94%, 장소 89.3%, 분류 86.9%, DJ 94%가 유지됐다. 상세 시간은 사이트 수집·조회 대상이 아니므로 평가에서 제외했다. 여러 장소를 쓰는 스윙팝·올어바웃스윙·골든스윙에는 소스 단일 장소 기본값을 강제하지 않고 원문 장소만 사용한다. 플랫폼·게시판 소제목은 후보 제목으로 거부하며, 후보는 실제 일정 저장 성공 후에만 승인 완료 처리하고 `registered_event_id`를 영구 기록한다.
- 자동등록 준비도 후속 조치: 수정 확률은 제목 6.0%, 장소 10.7%, 분류 13.1%, DJ 6.0%로 측정됐다. 이 수정 패턴을 저장 전 검증 규칙으로 반영하고, 시간 정보는 조건에서 제외했다. 승인 이력이 충분한 스윙스캔들·경성홀만 `shadow` 대상으로 지정하되 이미지·검증 장소·구체적 제목·분류가 모두 필요하고 소셜은 DJ가 있어야 준비 완료로 판정한다. 실제 자동등록은 아직 수행하지 않으며 후보에 준비 여부와 차단 이유만 기록한다.
- shadow 범위 후속 확대: 네오스윙과 쏘셜클럽도 실제 자동등록 없이 준비도만 측정하는 대상으로 추가했다. 검증 장소는 각각 `해피홀`, `소셜클럽`이며 나머지 후보 단위 필수조건은 동일하다.
- shadow 범위 2차 확대 및 재검토: 스윙타운, 스윙프렌즈 공식 카페·인스타, 스위티스윙도 준비도 측정 대상으로 추가했다. 재검토 결과 스윙프렌즈는 `스윙타임` 외 `해피홀`, `243` 사용 이력이 확인돼 단체별 고정 장소를 자동 대입하는 방식은 오등록 위험이 있었다. 세 단체 모두 소스 기본 장소를 제거하고 원문 본문·포스터에서 실제 장소가 명시된 후보만 shadow 준비 완료로 판정한다. 실제 자동등록은 계속 비활성 상태다.
- 쏘셜클럽 수요일 수집원 재검토: 기존 `@sosyalclub_swing`은 반복 접근 불가였고 실제 수요 정규 소셜 원본이 아니었다. 공식 홈페이지가 연결한 `@thesocialcluba`를 `Balboa in Social Club`의 주 수집원으로 교체하고 우선순위를 높였다. `socialclubseoul.co.kr` 일정 페이지는 날짜·DJ·신청 링크 대조 경로로 사용하며, 스윙피크닉은 별도 비정기 행사이므로 정규 수요일 수집원에서 분리했다.
- 쏘셜클럽 재수집 검증 후속: 공식 Instagram 최신 8개 시험 수집에서 수요 소셜 외 `8/10·8/17` 다이나믹발보아 강습과 게시일로 추정되는 `7/28`이 후보화됐다. 실제 저장은 중단하고 해당 소스에 `Balboa in Social Club` 계열 제목, 소셜 분류, 수요일 날짜를 모두 요구하도록 제한했다. 이미지와 DJ까지 있는 후보만 자동등록 shadow 준비 완료가 된다.
- 운영 후보 확인 후속: `2026-07-29` 중복 후보의 DJ가 `Mungun Application link`로 붙은 상태에서도 과거 shadow 준비 완료로 기록된 것을 확인했다. 후보는 `duplicate`, `is_collected=false`라 일정 등록에는 반영되지 않았다. DJ 추출 시 영문 `Application/Registration link`와 한글 신청·입금 안내 앞에서 값을 자르고, 기존처럼 안내 문구가 섞인 DJ는 검증 및 자동등록 준비 판정에서 거부한다.
- 자동등록 가능성 전수 재측정: 승인 후보를 운영 일정과 다시 연결해 소스별 완전 무수정률을 산출했다. 연결 표본 기준 스윙타운 66.7%(16/24), 네오 33.3%(1/3), 경성홀 12.5%(2/16), 스윙프렌즈 0%(0/23), 스윙스캔들 0%(0/10)였다. 과거 스윙스캔들 장소명 보정과 여러 소스의 DJ 공란·정제 차이가 낮은 수치의 주원인이며, 시간은 평가에서 제외했다. 미래 대기 후보 13건 중 현 규칙상 shadow 준비 완료는 0건으로 오등록은 차단됐다. 경성홀에서 반복된 `🎉 파티`처럼 내용 없는 단독 제목도 저장 전 거부하도록 추가했다.
- 자동등록 확률 비교식·분류 후속 개선: 운영 일정은 DJ를 별도 필드가 아니라 제목의 `DJ … |` 접두부에 저장하므로 이를 DJ 없음으로 계산하던 감사 오류를 수정했다. 재측정 완전 무수정률은 스윙프렌즈 87.0%, 경성홀 87.5%, 스윙타운 79.2%로 정정됐다. 스윙스캔들의 과거 10%는 집단명을 장소로 저장했던 이전 오류이며 현재는 사보이볼룸으로 보정된다. 실제 잔여 오류인 `경성 클래스 : 소셜을 더 즐기기 위한 1시간`의 소셜 오분류를 막고, `85F 스칼라 루비`, `호두 2026...` 같은 DJ 장식·날짜를 정제한다. 네오는 표본과 분류 정확도가 부족해 자동 전환 대상에서 계속 제외한다.
- 95% 선행 게이트: 실제 자동등록 실행 경로 작업은 철회하고 모든 대상 소스를 `shadow`로 유지했다. 과거 승인 150건 중 운영 일정과 연결 가능한 표본은 85건이며, 원본 그대로 무수정 일치는 60건(70.6%)이다. 현재 규칙의 좁은 안전 활동군은 17/17(100%)이지만 전체 연결 표본 커버리지는 20%에 불과하므로 95% 달성으로 보지 않는다. 감사 도구의 통과 조건을 `안전군 정확도 95% 이상`과 `연결 표본 커버리지 95% 이상`을 동시에 만족하도록 수정했다. 실제 일정 자동 생성은 계속 비활성 상태이며 시간 정보는 수집·평가하지 않는다.
- 과거 85건 원인 재학습: 불일치 25건을 전부 펼쳐 재검토하고 정기권 판매, 주년 행사, 클래스·원데이 모집을 기존 명시 분류보다 제목의 강한 증거로 먼저 보정하도록 바꿨다. 게시물 전체의 부가 판매·신청 문구가 정상 소셜을 덮어쓰지 않도록 제목 우선으로 제한했다. 여러 날짜와 여러 DJ가 한 후보에 합쳐지는 소셜은 날짜별 후보 분리 전에는 거부하며, 여러 Daum 카페를 호스트명만으로 첫 소스에 잘못 귀속하던 매칭도 차단했다. 현재 규칙 전체 재생 무수정 일치는 71/85(83.5%)로 상승했지만 95%에는 아직 미달하므로 자동등록은 비활성 상태를 유지한다.
- 과거 표본 2차 안정화: 과거 승인 일정의 분류값을 무조건 정답으로 취급하지 않고 제목에 `정기권`, `주년 파티`, 명시적 클래스·모집·소셜이 있는 경우 현재 의미 규칙을 기준으로 재검증하도록 감사식을 보강했다. 복수 장소 행사는 후보와 등록 일정의 장소 집합이 하나 이상 일치하면 유지로 판정하고 `Big Apple/빅애플`, `Savoy/사보이볼룸` 표기를 정규화했다. 현재 규칙 전체 재생은 76/85(89.4%), 현재 검증을 통과한 표본은 32/35(91.4%)다. 남은 불일치 9건 중 캡션 조각 제목, 잘못 섞인 DJ, 다중 날짜 미분리, 운영 종료 스윙패밀리 후보는 현재 규칙이 차단한다. 95% 정확도와 95% 커버리지 동시 조건은 아직 미달이므로 실제 자동등록은 계속 비활성 상태다.
- 신규 수집 교차검증: 네오·스윙타운·스윙프렌즈·스위티·소셜클럽·스윙스캔들·경성홀 7개 원본을 저장 없는 dry-run으로 다시 수집했다. 네오의 `7/5~8/16 6주 과정, 8/23 졸업파티` 일정 문구를 8/16 단일 행사 제목으로 오인한 신규 위험을 발견해 날짜 범위·주기만 적힌 캡션 조각 제목을 차단했고, 재수집에서 네오 신규 후보 0건·위험 후보 안전 차단을 확인했다.
- 전체 승인 데이터 재검토 정정: 앞선 42/42(100%) 수치는 과거 스윙타운 후보의 `스윙패밀리 강습/행사`, `스윙타운` 같은 소스·단체명을 실제 명시 장소로 인정한 오류가 있어 철회한다. 운영 후보 150건 전체를 다시 조사했고 엄격 연결 85건, 링크 1~3·제목·날짜·장소·DJ 보조 연결 후 88건만 실제 일정과 연결됐다. 나머지 62건은 과거 등록 API가 일정 저장 성공 전에 후보를 `collected`로 표시한 고아 이력일 가능성이 높아 성공 표본으로 세지 않는다. 현재 규칙 재생 무수정 일치는 연결 88건 중 63건(71.6%), 검증 통과 표본은 36/53(67.9%)다. 안전하게 유지할 수 있는 기존 shadow 소셜군은 경성홀 7건과 스윙스캔들 9건으로 16/16(100%)이지만, 전체 승인 연결률은 58.7%, shadow 활동군 커버리지는 69.6%이므로 95% 게이트는 미달이다. 스윙타운·스윙프렌즈 shadow 확대는 철회하고 실제 자동등록은 비활성 상태로 유지한다.
- 반복 감사 후속: 후보와 등록 일정을 등록 ID→URL/날짜→엄격 유사도 순서로 한 일정당 후보 하나만 연결하도록 바꿨다. 제목 중간의 `DJ 이름` 형식과 이벤트 링크 1~3을 모두 읽도록 보강한 최종 보수 연결은 150건 중 87건(58.0%)이다. 관리자의 `일괄 완료 처리`가 등록 일정 없이 `collected=true`를 저장할 수 있었던 재발 경로를 차단하고, 실제 `registered_event_id`가 있는 후보만 완료 처리할 수 있게 서버와 UI를 수정했다.
- 신규 원문 진단 후속: 경성홀·스윙스캔들 원문을 고한도 dry-run 진단 모드로 다시 수집했을 때 경성홀 주간 게시물의 7/25·7/26·7/28 DJ를 한 7/28 후보에 합치고 클래스 문장 제목을 사용하면서도 자동등록 준비 완료로 판정하는 오류를 발견했다. 여러 날짜·여러 DJ 미분리와 `activity_type=social`인데 `event_type/category=class`인 충돌을 저장 전에 차단했다. 수정 후 같은 원문 재수집은 신규 0건·29건 안전 차단이었다. 단순 규칙만으로 혼합 게시물을 안정 분리하기 어렵다고 판단해, 향후 자동등록에는 원문 근거만 허용하는 AI 구조화 판정과 결정적 규칙 재검증을 함께 요구한다.

## 2026-07-28 키오스크 사전 부팅 복구

- 상태: 수정 및 운영 검증 진행
- 현상: 운영 서버와 `/kiosk` 정적 자산은 정상이어도 미니PC Chrome이 오래된 서비스워커 자산을 잡고 있으면 애플리케이션이 시작되기 전에 빈 화면으로 멈출 수 있다.
- 원인: 기존 서비스워커·Cache Storage 정리는 React의 `KioskModeController`가 렌더링된 뒤 실행되어, 오래된 번들 자체가 로드되지 않는 장애에는 도달할 수 없었다.
- 조치: `index.html`의 애플리케이션 번들보다 앞에서 키오스크 경로의 서비스워커 등록과 Cache Storage를 정리하고, 기존 서비스워커가 현재 페이지를 제어 중인 경우 한 번만 캐시 무효화 URL로 재진입한다. 저장소나 정리 API 실패 시에는 정상 부팅을 계속한다.
- 검증: 운영 `/kiosk`의 현재 서버·자산 응답과 새 브라우저 렌더링을 확인하고, 프로덕션 빌드 후 캐시 제어 상태를 재검증한다.

## 2026-07-28 미니PC 키오스크 원격 접속·기동 복구

- 상태: 해결
- 현상: 같은 내부망의 미니PC `kiosk-j@172.30.1.13`은 응답하고 SSH 22번 포트도 열려 있었지만, 현재 관리 키가 승인되지 않아 키오스크를 원격 재시작할 수 없었다.
- 원인: 2026-06-15 작업은 비밀번호 인증으로 접속한 뒤 당시 임시 공개 키를 등록했으며, 현재 보관된 미니PC 관리 키는 이후 생성되어 미니PC의 `authorized_keys`에 없었다. 내부망 연결 여부와 SSH 인증은 별개이므로 같은 회선만으로는 접속할 수 없었다.
- 조치: 과거 세션 기록의 인증 절차를 비밀정보가 출력되지 않도록 복구해 접속하고, 현재 전용 관리 공개 키를 등록했다. `kiosk-display.service`와 `kiosk-chrome.service`를 재시작하고 자동 시작을 활성화했으며 중복 Chrome 탭을 한 개로 정리했다.
- 안정성: Chrome 서비스는 `Restart=always`, 자동 시작 `enabled`, 사용자 세션 linger `yes` 상태다. `/kiosk` 진입은 키오스크 모드 플래그를 저장한 뒤 `/`로 이동하도록 설계되어 최종 탭 URL이 `/`인 것은 정상이다.
- 검증: 현재 관리 개인 키의 비대화형 SSH 인증 성공, Chrome·화면 서비스 `active`, 자동 시작 `enabled`, 운영 `/kiosk` HTTP 200, Chrome 원격 디버깅 탭 1개를 확인했다.
## 2026-07-28 — 수집 후보가 실제 일정으로 자동등록되지 않음

- 상태: 수정 완료, 배포 전
- 현상: 수집기가 `auto_registration.ready=true`를 계산해도 후보 저장 API만 호출하여 실제 일정 등록은 관리자의 수동 등록 버튼에 의존했다.
- 원인: 수집 토큰은 `/api/scraped-events` 저장만 허용했고 `/api/ingestor-register-event`는 관리자 세션만 허용했다. 두 API를 잇는 안전한 서버 검증 경로가 없었다.
- 해결: 수집기가 후보를 먼저 저장한 뒤 준비 완료 후보에 한해 자동등록 API를 호출하도록 연결했다. 서버는 저장된 후보를 다시 읽고 허용 출처/활동, 정확한 날짜, 장소, DJ, 이미지, 대기 상태, 시간 필드 부재를 독립 검증한다. 성공 시에만 일정 ID를 연결하고 완료 처리한다.
- 현재 허용 범위: `kyungsunghall/social`, `swingscandal-cafe/social`. 그 밖의 출처와 중복·제외·완료 후보는 자동등록하지 않는다.
- 검증: 자동등록 허용/차단 테스트 통과, 수집 표준 검사 통과, 프로덕션 빌드 통과.
- 관련 파일: `scripts/ingestion/swing-daily-native.mjs`, `server/cafe24/function-api.js`, `server/cafe24/ingestor-registration-link.test.js`, `docs/decisions/2026-07-28-ingestion-automatic-registration.md`

### AI 이중 판정 보강

- 수집 후 등록 후보 분류 단계에 구조화 출력 AI 판정기를 추가했다.
- AI는 외부 검색 없이 저장 대상 원문만 보고 날짜, 활동, 장소, DJ, 원문 근거를 반환한다.
- 자동등록은 기존 규칙과 AI가 전부 합의하고 AI 신뢰도 0.95 이상이며 근거가 원문에 실제 존재할 때만 허용한다.
- 실제 모델 시험에서 명확한 `2026-07-29 경성홀 소셜 DJ 뉴야` 표본은 승인되었고, 여러 날짜와 DJ 및 강습 문구가 혼합된 표본은 검토 대상으로 차단되었다.
- 모델 호출 실패 시 자동등록은 닫히고 후보 저장만 계속하는 실패 안전 방식이다.
- 후속 재검토에서 자동등록 임계값을 0.98로 상향했다. 또한 원문에 존재하는 임의 근거 한 줄만으로 통과하지 못하도록, AI 근거 안에 후보 날짜·장소·각 DJ·소셜 유형이 모두 명시되어야 하는 필드별 근거 검증을 수집기와 서버 양쪽에 추가했다.
- 자동등록 범위 재확정: 경성홀·스윙스캔들·네오·The Social Club·스윙타운·스윙프렌드만 서버 허용 목록에 둔다. 스위티스윙은 명시적으로 제외했다. 소셜뿐 아니라 허용된 강습·행사·판매 유형도 각 유형을 나타내는 원문 문구가 AI 근거에 반드시 있어야 하며, The Social Club 수요일 제한과 스윙타운·스윙프렌드 실제 장소 명시 조건을 서버에서 재검증한다. 표준·AI·서버 테스트를 10회 반복해 모두 같은 결과로 통과했다.
- 당일 운영 후보 AI 실전 검증: 2026-07-28 운영 DB에 당일 생성된 후보는 The Social Club 1건이었다. 실제 저장 원문을 AI 판정기에 그대로 입력한 결과 신뢰도 0.99에서도 `register`가 아닌 `review`가 반환됐다. 원문에 `7월 29일`과 `July 28, 2026`이 함께 있고 수집 DJ가 `Mungun Application link`로 오염돼 있어 날짜·장소 표기·DJ가 수집값과 완전히 합의하지 않았기 때문이다. 현재 결정 규칙도 DJ 오염으로 준비 실패, 서버도 AI 미승인·중복 상태로 등록 거부하여 실제 일정은 생성되지 않았다.
- The Social Club 원문 재수집 개선: 실제 Instagram 게시물을 로그인 세션으로 다시 확인했다. 한국어 본문은 `7월 29일(매주 수요일)`, `쏘셜클럽`, `D J : 멍군`으로 일관되지만 뒤의 영문 번역에 `July 28, 2026` 오기가 있었다. 이 공식 계정의 완결된 한국어 첫 구간을 일정 근거로 선택하고 영문 번역·신청 마감 구간을 제외하도록 변경했다. `D J`처럼 띄어 쓴 표기와 `사전신청` 경계를 인식해 DJ를 `멍군`으로 정제하고, `쏘셜클럽`/`소셜클럽`은 같은 장소로 검증한다. 수정 후 실제 소스 dry-run은 `2026-07-29 / 소셜클럽 / DJ 멍군` 1건만 생성했고 AI는 0.99로 승인했다. AI 승인된 실제 게시물이 자동 생성 정규 소셜과 중복될 때는 중복 후보를 안전하게 다시 열어 실제 게시물 일정으로 대체할 수 있도록 서버 경로도 보강했다.
## 2026-07-28 Android 키오스크 USB 디버깅 승인 모달

- 상태: 연결 주체 차단 및 복구 완료, TV 디버깅 포트 비활성화는 후속 과제
- 현상: Android 키오스크 화면에 USB 디버깅 허용(RSA 승인) 모달이 표시됐다.
- 원인: 미니PC `172.30.1.13`에는 ADB가 설치되어 있지 않고 ADB/scrcpy 프로세스도 없었다. 관리 Mac의 ADB 서버가 Android 키오스크 `172.30.1.28:5555`에 연결된 상태였으며 장치는 `unauthorized`로 응답해 승인 모달을 표시했다.
- 조치: 관리 Mac에서 `172.30.1.28:5555` 연결을 명시적으로 끊고 ADB 서버를 종료했다. launchd에 ADB/scrcpy 자동 재연결 항목이 없고 미니PC에도 연결 주체가 없음을 확인했다. 이미 떠 있던 모달은 Android TV Remote v2를 6자리 코드로 페어링한 뒤 `BACK` 키를 두 번 전송해 제거했다. TV 앱이 HDMI 입력 `com.google.android.tv.inputplayer`로 복귀했고 현장에서 모달 제거를 확인했다.
- 잔여 위험: Android 키오스크의 TCP 5555 포트는 아직 열려 있다. 승인되지 않은 상태에서는 원격 명령으로 기기 설정을 변경할 수 없으므로, 모달의 절대 재발 방지는 기기 설정에서 무선/USB 디버깅을 끄거나 기존 승인 관리 키로 포트를 닫아야 한다.
- 보안 원칙: 이 키오스크는 운영 중 ADB를 사용하지 않는다. 유지보수가 필요하면 현장에서 일시적으로만 활성화하고 작업 후 즉시 비활성화한다.
- 재발 방지 확인: 관리 Mac의 ADB 서버는 종료 상태이고 ADB/scrcpy 자동실행 launchd 항목이 없으며, Mini PC에도 ADB가 없다. 운영 문서에서 `adb connect` 안내를 제거했다. TCP 5555가 열린 현재 상태에서 제3의 ADB 클라이언트가 새로 접속하면 모달이 다시 뜰 가능성은 남으므로, 절대적 차단은 TV 설정에서 디버깅을 끈 뒤 완료된다.
- 재발 대응: Mini PC Chrome/HDMI를 재시작하지 말고 ADB 연결 주체부터 종료한 다음, 저장된 Android TV Remote v2 인증으로 `BACK`을 두 번 보낸다. 실제 화면 확인 전에는 해결로 보고하지 않는다.

## 2026-07-29 키오스크 외부 링크 안내가 관리자·일반 데스크톱에 노출됨

- 상태: 해결
- 현상: 관리자 수집 화면에서 외부 원문을 열 때 키오스크 전용 QR 안내창이 표시됐고, `/kiosk`를 사용한 적이 있는 일반 데스크톱의 다른 탭에도 키오스크 동작이 이어졌다.
- 원인: `/kiosk` 진입 상태를 origin 전체가 공유하는 `localStorage`에 영구 저장했고, 관리자 경로와 관리자 인증 상태를 키오스크 활성 조건에서 제외하지 않았다.
- 조치: 키오스크 상태를 전용 탭의 `sessionStorage`에만 저장하고 기존 `localStorage` 값은 활성 조건에서 제거했다. `/admin` 계열 경로와 인증된 관리자 상태에서는 키오스크 컨트롤러 및 외부 링크 안내를 즉시 비활성화하고 해당 탭의 키오스크 상태를 정리한다.
- 검증: 레거시 영구 플래그 무시, 키오스크 진입·탭 세션 유지, 관리자 경로·관리자 인증에서 안내창 미표시, 실제 키오스크 탭에서 안내창 유지 조건을 자동 테스트로 추가했다.
- 관련 파일: `src/lib/kioskMode.ts`, `src/components/KioskModeController.tsx`, `src/layouts/MobileShell.tsx`, `src/components/LoginModal.tsx`, `src/utils/analyticsGuards.ts`, `src/lib/kioskMode.test.ts`, `src/components/KioskModeController.test.tsx`

## 2026-07-30 스윙스캔들 목요 소셜 자동등록 누락

- 상태: 해결
- 현상: 공식 카페에 `2026.07.30 스윙스캔들 목요소셜 DJ` 공지가 있었지만 운영 일정은 자동 생성 정규 소셜의 `DJ 미정` 상태로 남았다.
- 원인 1: 2026-07-29 수집은 해당 공지를 후보 `7cd2d516eace25d8`로 만들었으나, 원문 텍스트에 장소가 없고 장소 표기는 포스터 이미지의 `SAVOY BALLROOM BAR`에만 있었다. AI 판정 입력에는 포스터 OCR이 포함되지 않아 레지스트리 장소 `사보이볼룸`의 원문 근거를 확인하지 못했고 신뢰도 0.98 게이트를 통과하지 못했다. AI 미승인 후보는 기존 자동 생성 정규 소셜 중복을 다시 열 수 없어 실제 일정으로 대체되지 않았다.
- 원인 2: 2026-07-30 08:00 재수집은 당일 후보에 미래 시작 시간이 원문 텍스트로 명시되어야 한다는 검증을 적용했다. 실제 포스터에는 `19:30 - 23:00`이 있었지만 텍스트 추출에는 포함되지 않아 `same-day event has no future time or is already past`로 후보 생성 전에 탈락했다. 이는 달력이 날짜만 수집·조회하며 시간 필드를 자동등록에서 금지하는 운영 정책과 충돌한다.
- 확인: 공식 카페 게시글 `102575`의 1080×1350 원본 포스터에서 `DJ 테일`, `SAVOY BALLROOM BAR`, `19:30 - 23:00`을 확인했다. 2026-07-30 예약 실행은 08시·09시·10시·11시 모두 종료 코드 0으로 완료됐으므로 예약 실행 실패나 원본 부재가 원인은 아니다.
- 운영 영향: `regular-social:scandal-thu:2026-07-30`이 `사보이볼룸`, `DJ 미정`으로 유지됐다. 같은 실행의 AI 장소 불일치 후보 `307fd103055f64a3`은 2026-08-01 토요 소셜이므로 7월 30일 누락과 구분한다.
- 조치: 당일 포함 미래 여부를 날짜만으로 판단하고 수집 후보의 시간 필드를 제거했다. 검증된 단일 장소 공식 소스는 레지스트리 장소를 AI·서버의 제한된 장소 근거로 공유하되, 복수 장소 소스의 명시 장소 정책은 유지한다.
- 사전 검증: 수집 표준 검사, AI·서버 자동등록 테스트 17개, 프로덕션 Cafe24 빌드가 통과했다. 수정 수집기는 7월 30일 후보 `7cd2d516eace25d8`을 다시 생성하고 로컬 AI 0.98 게이트를 통과했으며, 배포 전 서버가 이전 근거 규칙으로 422를 반환하는 것까지 재현했다.
- 1차 운영 반영 후속: 서버 배포와 재수집으로 7월 30일·8월 1일 후보가 자동등록됐지만, 네이버 카페 작성자 등급·닉네임 `57F 밍밍`이 DJ명 앞에 붙은 것을 운영 조회에서 발견했다. `숫자F + 닉네임` 접두어를 DJ에서 제거하고, 동일 원본 URL·날짜·등록 일정 ID를 가진 AI 검증 완료 후보만 기존 일정을 안전하게 갱신하도록 보정했다.
- 최종 운영 검증: 실행 `20260730_142624_64804`에서 후보 `7cd2d516eace25d8`, `307fd103055f64a3`이 모두 AI·서버 검증을 통과해 기존 일정 ID를 중복 없이 갱신했다. 운영 조회 결과 2026-07-30은 `DJ 테일 | 스윙스캔들 목요소셜`, 2026-08-01은 `DJ 째 | 스윙스캔들 토요소셜`, 장소는 모두 `사보이볼룸`, 시간은 모두 `null`이다.
- 장소 정책 후속 정정: 사용자 확인에 따라 스윙타운의 고정 장소를 `봉천살롱`, 스윙프렌즈 공식 카페·Instagram의 기본 장소를 `스윙타임`으로 등록했다. 스윙프렌즈 토요일 해피홀 일정처럼 원문에 다른 장소가 명시된 경우에는 해당 장소를 별도 일정으로 우선한다. 단체명 자체를 장소로 쓰는 후보와 레지스트리 고정 장소가 불일치하는 후보는 AI·서버에서 거부한다.
- 구형 완료 이력 복구: 실제 재수집에서 스윙타운 후보 `9aaa6987183f9147`은 과거 일정이 `스윙타운` 장소로 잘못 등록됐지만 후보에 `registered_event_id`가 없어 안전 갱신 대상에서 빠졌다. 등록 ID가 없는 구형 완료 후보도 원본 URL과 날짜가 정확히 같은 운영 일정이 단 하나이고 새 후보가 현재 AI·서버 검증을 전부 통과하는 경우에 한해 다시 열어 연결·정정한다. 운영 자동등록은 기존 시간값도 `null`로 정리한다.
- 고정 장소 운영 검증: 실행 `20260730_143007_66073`에서 스윙프렌즈 8월 23일 워크숍이 `스윙타임`, 시간 `null`로 자동등록됐다. 구형 복구 배포 뒤 실행 `20260730_143424_67522`에서 스윙타운 후보 `9aaa6987183f9147`이 기존 일정 `9830dffe-c12c-4337-98a4-b4b634994e77`을 중복 없이 갱신했고, 운영 조회 결과 장소 `봉천살롱`, 시간 `null`, DJ `사복`이다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/ingestion/ai-candidate-adjudicator.mjs`, `server/cafe24/function-api.js`

## 2026-07-30 경성홀 8월 1일 주간 소셜 분리·자동등록 누락

- 상태: 해결 및 운영 자동등록 완료
- 현상: 경성홀 공식 Instagram 주간 게시물의 `2026-08-01 DJ 북실` 소셜이 날짜별로 분리되지 않았고 자동 생성 정규 소셜을 대체하지 못했다.
- 원인: 같은 게시물에 `8/1 DJ 북실`, `8/2 DJ 메이저`, `8/4 DJ 스톰`과 별도의 `8/4 경성 클래스` 안내가 함께 있었다. 수집기가 날짜별 DJ 일정 분리보다 게시물 전체 활동 분류를 먼저 수행해 클래스 문구를 게시물 전체 분류로 사용했고, 하나의 `8/1 강습` 후보에 DJ 세 명을 합쳤다. 경성홀 자동등록은 소셜만 허용하므로 결정 규칙 단계에서 탈락해 AI 검증도 실행되지 않았다.
- 조치: 두 날짜 이상에서 날짜와 DJ가 모두 완결된 주간 일정은 게시물 전체 분류보다 날짜별 소셜 분리를 우선한다. 각 후보는 해당 날짜·DJ 근거 구간만 AI 2차 판정에 전달하되 저장되는 원문은 전체 게시물을 유지한다. 공통 구간에 서로 다른 요금이 함께 있으면 특정 날짜 요금으로 임의 배정하지 않는다. 날짜·DJ가 하나라도 불완전하면 기존처럼 자동등록하지 않는다.
- 건식 검증: 실행 `20260730_152516_74698`에서 8월 1일 북실, 8월 2일 메이저, 8월 4일 스톰의 소셜 후보 3건이 각각 생성됐고 모두 결정 규칙 `ready=true`였다. 시간 필드는 생성되지 않았고, 여러 요금이 섞인 8월 4일 후보에도 잘못된 요금이 붙지 않았다.
- 운영 검증: 실행 `20260730_152900_75780`에서 후보 `b776b8e769a4f726`, `d7d497e0fbc83331`, `fb116eab9f5bd118`이 모두 AI 0.98 및 서버 재검증을 통과해 자동등록됐다. 운영 API는 각각 `DJ 북실 | 경성홀 토요 소셜`, `DJ 메이저 | 경성홀 일요 소셜`, `DJ 스톰 | 경성홀 화요 소셜`을 반환하며 장소는 `경성홀`, 시간은 모두 `null`이다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`

## 2026-07-30 네오 7월 31일 소셜·8월 2일 휴무 혼합 공지 누락

- 상태: 해결 및 운영 반영 완료
- 현상: 네오스윙 공식 Instagram의 7월 5주차 공지에 `7/31 금햅 DJ 호두`가 있었지만 실제 수집 일정으로 등록되지 않았고, 같은 게시물에서 휴무로 공지한 8월 2일 정규 일요 소셜은 운영 일정에 남아 있었다.
- 원인: 게시물에 정상 소셜과 다른 날짜의 휴무 문구가 함께 있으면 수집기가 휴무 문구를 먼저 감지하고 게시물 전체를 조기 종료했다. 일반 다중 날짜·DJ 파서를 단순 적용하면 포스터 OCR 순서 때문에 `호두`와 프로그램명 `스윙베이비 [프랑]`을 뒤바꾸고 휴무인 8월 2일까지 소셜 후보로 만드는 위험도 확인됐다.
- 조치: 네오 위클리 공지는 `금햅/일햅 DJ` 문구를 실제 해당 요일 날짜와 직접 연결한다. 프로그램명은 DJ로 사용하지 않고, 날짜 구간에 `쉬어갑니다`가 명시된 날짜는 소셜 후보에서 제외해 별도 `closure` 예외로 저장한다. 정상 소셜과 휴무 예외가 섞인 게시물은 두 결과를 동시에 보존하며, 후보별 날짜·DJ·해피홀 근거만 AI 2차 판정에 전달한다.
- 검증: 확장 dry-run `20260730_174930_95468`에서 `2026-07-31 / 네오스윙 금요 소셜 / DJ 호두 / 해피홀` 한 건만 생성되고 자동등록 사전판정 `ready=true`를 확인했다. 휴무 날짜와 DJ가 뒤바뀌었던 중간 결과는 운영 저장 전에 폐기했다.
- 운영 검증: 실행 `20260730_175407_96644`에서 7월 31일 후보 `dcff91528478274d`이 AI 0.98 및 서버 검증을 통과해 자동등록됐고, 8월 2일 휴무 예외도 저장됐다. 정규 소셜 재조정 실행 `4d187810-467a-4749-8d2d-fd46041bdf48`이 휴무 날짜의 자동 생성 일정 1건을 제거했다. 운영 API에는 `DJ 호두 | 네오스윙 금요 소셜`, 장소 `해피홀`, 시간 `null`만 남고 8월 2일 네오 일요 소셜은 노출되지 않는다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`

## 2026-08-01 08:00·09:00 수집 예약 실행 누락

- 상태: 원인 확인, 코드 수정 없음
- 현상: 08:00 priority1과 09:00 priority2 LaunchAgent 실행 뒤 생성돼야 할 `.meta`, `.jsonl`, `.last.txt`가 없었고 공용 로그도 2026-07-30 17:54 이후 갱신되지 않았다.
- 원인: Mac은 2026-07-31 06:40에 부팅됐지만 사용자 Aqua 세션 로그인은 2026-08-01 15:02였다. 두 작업은 사용자 GUI 세션의 LaunchAgent라 예약 시각에 로드되지 않았고, 로그인 후 `launchctl print`에서도 각각 `runs = 0`, `last exit code = (never exited)`였다. 래퍼 실패나 timeout, summary 누락이 아니라 실행 자체가 시작되지 않은 경우다.
- 직전 정상 실행: `20260730_175407_96644`는 `swing-daily` 네이티브 수집기를 실행해 exit 0으로 끝났고 결과 JSON과 Telegram summary 블록을 모두 남겼다. deprecated 수집 흐름은 사용하지 않았다.
- 검증: 설치·저장소 양쪽 `run-ingestion.sh`의 `bash -n`, `node scripts/test-ingestion-standards.mjs`가 통과했다. `TELEGRAM_DRY_RUN=1`, `INGESTION_NATIVE_DRY_RUN=1`, cleanup skip, 120초 예산으로 실행한 `20260801_150448_1929`도 네이티브 결과 JSON과 summary를 남기고 exit 0으로 종료했다. 제한에 사용한 소스 ID는 현재 실행 목록과 일치하지 않아 실제 조회 대상은 0개였으며 저장은 발생하지 않았다.
- 잔여 위험: 사용자가 예약 시각 전에 로그인하지 않은 날에는 GUI LaunchAgent가 실행되지 않는다. 이를 보완하려면 로그인 시 catch-up 실행 여부와 같은 운영 정책 결정이 필요하며, 중복·예정 외 실행 위험 때문에 이번 점검에서는 `RunAtLoad`를 임의 추가하지 않았다.

## 2026-08-02 스윙타임 일요 소셜 수집·자동등록 누락

- 상태: 수정 및 실제 게시물 재검증 완료
- 현상: 스윙타임 공식 Instagram의 7월 30일 게시물에 8월 2일 일요 소셜과 DJ 훔머가 명시됐지만 수집 후보와 자동등록 일정이 생성되지 않았다.
- 원인: 같은 게시물의 8월 1일 스위티스윙 26주년 파티 문구가 게시물 전체 활동 분류를 행사로 선점했다. 날짜별 DJ 구간을 한 건만 찾으면 소셜 분리를 우선하지 않았고, `8월 1,2일` 묶음 날짜 표기는 분리 뒤에도 복수 날짜 오류로 다시 차단됐다. 실제 1053×1317 Instagram 이미지 URL의 크롭 파라미터도 저화질 이미지로 잘못 판정됐다. `swingtimebar`는 자동등록 출처 목록에도 없었다.
- 조치: 완결된 날짜/DJ 대응이 한 건이어도 해당 구간을 소셜로 우선 분리한다. 묶음 날짜 머리글과 해당 요일/DJ 구간만 후보 증거로 보존해 다른 날짜의 파티·강습 문구를 배제한다. 스윙타임 공식 계정을 고정 장소 `스윙타임`, 자동등록 활동 `social`로 등록했다. 소셜은 미래 날짜와 DJ가 명확하고 AI 0.98 및 서버 검증을 통과하면 이미지 없이도 자동등록하며 시간 필드는 계속 금지한다.
- 검증: 실제 게시물 `DbbCeEdGhIO` 재수집 실행 `20260802_133435_34812`에서 `2026-08-02 / 스윙타임 일요 소셜 / DJ 훔머 / ready=true` 후보 1건이 생성됐다. 시간 필드는 없고 이미지 원본은 1053×1317이었다. 같은 날짜별 증거로 AI 판정은 `register`, 신뢰도 0.99, 결정 검증 오류 0건이었다. 수집 표준 검사와 AI·서버·정규 일정 회귀 테스트 32개가 통과했다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/ingestion/ai-candidate-adjudicator.mjs`, `scripts/ingestion/collection-registry.mjs`, `server/cafe24/function-api.js`

## 2026-08-03 과거 혜택 오수집·정기권 누락 및 연속 일정 과밀 표시

- 상태: 수정·운영 후보 정리 및 배포 완료
- 현상: 2024년 Instagram 게시물과 2026년 5월의 이미 지난 단일 무료 행사가 연도 없는 날짜를 미래 연도로 보정받아 신규 후보로 저장됐다. 반대로 과거 사용 기간이 적힌 정기권 판매 글은 날짜가 지났다는 이유로 단일 행사처럼 탈락했고, 혜택 검색도 Instagram 주소만 추출해 검색 결과에 노출된 다음카페 원문을 확인하지 못했다. 모바일 월간 캘린더는 연속 일정 띠 아래 여백과 날짜별 카드가 함께 누적돼 과밀한 주의 세로 길이가 과도하게 늘어났다.
- 원인: 날짜 없는 검색 결과와 원문 게시 연도를 교차검증하지 않고 지난 월을 다음 해로 넘겼으며, 정기권의 상품 수명과 단일 행사의 개최일을 같은 기준으로 검사했다. 정기권 후보 ID에도 검사 날짜를 포함해 같은 상품을 다시 수집할 여지가 있었다. 월간 캘린더는 모바일 날짜별 표시 개수 상한이 없었다.
- 조치: 날짜형 혜택은 원문 게시일의 연도에 맞춰 날짜를 결정하고 게시 연도도 확인할 수 없으면 저장하지 않는다. 정기권·다회권·월간권·티켓북 등은 명시적 판매 종료가 없는 한 상품형 혜택으로 분류하고 원본 URL과 `season-pass` 고정 식별자로 중복 제거한다. `출빠 정기권` 검색에서 Daum·Naver·Facebook 실제 문서 주소도 추출하도록 확장했다. 모바일 캘린더는 날짜별 카드 5개까지만 우선 표시하고 나머지는 `더보기`로 열며, 연속 일정 띠 아래 여백을 줄였다. 홈 왼쪽 바로가기 문구는 `원데이&동호회`로 변경했다.
- 운영 정리: 잘못 저장된 후보 `61e1831bff66e17c`, `9f2deb757358f14f`와 연결된 수집 이미지를 API로 삭제했다. 스윙타임빠 정기권은 검색 결과 주소가 아닌 실제 원문 `https://m.cafe.daum.net/sweetyswing/5lqO/1732`을 사용해 `season_pass` 대기 후보 `9882ac19190cfc4c`로 등록했다. 운영 DB에서 두 오수집 ID가 없고 새 후보의 원문 URL과 혜택 종류가 일치함을 확인했다.
- 검증: `node scripts/test-ingestion-standards.mjs`, 관련 수집기 구문 검사, `npm run build:only`가 통과했다.
- 관련 파일: `scripts/ingestion/benefit-search-utils.mjs`, `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/collection-registry.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`, `src/pages/calendar/components/FullEventCalendar.tsx`, `src/pages/calendar/styles/FullEventCalendar.css`, `src/pages/v2/components/NewEventsBanner.tsx`, `src/pages/v2/components/NewEventsBanner.css`

### 정기권 최신 검색 누락 후속

- 상태: 로컬 수정 및 무저장 수집 검증 완료, 배포 전
- 현상: Google에서 `스윙타임 정기권`을 직접 검색하면 7·8·9월 정기권 다음카페 글이 보이지만, 자동수집은 과거 4·5월 정기권을 후보로 사용하고 최신 글을 안정적으로 발견하지 못했다. 관리자 폼도 `판매이벤트` 선택 시 대분류를 `파티/행사`로 강제해 `소셜 + 판매이벤트` 조합을 유지하지 못했다.
- 원인: 혜택 수집이 관련도순 결과의 제한된 링크만 검사했고, 여러 정기권 검색축이 Instagram으로 제한돼 있었다. 검색 결과의 Instagram 프로필을 카페 원문보다 먼저 확장해 시간 예산을 소모했으며, 사용 종료일이 명시된 정기권도 판매 종료 문구가 없으면 상시 상품으로 간주했다. Google 비정상 트래픽 차단도 접근 실패가 아니라 수집 대상 없음으로 기록됐다.
- 조치: 모든 혜택 검색에서 Google 최신순을 먼저 조회하고 관련도순을 교차 병합한다. 한국어·한국 지역 결과를 사용하고, 등록된 실제 장소에서 `장소명 + 정기권` 검색 소스를 자동 생성하며, 스윙바 정기권 검색의 Instagram 제한을 제거했다. 카페·블로그 원문을 Instagram 프로필 확장보다 먼저 검사하고, 명시된 이용 기간 종료일이 오늘 이전이면 만료 후보로 거부한다. Google 차단은 즉시 해당 엔진 재시도를 중단하고 접근 실패로 보고한다. 관리자 분류에서는 판매 여부와 소셜/행사 대분류를 독립 선택하도록 강제 전환을 제거했다.
- 검증: `node scripts/test-ingestion-standards.mjs`, 수집기 구문 검사, `npm run build:only`가 통과했다. 무저장 `스윙타임 정기권` 실행에서 검색 결과 원문 `https://m.cafe.daum.net/sweetyswing/5lqO/1759`가 과거 원문보다 먼저 발견됐고 후보 1건 생성 경로를 확인했다. 이후 Google이 비정상 트래픽을 반환한 실행에서는 같은 상태가 `접근불가`로 명시됐으며 운영 API/DB 쓰기는 없었다.
- 관련 파일: `scripts/ingestion/benefit-search-utils.mjs`, `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/collection-registry.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`, `src/pages/admin/v2/components/EventEditModal.tsx`

### 혜택 검색과 자동등록 경계 후속

- 상태: 수정·회귀 검증 및 배포 완료
- 현상: 혜택 검색 소스 자체는 수동 검수 정책이지만, 검색 결과가 자동등록 허용 공식 계정의 원문 URL이면 후보 판정이 검색 경로를 잃고 공식 계정 정책을 상속할 수 있었다. 무료·할인·정기권 검색 다수에도 Instagram 한정 검색어가 남아 카페·블로그 원문 발견 범위가 불균일했다.
- 원인: 후보에는 실제 원문 URL만 남고 해당 원문을 직접 순회했는지 검색으로 발견했는지 나타내는 발견 출처가 없었다. 자동등록 준비 판정은 실제 원문 URL로 레지스트리를 다시 찾아 정책을 결정했다.
- 조치: 모든 후보에 `source_id`, `discovery_source_id`, `discovery_source_type`을 보존한다. `benefit_search`로 발견한 후보는 실제 원문이 자동등록 허용 계정이어도 수집기와 서버 양쪽에서 자동등록을 거부하고 검수 대기로만 저장한다. 혜택 검색어는 생성 단계에서 Instagram `site:` 제한을 제거해 무료·할인·정기권 22개 검색축이 최신순·관련도순 및 카페·블로그 원문을 공통으로 확인한다. 한 검색 결과 원문 접근 실패가 다음 결과 검사를 중단하지 않도록 대상별 실패를 격리하고, Google 차단 시 Bing 결과가 있어도 Naver 최신순·관련도순을 함께 병합한다. 스위티스윙 `타임빠 통신`의 게시판 내부 `정기권` 검색을 수동 검수 전용 직접 소스로 추가해 검색엔진 색인에 의존하지 않는다. 혜택 종류는 `free_event`, `discount_event`, `season_pass`로 독립 분류하되 같은 `scraped_events` 검수 큐와 승인된 `events` 저장소를 사용한다. `sale` 활동과 대분류도 분리해 소셜 입장 정기권은 `category=social + activity_type=sale`을 유지한다. 쇼핑의 `shops`·`featured_items`는 소유권과 상품 등록 흐름이 다른 별도 데이터이므로 자동 생성·복제하지 않는다.
- 검증: 수집 표준 검사에서 혜택 검색 22개가 모두 Instagram 비한정이며 무료 6개, 할인 4개, 정기권 12개로 분리됨을 확인했다. 공식 스윙프렌즈 원문이더라도 혜택 검색으로 발견된 후보는 수집기 준비 판정과 서버 자동등록 재검증 양쪽에서 차단되는 회귀 테스트를 추가했다. Google 차단 상태의 무저장 검색 실행은 발견 원문 5개를 모두 검사해 첫 실패 뒤 중단하지 않음을 확인했다. 게시판 직접 무저장 실행은 `2026-06-30 / 스윙타임빠 수요일 타임빠 정기권(7,8,9월) / category=social / activity_type=sale / season_pass / auto-registration=false` 후보 1건을 생성했으며 운영 DB 쓰기는 없었다. 서버 자동등록 테스트 14개가 통과했다.
- 관련 파일: `scripts/ingestion/collection-registry.mjs`, `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`, `server/cafe24/function-api.js`, `server/cafe24/ingestor-registration-link.test.js`

### 혜택 후보 AI 보조 판정 누락 후속

- 상태: 수정·실제 AI 검증·운영 검수 후보 저장 및 배포 완료
- 현상: 기존 AI 판정 호출이 `auto_registration.ready=true` 후보에만 실행돼, 안전상 수동 검수로 고정한 `benefit_search`와 정기권 직접 수집 후보에는 AI가 전혀 개입하지 않았다.
- 원인: AI의 원문 재검증과 자동등록 권한이 하나의 조건으로 결합돼 있었다. 기존 AI 스키마도 날짜·활동·장소·DJ 자동등록 검증용이라 혜택 종류, 이용 기간, 현재 유효성, 판매 활동과 대분류의 독립성을 판단하지 않았다.
- 조치: 혜택 후보 전용 AI 검토 스키마와 판정기를 추가했다. AI는 원문만 사용해 `free_event`, `discount_event`, `season_pass`, 현재 유효성, 종료일, 제목, 장소, `category`, `activity_type`을 독립 판정하고 정확한 원문 근거를 반환한다. 고신뢰·원문 근거가 있는 명백한 거절 후보만 저장 전에 제외하며, 불일치·애매함·AI 오류는 후보를 없애지 않고 `AI 재검토` 또는 `AI 오류`로 관리자 검수에 남긴다. AI 확인 후보도 검색 발견 정책상 자동등록하지 않는다. 관리자 수집 목록에는 `AI 확인`, `AI 재검토`, `AI 오류` 상태를 표시하고 근거 사유를 툴팁으로 제공한다.
- 검증: 스위티스윙 정기권 직접 소스를 무저장·AI 활성화로 실행해 `season_pass`, `category=social`, `activity_type=sale`, `active_on_today=true`, 종료일 `2026-09-30`, 신뢰도 `0.99`, 원문 근거 3개로 `AI 확인`된 후보 1건을 확인했다. 후보의 자동등록 상태는 계속 `ready=false`였고 운영 API/DB 쓰기는 없었다. 혜택 AI 승인·만료 거절·분류 불일치 재검토 테스트를 포함한 AI/서버 테스트 27개가 통과했다.
- 운영 수집 화면 검증: 무저장 시험만으로 수집 화면 반영을 확인했다고 볼 수 없었던 점을 정정했다. 실행 `20260804_000658_77339`을 실제 저장 모드로 수행해 후보 `ef5c493f33ba3b77` 1건을 운영 `scraped_events`에 저장했다. 운영 DB 읽기 전용 조회에서 `is_collected=false`, `benefit_eligible=true`, `benefit_kind=season_pass`, `category=social`, `activity_type=sale`, `benefit_lifecycle=evergreen`, `ongoing_sale=true`, 혜택 AI `approved/0.99`, 자동등록 정보 없음으로 확인했다. 현재 운영 서버의 `free` 탭 필터는 `season_pass`를 포함하고, 지난 작성일이어도 `evergreen + ongoing_sale` 혜택은 숨기지 않으므로 이 후보가 무료·할인·정기권 검수 탭 조건을 통과함을 운영 배포 코드와 대조했다. 관리자 로그인 세션이 없는 별도 브라우저에서는 목록 GET이 차단되어 화면 DOM 자체는 확인하지 못했다.
- 혼합 게시물 분리 후속: 같은 원문에는 `7월 2일 수 소셜/DJ 훔머`, 스트리밍 안내, `7·8·9월 정기권`이 함께 있었다. 수집기가 정기권 소스 이름과 글 전체를 한 후보에 사용해 소셜과 판매 중 하나만 남기거나 소셜을 정기권으로 오염시키던 문제를 수정했다. 글머리표 블록을 먼저 분리해 날짜·DJ 소셜과 정기권 판매를 독립 후보로 만들고, 정기권 블록에는 다른 소셜의 DJ·스트리밍·이미지를 상속하지 않는다. 이미지 없는 정기권도 원문 판매 근거가 있으면 검수 후보로 허용한다. `INGESTION_TEST_TODAY=2026-06-30`인 무저장 실제 원문 시험은 소셜 후보 `30738a38e83bab41`과 정기권 후보 `ef5c493f33ba3b77` 두 건을 생성했고 자동등록은 둘 다 차단했다. 오늘 `2026-08-04` 기준으로는 지난 소셜을 제외하고 유효한 정기권만 유지한다. 운영 갱신 실행 `20260804_002144_79212` 및 이미지 정리 실행 `20260804_002303_79439`에서 정기권 후보의 본문은 정기권 블록 307자만 남았고 `훔머=false`, `스트리밍 서비스=false`, `poster_url=''`, AI `approved/0.99`, 종료일 `2026-09-30`, 자동등록 `false`를 운영 DB에서 확인했다.
- 혜택 전용 소스 범위 정정: 정기권·무료 혜택을 찾기 위한 소스에서는 같은 글이나 검색 결과에 함께 노출된 일반 유료 소셜을 수집하지 않는다. 날짜별 소셜 후보 자체의 제한된 근거에서 요청한 혜택 종류가 확인될 때만 저장하고, 이웃한 정기권 블록의 문구를 일반 소셜이 상속하지 못하게 했다. 실제 스위티스윙 원문 무저장 실행 `20260804_113622_90153`에서 일반 목요·일요 소셜 2건은 `no confirmed season_pass benefit`으로 제외되고 정기권 후보 `ef5c493f33ba3b77` 한 건만 유지됐다. 과거 잘못 저장된 일반 소셜 후보 `e87a84553a70b0bc`, `3d708f4e5672d4bb`와 무료 혜택이 확인되지 않은 검색 후보 `09a1309fc567531c`는 공식 수집 API를 통해 삭제했으며 운영 DB에는 세 ID가 남지 않았다.
- 운영 배포: 관련 변경 커밋 `c3250dac`를 `origin/main`에 푸시하고 Cafe24에 배포했다. 서비스는 `active`, 외부 헬스는 `ok`, 공개 버전은 `2026-08-04T02:57:13.493Z`(`buildTime=1785812229618`)다. 운영 일정 API에서 8월 4일 안토니와 8월 8일 파인 일정만 확인되고 대응하는 스윙타운 자동 생성 정규 소셜 ID는 남지 않았다.
- 관련 파일: `scripts/ingestion/ai-benefit-review.schema.json`, `scripts/ingestion/ai-candidate-adjudicator.mjs`, `scripts/ingestion/ai-candidate-adjudicator.test.js`, `scripts/ingestion/swing-daily-native.mjs`, `src/pages/admin/v2/EventIngestorV2.tsx`, `src/pages/admin/v2/EventIngestorV2.css`

### 스윙타운 8월 4일 DJ 안토니 정규 소셜 교체 누락

- 상태: 수정 및 운영 교체 완료
- 현상: 스윙타운 공식 공지에서 2026-08-04 DJ 안토니와 2026-08-08 DJ 파인을 수집했지만 자동 생성된 `DJ 미정` 정규 소셜을 교체하지 못했다.
- 원인: 네이버 카페 본문의 작성자 문맥이 DJ명 뒤에 반복돼 `안토니 스윙타운 DJ 안토니 20`, `파인 스윙타운 DJ 파인 20`이 각각 두 번째 DJ처럼 저장됐다. 복수·불일치 DJ 안전 게이트가 후보 자동등록을 차단했다.
- 조치: `이름 + 스윙타운 DJ + 같은 이름 + 시간 조각` 형태의 반복 문맥을 단일 DJ명으로 축약하고 일반 DJ 표기는 유지했다.
- 검증: 무저장 실행 `20260804_113355_89926`에서 두 후보 모두 DJ가 각각 `안토니`, `파인` 한 명이고 `ready=true`였다. 실제 실행 `20260804_113651_90292`에서 후보 `5f351f76b591752b`, `7e4b03a07f5fa490`이 자동등록됐다. 운영 일정은 8월 4일 `DJ 안토니 | 스윙타운 DJ 안토니`(`8c021244-74ef-40c7-a12c-a6b0d2906ac8`), 8월 8일 `DJ 파인 | 스윙타운 DJ 파인`(`e4559a0a-8780-437a-b833-5e1fcac5993e`)만 남고 해당 날짜의 `regular-social:swingtown-*` 일정은 제거됐다.
- 관련 파일: `scripts/ingestion/candidate-utils.mjs`, `scripts/ingestion/swing-daily-native.mjs`, `scripts/test-ingestion-standards.mjs`

### 이미지 없는 혜택 등록 및 목록 깨진 이미지 후속

- 상태: 수정·회귀 검증 및 운영 배포 완료
- 현상: 무료·할인 혜택을 일반 일정 등록창에서 저장할 때 이미지가 무조건 필수였고, 이미지 없이 등록된 정기권은 혜택 목록 카드에서 깨진 이미지 아이콘으로 표시됐다.
- 원인: 일반 일정과 혜택 일정이 같은 이미지 필수 검증을 사용했다. 혜택 목록은 실제 이미지가 없는 일정에도 공통 기본 썸네일 URL을 반환했는데, 코드 경로 `/uploads/images/default-thumbnails`와 실제 정적 파일 경로 `/default-thumbnails`도 서로 달랐다.
- 조치: `free_event`, `discount_event`, `season_pass`는 이미지 없이 등록할 수 있도록 이미지 필수 검증에서 제외했다. 혜택 목록은 실제 저장 이미지가 있을 때만 `<img>`를 만들며, 이미지가 없거나 로드에 실패하면 가짜 이미지·아이콘·빈 미디어 영역을 만들지 않고 본문이 해당 공간을 사용한다. 공통 기본 썸네일 경로도 실제 배포 경로로 바로잡았다.
- 검증: 이미지 필수 정책, 혜택 이미지 선택, 무이미지 카드 및 이미지 로드 실패 전환 테스트 6개가 통과했다. `npm run build`가 성공했고 빌드 결과에 `/default-thumbnails/default_thumbnail.webp`가 포함됨을 확인했다.
- 운영 배포: 변경 커밋 `e1b6a3e3`을 `origin/main`에 푸시하고 Cafe24에 배포했다. 운영 API에서 정기권 `0e803bac-f59f-40c0-8e01-23165a976e80`의 모든 이미지 필드가 `null`임을 확인했고, 공개 번들에는 `has-no-image` 분기가 있으며 빈 이미지 자리표시자 클래스는 없다. 서비스는 `active`, 내부·외부 헬스는 모두 `ok`, 공개 버전은 `2026-08-04T06:59:21.509Z`다.
- 관련 파일: `src/components/EventRegistrationModal.tsx`, `src/lib/eventRegistrationRules.ts`, `src/pages/benefit-events/BenefitEventsPage.tsx`, `src/utils/getEventThumbnail.ts`

### 캘린더 날짜·소셜 뱃지 세로 간격 후속

- 현상: 모바일에서 스크롤 고정 날짜줄과 소셜 섹션의 돌출 뱃지가 2px까지 가까워졌고, 소셜이 없는 일반 이벤트도 날짜와의 간격 규칙이 별도로 관리됐다.
- 원인: 날짜 헤더, 기간 일정 띠, 소셜 뱃지의 돌출 높이, 주간 행 간격이 서로 다른 하드코딩 값으로 배치됐다. 오늘 주 자동 스크롤도 일정 본문을 고정 날짜줄 경계에 여백 없이 맞췄다.
- 조치: 최소 세로 간격 3px, 날짜-콘텐츠 간격, 소셜 뱃지 돌출 높이를 레이아웃 변수로 분리했다. 소셜 섹션은 돌출 뱃지 전체 높이와 안전 간격을 문서 흐름에서 예약한다. 모바일 자동 스크롤 기준점에는 고정 날짜줄과 콘텐츠 사이의 실제 3px 여백을 반영하고, 키오스크에도 같은 규칙을 적용했다.
- 검증: 390px 모바일 브라우저 실측에서 고정 날짜 원형 뱃지-첫 콘텐츠 7px, 고정 날짜줄 경계-첫 콘텐츠 3px, 셀 내부 날짜-첫 콘텐츠 3px, 기간 띠-본문 6px, 모든 주간 행 간격 3px를 확인했다. 1024px 데스크톱에서도 날짜-첫 콘텐츠와 주간 행 간격의 최솟값이 각각 3px였다.
- 운영 반영: 커밋 `283a57bd`를 `origin/main`에 푸시하고 Cafe24에 배포했다. 공개·내부 헬스 체크가 모두 `ok`였고 서비스는 `active`, 운영 버전은 `2026-08-03T09:00:38.707Z`다.
- 관련 파일: `src/pages/calendar/page.tsx`, `src/pages/calendar/styles/FullEventCalendar.css`

## 2026-08-03 알림 미발송·빈 알림함 및 사용자별 읽음 상태 부재

- 상태: 로컬 수정 및 회귀 검증 완료, 배포 전
- 현상: 관리자가 오늘 일정과 새 등록 알림을 모두 선택하고 유효한 FCM 구독 2개를 보유했지만 단말 알림이 오지 않았고 우측 상단 종에도 수신 내역이 없었다. 자유게시판의 숫자 배지와 `NEW` 표시는 글을 읽어도 계속 남았다.
- 운영 확인: `notification_queue`에는 129건이 있었고 최근 대기 5건도 처리되지 않았다. `user_notifications`는 전 사용자 0건이었으며 서버에는 알림 cron 파일이 설치되지 않았다. 관리자 구독 행의 `pref_today_digest`, `pref_new_event_alerts` 및 세부 대상 선택은 모두 활성 상태여서 사용자 설정 누락이 원인이 아니었다.
- 원인: 업로드된 cron 호출 스크립트를 실제 스케줄러에 설치하지 않아 큐 소비자가 없었다. 새 이벤트 알림은 단말 구독 행에 붙은 설정만 보고 푸시를 시도했으며 인앱 알림함에는 저장하지 않았다. 자유게시판 배지는 사용자 읽음 기록 없이 최근 14일 글을 전부 세었다. 앱 포커스·일반 이동에서 운영체제 알림을 일괄 제거하는 동작도 읽음 의미를 훼손했다. 관리자 전용 대상도 관리자 계정이 아니라 관리자 단말 구독 행에서 역산해, 단말이 없는 관리자는 인앱 알림함에서 제외되는 결합 오류가 있었다.
- 조치: 사용자 알림 설정과 기기별 Web Push 구독을 분리하고, 사용자 설정을 정규 테이블에 저장·기존 구독에서 이관한다. 새 이벤트는 푸시 신청 여부와 무관하게 모든 로그인 사용자의 인앱 알림함에 사용자별 미확인 항목으로 저장하고, 아직 종료되지 않은 이벤트만 종의 배지와 목록에 표시한다. 푸시 신청자에게만 선택한 소셜·강습·동호회 조건으로 모든 보유 기기에 전송한다. 큐는 결정적 ID, 24시간 Push TTL, Topic, 성공 기기 기록, 제한 재시도와 지수 백오프를 사용하며 오래된 Push는 보내지 않되 이전 방문 뒤 등록된 미확인 이벤트는 인앱 알림함에 보존한다.
- 읽음 규칙: 종을 열면 현재 사용자에게 표시된 항목만 읽음 처리되어 다음 열기부터 사라진다. 운영체제 알림을 탭하면 해당 한 건만 사용자별 서버 읽음 상태와 로컬 기록에 반영한다. 앱 실행·포커스·일반 클릭은 알림을 지우지 않는다. 자유게시판은 `user_id + post_id` 읽음 키로 관리해 숫자 배지와 `NEW`를 같은 사용자에게만 제거하며 직접 링크 진입도 읽음으로 기록한다.
- 운영 작업 준비: 1분 주기의 `flock` cron, 알림 설정·자유게시판 읽음 마이그레이션, 기존 구독 설정 이관 스크립트를 배포 흐름에 포함했다. 아직 배포하지 않았으므로 운영 cron과 신규 테이블은 변경되지 않았다.
- 관리자 안전 검증: 운영 정보를 읽기 전용으로 확인해 관리자 계정 2명, 한 관리자 소유 FCM 단말 2대, 모든 관련 알림 선택 활성 상태를 확인했다. 실제 운영 단말이나 일반 사용자에게 시험 알림은 보내지 않았다. 이 형태를 익명화한 격리 테스트와 장르 4종 × 전체 알림 2상태 × 세부 선택 2상태 × 단말 0~3대의 64개 조합을 실행했다. 1차에서 단말 0대인 16개 조합이 실패해 위 관리자 계정/단말 결합 문제를 발견했고, 관리자 ID를 `users.is_admin`에서 직접 읽도록 수정한 뒤 64개를 처음부터 재실행해 전부 통과했다. 운영 형태 회귀에서는 관리자 2명 모두 인앱 대상, 해당 관리자 단말 2대만 Push 대상, 일반 사용자는 인앱·Push 모두 0건임을 확인했다.
- 전체 구독 운영 확인: 운영에는 단말 구독 38개, 구독 사용자 37명, 그중 비관리자 36명이 있었다. 명시적으로 `오늘 일정` 또는 `새 이벤트` 상위 스위치를 켠 사용자는 관리자 1명뿐이고, 나머지 36명은 상위 선택값이 없는 구형 구독이다. 알림함 저장은 전 사용자 0건이고 신규 사용자 설정 테이블과 cron은 아직 없으므로 관리자만의 문제가 아니라 전체 자동 전달 구조가 미배포·미작동 상태다. 큐의 `sent` 표시는 121건이지만 성공 단말 수, 대상 수, 처리 시각과 결과가 모두 비어 있어 실제 수신 성공 증거로 사용할 수 없다. 대기 5건과 실패 3건이 남아 있다.
- 방문 경계 후속: 종 알림함의 “이전 방문 이후 등록” 조건이 24시간을 넘긴 오래된 큐에만 적용되던 문제를 추가로 발견했다. 모든 큐에서 등록 시각과 사용자 마지막 방문 시각을 비교하도록 수정했고, 등록 전 방문 사용자는 인앱 대상에 포함되고 등록 후 방문 사용자는 제외되며 단말 Push 선택은 독립적으로 유지되는 회귀 테스트를 추가했다.
- 배포 폭주 방지: 첫 알림 배포 전에 존재하는 모든 `pending` 항목은 기준선 스크립트가 `expired / pre_delivery_rollout_baseline`으로 종료하고 단말 Push와 종 저장을 모두 0건으로 기록한다. 기준선은 배포당 반복하지 않도록 서버 마커로 보호한다. cron 파일은 활성 경로에 바로 올리지 않고 앱 내부에 먼저 준비하며, 기존 cron을 중지하고 잠금 작업 종료를 기다린 뒤 마이그레이션·설정 이관·기준선·서비스 재시작이 모두 성공한 마지막 단계에서만 설치한다. 이후 한 실행에 처리 대상이 4건 이상이면 개별 단말 Push를 모두 억제하고 사용자별 종에만 저장하며, 동시 cron·관리자 실행은 하나의 처리 Promise로 합쳐 같은 단말 중복 발송을 막는다.
- 설정 초기화 안전성: 최초 전환에서는 관리자 포함 기존 구독자 37명의 마스터·오늘 일정·새 이벤트 설정을 모두 끄고 서버의 기존 단말 구독 38개를 제거한다. 사용자가 알림 설정을 다시 저장해야 새 구독과 사용자 설정이 활성화된다. 이 초기화는 별도 서버 마커로 한 번만 수행하며 이후 배포는 재설정한 값을 덮어쓰지 않는다.
- 상태변경 공지: 모든 기존 사용자에게 `알림 기능 재설정 안내`를 고정 출처 ID로 정확히 한 건 생성한다. 본문은 `알람기능이 재설정되었습니다. 사용하기위해서는 재설정 저장해주세요`이며 단말 Push는 발생하지 않는다. 브라우저의 구형 정적 공지와 로컬 미읽음 복제본을 제거해 배포 직후 종 숫자는 이 공지 1건만 반영하고, 사용자가 종을 열면 사용자별 서버 읽음으로 전환된다.
- 자유게시판 읽음 동기화 후속: 목록에서 연 상세뿐 아니라 알림함·직접 상세 URL 등 모든 자유게시판 상세 컴포넌트가 실제 글 표시 시 같은 읽음 API를 호출한다. 성공한 읽음은 현재 탭 CustomEvent, 다른 탭 BroadcastChannel·storage, 다른 기기/복귀 시 focus·visibility 재조회로 바텀 포럼 배지, 홈 게시판 배지, 글별 `NEW`에 동시에 반영한다. 읽음 조회·저장은 HTTP 캐시를 금지한다.
- 검증: 관리자 안전 매트릭스를 포함한 Push/인앱·배포 기준선·설정 이관 핵심 테스트 81개가 통과했다. Vitest 대상 전체 197개와 별도 Node 소셜 릴스 테스트 19개가 각각 통과했고, 수집 기준 검사, 안전 관련 lint, 서버·서비스워커·배포 스크립트 구문 검사, 프로덕션 빌드와 Cafe24 서버 번들, 변경 공백 검사도 통과했다. 전체 `*.test.*`를 한 번에 Vitest로 실행하면 Node 전용 `*.test.mjs` 2개를 잘못 수집하는 저장소 실행기 충돌이 있어, 공식 `test:social-reel` Node 실행과 Vitest 대상을 분리해 검증했다. 알림 기능 실패는 없었다.
- 1차 배포 호환성 후속: Cafe24 구형 MySQL이 한 테이블의 `DEFAULT CURRENT_TIMESTAMP`와 `ON UPDATE CURRENT_TIMESTAMP` 두 컬럼을 거부해 정적 파일 전송 뒤 신규 설정 테이블 생성에서 배포가 중단됐다. cron·초기화 마커·신규 테이블이 모두 없는 상태를 확인해 기존 구독 삭제나 알림 발송은 발생하지 않았다. `created_at`을 명시 저장하는 `DATETIME`으로 바꾸고 `updated_at` 하나만 자동 갱신하도록 호환했다.
- 2차 배포 종료 후속: 설정 초기화 스크립트가 37명의 설정을 모두 비활성화한 뒤 MySQL 연결 풀을 닫지 않아 프로세스가 종료되지 않았다. cron은 계속 미설치 상태였고 단말 Push는 0건이었다. 배포 프로세스를 중지하고, 기존 단말 구독은 레거시 행별 식별자 차이에 영향받지 않도록 `generic_records.table_name`의 정확한 범위 삭제로 바꿨다. 초기화·기준선·공지 스크립트는 CLI 완료 후 연결 풀을 명시적으로 종료한다.
- 관련 파일: `server/cafe24/push-api.js`, `server/cafe24/notification-preferences.js`, `server/cafe24/board-read-api.js`, `server/cafe24/migrations/2026-08-03-notification-delivery-standard.sql`, `server/cafe24/migrations/2026-08-03-user-board-post-reads.sql`, `src/lib/notificationStore.ts`, `src/lib/pushNotifications.ts`, `src/hooks/useFreeBoardUnreadCount.ts`, `src/layouts/MobileShell.tsx`, `public/service-worker.js`, `scripts/run-cafe24-notification-cron.mjs`, `scripts/deploy-cafe24.sh`
- UI 후속: 우측 종 알림함 하단에 `단말 알림 설정` 바로가기를 고정했다. 미확인 이벤트가 없는 빈 알림함에서도 표시되며, 선택하면 알림함을 닫고 기존 단말 Push 설정 화면을 연다.

## 2026-08-03 미니PC 키오스크 503 화면 고정

- 상태: 운영 복구 완료
- 현상: 키오스크가 댄스빌보드 화면을 벗어나 `503 Service Unavailable` 화면에 고정됐다.
- 원인: 미니PC의 DHCP 주소가 기존 `172.30.1.13`에서 `172.30.1.14`로 바뀌어 이전 주소의 SSH가 타임아웃됐고, 6일간 유지된 Chrome 탭에는 과거 운영 503 응답이 남아 있었다. 디스플레이·Chrome 서비스 자체는 active/enabled 상태였다.
- 조치: mDNS `kiosk-host.local`로 현재 주소를 찾고 전용 관리 키로 접속해 `kiosk-display.service`와 `kiosk-chrome.service`를 재시작했다. 운영 문서의 접속 기준을 고정 IP보다 mDNS 우선으로 변경했다.
- 검증: 두 서비스가 모두 active/enabled, Chrome 원격 디버깅 탭 1개, 탭 제목 `댄스빌보드`, 최종 URL `https://swingenjoy.com/`, 운영 `/kiosk` HTTP 200을 확인했다.

## 2026-08-04 그루브 랩 하단 고정 메뉴 강제 노출

- 상태: 수정 및 재배포
- 현상: 새 `개발중` 그루브 랩 앱이 사용자의 메뉴 편집 선택과 무관하게 하단 고정 메뉴에 강제로 추가됐다.
- 원인: 커스텀 메뉴 앱 목록 등록과 기본 고정 메뉴 노출을 같은 작업으로 잘못 해석해 `quickMenuItems` 필수 항목에 그루브 랩을 넣었다.
- 조치: 그루브 랩은 전체 커스텀 메뉴 목록에만 `BETA` 앱으로 유지하고, 사용자가 기존 메뉴 편집 기능으로 직접 고정할 때만 하단에 나타나도록 강제 추가를 제거했다.
- 검증: 고정 메뉴 계산이 기존 항목과 혜택 메뉴만 유지하며 `groove-lab`은 `HOME_MENU_ITEMS` 카탈로그에만 존재함을 확인했다. 그루브 엔진 테스트 10개와 프로덕션 빌드가 통과했다.
- 관련 파일: `src/pages/v2/components/HomeV2MenuPanel.tsx`, `docs/decisions/2026-08-04-instrument-groove-lab.md`

## 2026-08-04 그루브 랩 모바일 스크롤 및 메뉴 정렬

- 상태: 수정 및 재배포 준비
- 현상: 그루브 랩이 모바일 셸 안에서 세로 스크롤되지 않아 아래 프리셋과 조사 근거를 볼 수 없었다. 선택 영역도 재생기 아래에 있어 리듬 탐색이 늦었고, 확장 메뉴 상단에는 외곽선이 남았으며 `강습&행사` 합성 아이콘과 문구의 가로 중앙 기준이 명시되지 않았다.
- 원인: 일반 셸은 전역 스크롤을 막지만 그루브 랩 경로에 높이·내부 스크롤 계약이 없었다. 프리셋 선택 영역은 DOM 후반의 기본 배치였고, 확장 메뉴 패널의 inset 그림자가 외곽선처럼 보였다.
- 조치: 그루브 랩 전용 셸을 뷰포트 높이로 고정하고 페이지 내부에 관성 세로 스크롤과 하단 안전 여백을 부여했다. 리듬·악기 선택을 첫 화면으로 올리고 8계열 28프리셋으로 확장했다. 확장 메뉴의 외곽 inset을 제거하고 모든 메뉴 라벨 및 `강습&행사` 합성 아이콘에 명시적 중앙 정렬을 적용했다.
- 검증: 390×844 모바일 브라우저에서 첫 화면에 리듬 선택이 노출되고, 최하단 조사 근거까지 스크롤되며, 확장 메뉴에서 `개발중`은 커스텀 목록에만 있고 `강습&행사` 아이콘·라벨이 카드 중앙에 배치됨을 확인했다. 엔진 테스트 12개와 프로덕션 빌드가 통과했다.
- 관련 파일: `src/layouts/MobileShell.tsx`, `src/styles/components/MobileShell.css`, `src/pages/groove-lab/GrooveLabPage.tsx`, `src/pages/groove-lab/groove-lab.css`, `src/pages/groove-lab/grooveEngine.ts`, `src/pages/v2/components/HomeV2MenuPanel.css`, `src/styles/theme-completion.css`

## 2026-08-04 Android 화면 복귀 시 `Failed to fetch` 전역 오류창

- 상태: 수정 및 검증 완료, 배포 준비
- 현상: Android Chrome에서 `/groove-lab`을 열어 둔 채 다른 화면으로 나갔다가 돌아오면 `TypeError: Failed to fetch`가 전역 치명 오류창으로 표시됐다.
- 원인: 자유게시판 미읽음 배지의 `focus`·`visibilitychange` 리스너가 화면 복귀 즉시 `/api/board/free/unread`를 호출했고, Android 네트워크가 아직 안정되지 않은 순간의 fetch 거부를 처리하지 않아 `unhandledrejection`으로 전파했다. 알림 IndexedDB의 구버전 탭 경합도 일부 비동기 호출에서 같은 전역 경로로 전파될 수 있었다.
- 조치: 복귀 배지 조회를 800ms 디바운스하고 조회 실패 시 기존 상태를 유지한다. 전역 오류 정책은 동적 청크 실패와 일반 앱 오류는 기존대로 처리하면서 일시적 네트워크 실패와 정확한 IndexedDB 하위 버전 경합만 비치명으로 분류한다. 알림 저장소는 IndexedDB를 열 수 없을 때 서버 알림함 fallback을 사용하며 오래된 로컬 알림 정리 실패도 명시적으로 처리한다.
- 검증: 오류 정책 8개와 로그인 사용자의 화면 복귀 fetch 실패 회귀 테스트 1개가 통과했다. 프로덕션 빌드가 성공했다. 411×803 모바일 브라우저에서 API 연결을 끊은 뒤 다른 탭에서 돌아오는 조건을 재현했고, 기존 화면이 유지되며 `#crash-fallback-overlay`가 0개임을 확인했다.
- 관련 파일: `src/hooks/useFreeBoardUnreadCount.ts`, `src/utils/globalErrorPolicy.ts`, `src/main.tsx`, `src/lib/notificationStore.ts`, `src/App.tsx`

## 2026-08-09 PWA 혼합 버전 오류 및 로컬 자동화 공백 재검토

- 상태: 원인 재현·수집 보강·Instagram 상태 복구 완료. PWA 구조 수정 및 운영 배포 완료
- PWA 현상: Android Chrome에서 `The requested version (1) is less than the existing version (2)`와 `Failed to fetch` 전역 오류창이 배포 전후 반복됐다.
- PWA 구조 원인: 앱은 `notification-history` DB v2, 서비스워커는 같은 DB v1을 연다. 서비스워커와 PWA 등록은 새 버전을 즉시 활성화·리로드하고 구 캐시를 정리하며, 배포는 `rsync --delete`로 구 해시 자산을 즉시 삭제한다. 존재하지 않는 `/assets/*` 요청도 SPA fallback이 `index.html`을 200 HTML로 반환한다. 이 조합은 구버전 탭과 신버전 서비스워커·서버가 섞이는 정상적인 배포 중첩 구간을 지원하지 않는다.
- PWA 재현: 격리 브라우저에서 현재 방식인 즉시 활성화·구 캐시/구 자산 삭제 뒤 구버전 탭의 지연 import가 `FAILED:TypeError`로 실패했다. 새 서비스워커를 대기시키고 구 자산을 유지한 비교군은 `lazy-1-ok`로 성공했다. 앱 DB v2를 연 뒤 v1 경로를 열면 `VersionError`, v2로 정렬하면 성공했다. 운영의 과거 해시 `assets/index-CuhdXVuW.js` 요청도 HTTP 200 `text/html`로 확인됐다.
- PWA 제안: 직전 릴리스 중첩 보존, `/assets/*` 정확한 404, 자산 선업로드·검증 후 진입 파일 전환, 단일 갱신 코디네이터, 서비스워커의 알림 DB 소유 제거를 불변 조건으로 정리했다. DB 숫자만 올리거나 캐시 초기화를 강화하는 단기 처방은 다음 마이그레이션·배포에서 재발하므로 채택하지 않았다.
- PWA 재발 확인: 2026-08-10 운영 로그에서 앱 부팅 직후 `[MobileShell]`과 `[App]`의 알림 조회가 다시 `The requested version (1) is less than the existing version (2)`로 실패하고 같은 오류가 `unhandledrejection`으로 전파됐다. 당시 `Online: true`였으므로 네트워크 단절이 아니라 운영에 남은 동일 IndexedDB 소유권 충돌의 재발로 판정했다.
- PWA 구조 수정: 운영 알림함의 유일한 원본을 서버 `user_notifications`로 고정하고 앱·서비스워커의 `notification-history` IndexedDB 사용을 모두 제거했다. 서비스워커는 운영체제 Push 표시와 서버 출처 식별자 전달만 담당하며, 관리자 미리보기는 새로고침 시 사라지는 메모리 저장소만 사용한다. 알림 조회·읽음은 캐시하지 않는 서버 API로 통일했다.
- PWA 릴리스 수정: 클라이언트 해시 자산을 진입 파일보다 먼저 올리고 구 해시를 즉시 삭제하지 않으며, 없는 `/assets/*`는 SPA HTML이 아닌 정확한 404로 종료한다. PWA 등록은 `prompt`로 바꾸고 설치 단계의 무조건 `skipWaiting()`을 제거했다. 기존 모달·입력·숨김 탭 보호를 유지하는 단일 갱신 코디네이터가 안전 시점에만 대기 중 서비스워커를 활성화하고 리로드한다.
- PWA 검증 및 배포: 서버 알림 조회·읽음, 서비스워커 저장소 비소유, 배포 순서·404·안전 활성화 계약, 갱신 재시도 및 전역 오류 정책을 포함한 관련 테스트 98개가 통과했다. 커밋 `ad681a7e`를 `origin/main`에 푸시하고 Cafe24에 배포했다. 운영 서비스와 내부·외부 헬스는 정상이고 공개 버전은 `2026-08-10T03:45:17.762Z`다. 공개 서비스워커에서 `notification-history`, `indexedDB`, `notification_local_id`가 모두 0건이며, 새 진입 자산과 8월 4일 구 해시 자산은 HTTP 200, 없는 `/assets/*`는 `text/plain` HTTP 404임을 확인했다.
- 예약 수집 감사: 2026-08-05~09에는 매일 08·09·10·11시 네 LaunchAgent 실행이 모두 종료 코드 0으로 남아 있어 3일 전체 미실행은 아니었다. 다만 컴퓨터 전원 종료 공백을 소스별 마지막 성공 위치에서 이어가는 cursor가 없고, 우선순위 1은 최신 2개·우선순위 2는 최신 1개만 보는 고정 범위라 여러 게시물이 올라오면 누락될 구조적 가능성이 있다.
- 수집 보강: 기준 테스트와 source guard 통과 후 우선순위 1·2 공식 Instagram 33개 소스를 게시물 4개 범위로 두 번에 나눠 실행했다. `20260809_174023_43759`는 신규 후보 2건을 저장하고 기존 보류 1건을 포함한 자동등록 3건을 성공시킨 뒤 남은 16개를 기록했다. `20260809_175753_45982`는 그 16개만 이어서 확인해 신규 0건, 남은 소스 0, 종료 코드 0으로 끝났다. 운영 일정 API에서 8월 12일 소셜클럽 `DJ 쵸리`, 8월 9일 네오스윙 `DJ 조커`, 스윙타임 `DJ 메이져` 반영을 확인했다.
- Instagram 복구: 8월 8일 실행은 Share를 눌렀지만 게시물 수 검증이 끝나지 않아 `verification-required`였다. 같은 날짜 안전 복구를 실행해 재게시 없이 프로필 게시물 수 17→18을 확인하고 `published / profile-post-count`로 복구했다. 소셜 릴스 Node 테스트 20개가 통과했다.
- Telegram 승인 검토: 릴스 전용 봇은 webhook 없음, pending update 0이며 Codex 대화용 봇과 분리돼 있다. 최종 Share 화면·릴스 미리보기를 보내고 단일 chat ID, 난수 nonce, 10~15분 TTL, 일회용 inline `게시 승인`/`취소` callback을 사용하는 fail-closed 상태머신이 가능하다. 승인·검증 전에는 Share를 누르지 않고 거절·시간초과·재시작은 자동 게시하지 않는 구조를 권고했다.
- 관련 기록: `docs/decisions/2026-08-09-pwa-release-consistency.md`, `docs/decisions/2026-08-09-local-automation-catchup-and-approval.md`

### 2026-08-11 구 PWA 탭의 DB VersionError 선발생 후 지연 정상화

- 상태: 구조 수정·운영 배포·검증 완료
- 현상: Android Chrome의 오래 열린 탭을 전면으로 가져오면 `The requested version (1) is less than the existing version (2)` 오류 화면이 먼저 나타나고 약 1초 뒤 사이트가 정상 로딩됐다. 새로 생성한 로그에도 과거 오류가 남아 같은 오류가 계속 발생한 것처럼 보였다.
- 운영 근거: 2026-08-10 14:39:08 UTC 오류 시점의 reload diagnostic은 실행 중 클라이언트를 빌드 `1785315591396`(2026-07-29, 커밋 `95cf4ff6`)으로, 서버를 `1786342147739`로 기록했다. 14:39:09에 리로드가 실행된 직후 현행 코드만 사용하는 `/api/notifications?unread=1` 요청이 성공했다. 14:40:53에 복사된 로그의 오류 항목 시각은 여전히 14:39:08이므로 리로드 뒤 새 오류가 아니라 localStorage에서 복원된 이전 부트 기록이었다.
- 직접 원인: 7월 29일 번들은 모듈 평가 시 `notification-history` v1을 열고, 이미 다른 탭이 v2로 올린 DB와 충돌했다. App의 처리되지 않은 `deleteOld()` 거부가 전역 오류 화면을 만들었고 기존 버전 폴러가 1.5초 뒤 현행 번들로 리로드했다. 이미 메모리에 실행 중인 구 JS에는 이후 배포한 catch와 DB 소유권 제거가 적용될 수 없었다.
- 전환 교착: 구 `autoUpdate` 등록 코드는 새 `prompt` 서비스워커에 `SKIP_WAITING`을 보내지 않는데 새 서비스워커도 설치 시 자동 활성화를 중단해, 구 탭이 남은 브라우저에서 새 worker가 영구 waiting 상태가 될 수 있었다. 전체 JS·HTML 프리캐시와 활성화 시 무조건 `clients.claim()`도 이전 앱 셸 재부팅 가능성을 남겼다.
- 구조 조치: CacheStorage 영속 marker를 둔 1회용 호환 브리지가 기존 active worker가 있는 브라우저에서만 강제 활성화·선점하고 모든 안전한 구 탭을 복구 URL로 이동시킨다. marker 완료 뒤 이후 릴리스는 다시 `prompt` 대기와 앱 코디네이터의 안전 활성화를 사용한다. 서비스워커의 HTML·JS·CSS 프리캐시와 navigation fallback을 모두 제거하고 Web Share Target·Push만 유지했다.
- 부트·복구 조치: `index.html` 진입점을 가벼운 pre-React bootstrap으로 바꿔 서버 빌드가 현재 번들과 다르면 React와 알림 코드를 평가하기 전에 캐시 정리·worker 갱신·cache-busted navigation을 수행한다. 오류 화면의 초기화 버튼은 worker unregister, 구 앱 셸 캐시와 `notification-history` 삭제를 모두 기다린 뒤 재시작한다. 자동 복구가 두 번 실패하면 자동 unregister·reload를 반복하지 않고 수동 재시도 화면에서 멈춘다.
- 진단 조치: 클라이언트 로그에 build ID와 boot ID를 기록한다. 현재 부트와 이전 부트를 복사 텍스트에서 분리하며 오류 점·오류/경고 수는 현재 부트만 계산한다.
- 로컬 검증: PWA 릴리스 계약, 1회 브리지 조건, 코디네이터 동시성·재시도, 구 캐시·DB 정리, 로그 부트 경계를 포함한 Vitest 30개가 통과했다. 실제 Chromium에서 7월 29일 worker가 제어하는 구 탭 2개, DB v2, 구 runtime·Workbox 캐시를 만든 회귀도 통과했다. 두 탭이 약 3.5초 안에 최신 `__APP_STARTED`로 수렴했고 구 캐시는 삭제, Share·무관 캐시는 보존됐으며 `notification-history` 삭제 뒤 v1 open이 성공하고 VersionError·crash overlay는 0건이었다. 이 회귀가 activate에서 `client.navigate()` 완료를 기다리던 교착을 검출했고 navigation을 예약만 하도록 고친 뒤 통과했다. 프로덕션 빌드가 성공했고 생성 서비스워커는 약 6.4KB, inject manifest 1개이며 앱 자산 프리캐시·cached index fallback·알림 DB open이 없음을 확인했다.
- 운영 배포 및 검증: 수정 커밋 `d3850c6a`를 `origin/main`에 푸시한 뒤 동일 커밋의 clean worktree에서 Cafe24에 배포했다. 공개·서버·배포 원본의 버전은 `1786378011134`로 일치하고 서비스워커 SHA-256도 `49b34b66fd03828be33dd211ddeffc65d55c958a76bcc416ebed5eb8acd72d27`로 모두 같았다. 공개 서비스워커는 `no-store`이며 전환 marker를 포함하고 앱 자산 프리캐시·cached navigation·`notification-history` 문자열은 0건이다. 외부 헬스와 서비스 상태는 정상, 미존재 자산은 `text/plain` HTTP 404다. 운영 Chromium 스모크 테스트에서 앱 본문과 active worker를 확인했고 VersionError·치명 오류 화면·관련 console/page error는 0건이었다.
- 관련 파일: `src/bootstrap.ts`, `src/lib/pwaRecovery.ts`, `public/service-worker.js`, `vite.config.ts`, `src/lib/pwaUpdateCoordinator.ts`, `src/components/DeploymentAutoRefresh.tsx`, `src/utils/clientLogBuffer.ts`, `src/main.tsx`

## 2026-08-09 지난 금요일 정규 소셜 자동 제거

- 상태: 원인 확인, 수정·배포 전
- 현상: 8월 월간 캘린더에서 지난 금요일인 2026-08-07의 소셜이 전부 비어 보였다.
- 운영 확인: 8월 7일 소셜은 운영 일정 API에 0건이다. 반면 8월 14일에는 `Busan Balboa Social`, `네오스윙 금요 소셜`, `드림발 금요 소셜`이 있고, 8월 21일·28일에도 네오스윙·드림발 금요 소셜이 남아 있다.
- 원인: 정규 소셜 조정기가 `regular-social:*` 자동 생성 일정 중 `eventDate < today`인 행을 제거 목록에 넣고 실제 `events`에서 삭제한다. 따라서 날짜가 지난 정규 소셜은 월간 캘린더의 역사에서 사라진다. 8월 9일 확대 재수집은 legacy cleanup을 스킵했고 삭제 건수도 0이므로 이번 수집 실행이 원인이 아니다.
- 판단: 미래 90일 롤링 생성과 과거 일정 보존을 같은 정리 조건으로 처리한 구조 문제다. 월간 캘린더가 지난 일정을 보여야 한다면 자동 생성 정규 소셜도 과거 보존 기간 또는 월 경계까지 유지하도록 별도 정책이 필요하다.
- 관련 파일: `server/cafe24/regular-social-reconciler.js`, `server/cafe24/regular-social-rules.js`

## 2026-08-10 캘린더 소셜 유무 날짜의 첫 이벤트 윗선 불일치

- 상태: 재배포 및 운영 검증 완료
- 현상: 소셜이 없는 날짜의 첫 일반 이벤트 윗선이 인접 날짜의 초록색 소셜 라운드 컨테이너가 아니라 그 위로 돌출된 `소셜 N` 뱃지 윗선에 맞춰져 보였다.
- 조치: 소셜이 있는 날짜와 없는 날짜를 셀 본문 클래스에서 구분하고, 소셜 라운드의 상단 여백과 소셜이 없는 날짜의 첫 일반 이벤트 상단 여백이 같은 CSS 변수 하나를 사용하도록 통일했다. 뱃지의 돌출 위치는 유지했다.
- 검증: 레이아웃 계약 테스트와 프로덕션 빌드가 통과했다. Chromium 실측에서 일반 이벤트 윗선과 소셜 라운드 윗선의 차이는 390px 모바일과 1024px 데스크톱 모두 0px였고, 뱃지는 라운드보다 각각 5px·6px 위에 유지됐다. 대상 ESLint는 오류 0건이며 기존 경고만 남았다.
- 연속 일정 색상 후속: 연속 일정 막대가 모두 `event` 분류의 단일 색을 공유하던 구조를 분리했다. 단일 다일 일정은 이벤트 ID, 여러 행을 묶은 일정은 제목·장소·주최자 기반 시리즈 키를 해시해 고정 HSL 색상을 직접 생성한다. 같은 일정은 월·필터·정렬 순서 및 주 경계가 바뀌어도 동일한 색을 유지하며, 제한된 팔레트 인덱스 충돌로 다른 일정이 같은 색을 받는 문제도 피한다.
- 연속 일정 검증: 이벤트 ID와 시리즈 키의 결정적 색상 배정 및 월별 정렬 인덱스 비의존 계약 테스트를 추가했다. 캘린더 레이아웃 테스트와 색상 단위 테스트 및 프로덕션 빌드가 통과했다.
- 운영 검증: 커밋 `751c5fa1`을 `origin/main`에 푸시하고 Cafe24에 배포했다. 공개·서버 버전은 `2026-08-10T05:05:24.530Z`로 일치하고 서비스와 헬스 체크가 정상이다. 운영 9월 화면에서 서로 다른 연속 일정 2건이 서로 다른 고정 HSL 색상으로 표시됐으며, 8월 오늘 이동 후 표시 중복 없음, `+N 더보기` 0건을 확인했다.
- 오늘 표시 중복 후속: 모바일에서 오늘 버튼 또는 주간 스크롤 정착 위치로 이동하면 고정 요일줄의 파란 오늘 원과 그 아래 실제 날짜 원의 하단이 동시에 보였다. 콘텐츠 기준 스크롤의 의도된 5px 여백은 유지하되, 고정 컨트롤이 그 경계 여백을 같은 배경색으로 덮어 실제 날짜 원이 비치지 않게 했다.
- 오늘 정렬 재검증: 551px 운영 화면을 좌표로 다시 측정한 결과 오늘 날짜 칩이 일반 날짜보다 6px 높은 탓에 오늘 칸의 첫 일반 이벤트가 소셜 라운드보다 6px 내려갔고, 이를 가리던 5px 고정 컨트롤 그림자가 소셜 뱃지 상단 2px도 함께 덮었다. 모바일 셀 헤더를 14px로 고정하고 오늘 칩을 흐름 높이와 분리했으며, 추가 가림막 없이 셀 본문을 고정 요일줄 바로 아래에 정착시켰다. DB 연결 로컬 화면에서 390·420·551·720px 모두 일반 이벤트와 소셜 라운드 윗선 차이 0px, 소셜 뱃지 완전 노출, 오늘 칩 비노출을 확인했다.
- 정렬 재배포 검증: 커밋 `7881c5f6`을 `origin/main`에 푸시하고 Cafe24에 재배포했다. 공개·서버 버전은 `2026-08-10T05:28:07.389Z`로 일치하고 서비스와 헬스 체크가 정상이다. 운영 화면의 359px 및 551px 오늘 이동 상태에서 일반 이벤트와 소셜 라운드 윗선 차이 0px, 소셜 뱃지 완전 노출, 오늘 칩 비노출, 고정 컨트롤 그림자 없음, `+N 더보기` 0건을 확인했다.
- 날짜 칸 표시 후속: 모바일의 5개 제한과 `+N 더보기`를 제거해 기간 막대로 대체되는 중복 항목 외에는 날짜별 모든 일정을 셀에 직접 렌더링한다.
- 관련 파일: `src/pages/calendar/components/FullEventCalendar.tsx`, `src/pages/calendar/styles/FullEventCalendar.css`, `src/pages/calendar/styles/CalendarPage.css`, `src/pages/calendar/components/FullEventCalendar.layout.test.ts`, `src/pages/calendar/utils/calendarSpanTone.ts`, `src/pages/calendar/utils/calendarSpanTone.test.ts`
