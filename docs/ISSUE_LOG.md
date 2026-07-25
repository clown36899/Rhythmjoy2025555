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
- 검증: TypeScript, 프로덕션 빌드, 모바일 실화면 노출 및 이동 확인
- 관련 파일:
  - `src/pages/v2/components/NewEventsBanner.tsx`
  - `src/pages/v2/components/NewEventsBanner.css`
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
