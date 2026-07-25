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
- 검증:
  - TypeScript, ESLint, 서버 문법, 외부 API 단위 테스트 23개, 프로덕션 빌드
  - 데스크톱·모바일 헤드리스 렌더링 및 가로 넘침·런타임 오류 검사
- 관련 파일:
  - `src/pages/external-api/ExternalEventApiGuidePage.tsx`
  - `src/components/ExternalApiPartnerManagementModal.tsx`
  - `server/cafe24/external-events-api.js`
  - `server/cafe24/migrations/2026-07-26-external-api-permissions-and-environment.sql`
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
