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
# 2026-07-26 — 키오스크 홈 광고 하단 UI 정렬

- 상태: 수정 완료, 1080×1920 키오스크 화면 및 프로덕션 빌드 검증 완료
- 현상: 1024px 이상 세로형 키오스크에서 일반 데스크톱 2열 배치가 적용되어 원데이 모집/무료·할인 버튼과 광고 제목의 기준선이 어긋나고, 오늘 일정이 광고 오른쪽에 표시됨. 이미지가 없는 소셜 이벤트 광고는 장소 정보 대신 기본 누락 이미지만 노출됨.
- 원인: 키오스크 전용 레이아웃 안에서도 `.NEB-quickActions`의 데스크톱 `position: fixed` 규칙이 남아 하단 그리드 배치를 벗어남.
- 조치: 키오스크를 모바일과 같은 단일 열 순서로 변경하고 버튼 묶음을 하단 그리드로 되돌려 두 버튼의 폭과 간격을 통일함. 오늘 일정은 전면 광고 하단에 표시함. 이미지가 없는 소셜 광고는 전용 배경 위에 이벤트 제목·날짜·시간·장소를 표시하도록 대체 화면을 추가함. 키오스크 내 이미지는 드래그되지 않도록 제한함.
- 관련 파일: `src/styles/kiosk-mode.css`, `src/pages/v2/components/NewEventsBanner.tsx`, `src/pages/v2/components/NewEventsBanner.css`

## 후속 수정

- 소셜 상세 화면은 포스터 미등록뿐 아니라 등록된 포스터 URL이 모두 로딩 실패한 경우에도 주소가 있으면 카카오맵 장소 화면으로 전환하도록 보완함.
- 키오스크 오늘 일정에 모바일과 같은 카드형 목록 스타일, 고정 높이 내부 스크롤, 위치 표시 스크롤바를 적용함. 키오스크 폭이 모바일 미디어쿼리를 벗어나 내부 스타일이 누락되던 문제를 수정함.
- 키오스크 캘린더에서도 모바일 셀 배치를 강제하고 날짜 헤더를 일반 흐름에 배치함. 연속 일정이 없는 셀에서 절대 배치된 날짜와 첫 이벤트가 겹치던 문제를 수정함.
- 관련 파일: `src/pages/v2/components/EventDetailModal.tsx`, `src/pages/calendar/styles/FullEventCalendar.css`

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
- 검증: 관련 단위 테스트 40개, 수집 표준 테스트, ESLint, Cafe24 프로덕션 빌드가 통과했다. 운영에서 기본 일정 190건을 교체한 뒤 포스터 0건, `DJ 미정` 190건, 지도 주소 190건을 확인했고 재실행 드라이런은 생성 0·삭제 0·유지 190건이었다.
- 관련 파일: `server/cafe24/external-regular-socials-api.js`, `server/cafe24/regular-social-reconciler.js`, `server/cafe24/migrations/2026-07-26-external-regular-socials-api.sql`, `docs/external-event-api.md`
