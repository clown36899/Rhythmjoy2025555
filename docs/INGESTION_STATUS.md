# 스윙씬 이벤트 자동 수집 — 현황 및 인계 보고서

> 📌 **이 파일은 git 관리 대상** (`docs/INGESTION_STATUS.md`).
> 자동 실행은 run 파일과 Telegram 요약을 우선한다. 이 문서는 수동 점검/인계 시 갱신한다. 구 경로 `/Users/inteyeo/scripts/INGESTION_STATUS.md`는 더 이상 사용하지 않는다.
> 재구축 가이드: [`docs/ingestion-system-rebuild-guide.md`](./ingestion-system-rebuild-guide.md)

**최종 업데이트**: 2026-05-28 08:18

---

## 📊 실행 로그

### 2026-05-28 08:00 LaunchAgent 자동 실행 성공
- **실행 ID**: `/Users/inteyeo/ingestion-runs/20260528_080001_31109.*`
- **결과**: `exit_code=0`, 08:00 시작 후 08:17:54 정상 종료. Telegram 전송 성공.
- **요약**:
  - 신규: 0건
  - 스킵: 14건
  - 과거데이터삭제: 0건
  - 접근불가: none
  - 이슈: 초기 경성홀 3건 중복스킵은 로컬 응답 집계 재시작 후 복구 집계
- **상태 확인**: LaunchAgent는 loaded 상태이며 다음 08:00 calendar interval을 대기한다. 실행 후 lock 파일과 잔여 Playwright/수집 프로세스 없음.
- **동기화**: repo의 최신 `scripts/run-ingestion.sh`를 실제 LaunchAgent 대상 `/Users/inteyeo/scripts/run-ingestion.sh`로 재동기화했고 `cmp`로 동일함을 확인했다.

### 2026-05-28 02:12 수집 안정화 후속 점검
- **BAT SWING 제외 강화**: 기존에는 `batswing.co.kr`만 제외했으나, 구버전 스크래퍼와 사람이 만든 후보에서 `instagram.com/batswing2003`가 들어올 수 있어 제외 규칙을 URL 패턴 기준으로 확장했다. Netlify `scraped-events` 저장 API, `collection-registry`, daily source guard, 테스트 모두 같은 기준으로 맞춤.
- **구버전 스크래퍼 차단**: `scripts/scrape-events.mjs`와 deprecated `event-ingestion` 스크립트는 기본 실행 시 78 코드로 종료되게 막았다. 현재 수집 기준은 `web-search-ingestion` + `scripts/run-ingestion.sh` + `collection-registry`만 유효하다.
- **운영 DB 확인**: 운영 `scraped_events`는 총 60건이며 완료 미래/오늘 24건, 완료 과거 0건, 중복 8건, BAT 후보 0건으로 확인했다. 운영 `events`는 오늘 포함 미래 `date` 기준 36건이며 현재 운영 반영된 타장르 이벤트는 0건이다.
- **인제스터 조회 보정**: `/admin/v2/ingestor` 조회 API가 `structured_data.date >= 오늘(KST)` 조건을 기본 적용하도록 조정했다. 서버 기준 탭 카운트는 신규 8, 완료 24, 중복 8로 확인했다. 과거 미처리 후보는 신규 탭에서 숨겨진다.
- **타장르 리서치 분리 강화**: 레지스트리에 `sourceKind`, `sceneRole`, `promotionPolicy`를 추가해 외부 허브 소개/공식 원본 선별 저장/조사 전용을 실행자가 구분할 수 있게 했다. 신규 리서치 로그는 `docs/expanded-genre-research-log-2026-05-28.md`에 기록했다.
- **검증**: `node scripts/test-ingestion-standards.mjs`, `bash -n scripts/run-ingestion.sh`, `git diff --check`, `npm run build:only` 통과. Vite의 기존 dynamic/static import chunk warning은 재현되었으나 이번 변경과 무관하다.

### 2026-05-28 01:03 실제 swing-daily 수동 실행 및 timeout 원인 확정
- **실행 ID**: `/Users/inteyeo/ingestion-runs/20260528_010319_23262.*`
- **결과**: 수집 루프와 후보 보정은 완료됐지만, 마지막 문서 갱신/summary 출력 전에 래퍼 25분 제한에 걸려 `exit_code=124` 처리됨. 실패 Telegram은 정상 전송.
- **실제 DB 반영**:
  - 신규 후보 3건: 봉천살롱 2026-06-04 정기 소셜, SNL Jazz Social 시즌8 4회차, 해피홀 5월 마지막주 금햎 DJ 메이저.
  - 완료/이미수집 3건: 경성홀 2026-05-30, 2026-05-31, 2026-06-02.
  - 중복 2건: 봉천살롱 2026-05-28, 해피홀/SNL 2026-05-30. 중복 탭 검증용으로 유지.
  - 오수집 1건(`경성홀 deladonghyunyoo`, RSF 얼리버드/마감일 오인식)은 Netlify DELETE로 제거했고 연결 Storage 이미지도 삭제됨.
- **과거 완료 데이터 정리**: candidates=0 / deleted=0. 재확인 결과 `is_collected=true AND structured_data.date < 2026-05-28` 잔여 0건.
- **원인**: 실제 수집 뒤 추가 DB 검증/수동 보정/`INGESTION_STATUS.md` 갱신까지 nested Codex가 계속 수행하면서 summary 블록 출력이 늦어짐. 래퍼는 의도대로 timeout/프로세스 정리/실패 알림까지 수행했다.
- **조치**:
  - `scripts/codex-ingestion-prompt.md`: daily 실행 중 repo 파일 수정 금지, 수집 루프 직후 summary 출력 후 종료, 후검증/문서갱신은 별도 작업으로 분리.
  - `.agents/skills/web-search-ingestion/SKILL.md`: `swing-daily` 종료 규칙을 summary-first로 변경하고 문서 갱신은 수동 점검 전용으로 조정.
  - `scripts/run-ingestion.sh`: fallback summary의 신규 수를 KST 날짜 오인식 대신 run 시작 UTC 이후 DB 기준으로 계산. 수집 결과 JSON의 `skipCount`, `accessFailures`, `issues`도 fallback에 반영.
  - 마감일/얼리버드/입금일/공지일을 이벤트 날짜로 오인하지 말라는 규칙을 prompt와 skill에 추가.
- **검증**:
  - `bash -n scripts/run-ingestion.sh`
  - `node scripts/test-ingestion-standards.mjs`

### 2026-05-28 00:55 자동 실행 안정화/타장르 리서치 보강
- **신규 수집**: 0건 (실제 수집 실행 아님, 안정화/검증 작업)
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **DB 정리 확인**: 운영 `scraped_events`에서 완료 처리된 과거 데이터 3건(`2026-05-27`)을 전용 cleanup 스크립트로 삭제했다. 삭제 대상은 `/Users/inteyeo/ingestion-runs/manual-cleanup-*.json`에 날짜/제목/장소/source_url과 함께 기록됨. 정리 후 `is_collected=true AND structured_data.date < today` 잔여 0건 확인.
- **자동수집 안정화**:
  - `scripts/run-ingestion.sh`에 `INT/TERM` trap을 추가해 외부 종료 시 Codex 자식 프로세스와 Playwright MCP를 정리하고 실패 알림을 보내게 했다.
  - Codex가 summary 블록 없이 끝나거나 타임아웃되는 경우 `build_fallback_summary()`로 신규 수/cleanup 수/이슈를 포함한 fallback summary를 생성하게 했다.
  - 실제 LaunchAgent 대상인 `/Users/inteyeo/scripts/run-ingestion.sh`도 repo 스크립트와 동일하게 동기화했다.
  - Telegram 인증값은 repo/docs에서 제거하고 `/Users/inteyeo/.rhythmjoy-ingestion.env`에서 읽도록 변경했다. 파일 권한은 `600`.
- **타장르 분리 확인**:
  - `swing-daily`는 스윙 scope만 반환하고 BAT SWING/meroniswing 제외 조건을 유지한다.
  - `expanded-research`는 저장 금지, `expanded-ingestion`은 검증된 타장르 후보만 저장 가능하도록 유지한다.
  - `SalsaVida Seoul`, `Korea Latin Dance Hub`, `Social Dance Today`, `Flowdat`은 discovery-only 허브로 추가했다. 이 URL 자체는 저장 불가이며, 공식 venue/원본 포스터로 역추적해야 저장 가능하다.
- **검증**:
  - `bash -n scripts/run-ingestion.sh`
  - `INGESTION_SMOKE_TEST=1 TELEGRAM_DRY_RUN=1 INGESTION_SKIP_CLEANUP=1 ... bash scripts/run-ingestion.sh` → exit 0, summary 추출 정상
  - fake Codex sleep + `TIMEOUT_SECONDS=3` → exit 124, fallback summary 생성 및 실패 알림 dry-run 정상
- **운영 원칙**: 스윙 자동 수집은 안정화 대상이고, 타장르는 씬 지도 작성/출처 검증을 별도 프로필로만 진행한다.

### 2026-05-27 08:11 자동 실행 (Codex/MCP hang, 부모 감시 루프로 개선)
- **신규 수집**: 미완료
- **중복 스킵**: 미완료
- **접근 불가**: 미완료
- **실제 상태**: `/Users/inteyeo/ingestion-runs/20260527_081105_7223.*` 실행이 14시간 이상 종료되지 않고 `codex --search exec`, Playwright MCP, `/tmp/rhythmjoy-ingestion.lock`을 유지했다. 23:00경 수동으로 프로세스와 stale MCP를 종료하고 lock을 제거했다.
- **DB 정리 확인**: pre-cleanup은 정상 작동했다. `2026-05-27` 기준 과거 완료 데이터 2건만 삭제됨: `2026-05-26` 스윙타운 화봉 DJ 루나, `2026-05-26` 경성홀 화요 소셜. 삭제 대상은 `{run_id}.cleanup.json`에 기록됨.
- **현재 DB 현황 점검**: visible 34건, 신규 9건, 완료 23건, 중복 2건, 미래 완료 23건, 과거 완료 0건. cleanup 재점검 결과 삭제 후보 0건.
- **원인**: 2026-05-26에 추가한 별도 watchdog 방식이 실제 장시간 Codex/WebSocket idle hang에서 충분하지 않았다. 부모 스크립트는 `wait $CODEX_PID`에 묶였고, watchdog 자식도 실효 종료를 만들지 못해 lock과 MCP가 남았다.
- **조치**:
  - `scripts/run-ingestion.sh`를 부모 감시 루프로 변경. 부모가 5초마다 Codex PID를 직접 확인하고 `TIMEOUT_SECONDS` 초과 시 `TERM` → 10초 대기 → `KILL`을 수행한다.
  - 타임아웃 시 Playwright MCP(`@playwright/mcp`, `playwright-mcp --cdp-endpoint http://localhost:9222`)도 함께 정리한다.
  - `swing-daily` 실행 직전에 source guard를 추가해 스윙 scope, 저장 가능 source, BAT/Meroni 제외 조건을 검사한다.
  - 테스트 전용 `INGESTION_SKIP_CLEANUP=1`을 추가해 smoke/timeout 검증 중 운영 DB cleanup을 반복 실행하지 않도록 했다.
  - LaunchAgent plist에는 종료 보조값 `ExitTimeOut=15`만 둔다. 실행 시간 제한은 launchd가 아니라 `run-ingestion.sh` 부모 감시 루프가 담당한다.
- **검증**:
  - `bash -n scripts/run-ingestion.sh`
  - `node scripts/test-ingestion-standards.mjs`
  - fake Codex 30초 sleep + `TIMEOUT_SECONDS=3` → `exit_code=124`, timeout meta 기록, lock 해제 확인.
  - 실제 Codex smoke prompt + `INGESTION_SMOKE_TEST=1` → `exit_code=0`, summary 추출, lock 해제 확인.
- **운영 원칙**: 매일 자동 실행은 `swing-daily`만 사용한다. 타장르는 scene map 조사/후보 검증을 위해 `expanded-research` 또는 `expanded-ingestion`으로 수동 분리한다.

### 2026-05-26 08:00 자동 실행 (타임아웃 미작동으로 수동 종료)
- **신규 수집**: 0건
- **중복 스킵**: 0건
- **접근 불가**: 미완료
- **실제 상태**: `/Users/inteyeo/ingestion-runs/20260526_080031_95979.*` 실행이 08:00부터 14:20까지 종료되지 않고 `codex --search exec` 프로세스와 `/tmp/rhythmjoy-ingestion.lock`을 유지했다. 수동으로 종료했고 최종 `exit_code=143`, 종료 Telegram은 전송됨.
- **DB 확인**: 운영 DB 전량 삭제 아님. 확인 시점 기준 `scraped_events` visible 36건, 신규 11건, 완료 25건, 중복 2건, 미래 완료 25건, 과거 완료 0건. 과거 완료 0건은 의도된 과거 완료 cleanup 결과다.
- **원인**: `scripts/run-ingestion.sh`가 `/opt/homebrew/bin/gtimeout`에 Codex 실행 종료를 맡겼는데 실제 Codex/자식 프로세스가 제한 시간 이후에도 남았다. 그래서 완료 summary와 종료 문자가 정상 경로로 나오지 않았다.
- **조치**: `gtimeout` 의존을 제거하고 별도 watchdog 프로세스를 추가했다. 제한 시간 초과 시 Codex 자식 프로세스까지 `TERM` 후 `KILL`, `exit_code=124`, timeout meta 기록, 실패 Telegram 경로로 들어간다. `TELEGRAM_DRY_RUN=1`을 추가해 로컬 검증 시 실제 문자 발송 없이 테스트 가능하게 했다.
- **데이터 보존 조치**: 과거 완료 데이터 정리를 LLM raw `DELETE`에서 `scripts/ingestion/cleanup-past-collected.mjs`로 이동했다. 이제 자동 실행은 삭제 전 대상 `id/display_no/date/title/location/source_url`을 `{run_id}.cleanup.json`에 남기고, `is_collected=true` 및 `structured_data.date < 오늘` 조건을 재검증한 뒤 ID 기반으로만 삭제한다.
- **검증**:
  - 가짜 Codex 60초 sleep + `TIMEOUT_SECONDS=2` → `exit_code=124`, timeout meta/log 기록, 잔여 프로세스 없음.
  - 실제 Codex smoke prompt + `INGESTION_SMOKE_TEST=1` → `exit_code=0`, cleanup JSON 기록, summary 추출, 완료 Telegram dry-run 경로 확인.
- **개선 필요**: 다음 실제 08:00 자동 실행에서 25분 내 정상 종료 또는 timeout 실패 문자가 오는지 확인. 정기 실행에는 `swing-daily`만 사용하고 타장르 조사는 별도 `expanded-research`로 분리 유지.

### 2026-05-26 02:29 실행 (expanded-research 검증 중단)
- **신규 수집**: 0건
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 수집 안정화 검증 중 `INGESTION_PROFILE=expanded-research` 래퍼가 실수로 시작되어 즉시 중단함. Telegram 실패 알림 1건이 전송되었으나 정기 수집 실패가 아니며, research 프로필은 저장 금지 프롬프트라 DB/Storage 쓰기 없이 웹 조사 단계에서 종료됨.
- **개선 필요**: 수동 검증 시 `source scripts/run-ingestion.sh` 금지. dry-run 검증은 `node scripts/test-ingestion-standards.mjs`, `bash -n scripts/run-ingestion.sh`, `getAutomationSourceList(...)` 출력 확인으로만 수행.
- **수집 목록**: 없음

### 2026-05-21 15:15 실행 (스윙스캔들 최우선 수집)
- **신규 수집**: 2건 (스윙스캔들 5/21 목요소셜, 5/23 토요소셜)
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 사용자 요청에 따라 스윙스캔들 네이버 카페 게시글을 최우선으로 선 수집함.
- **개선 필요**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-21 | 스윙스캔들 목요소셜 DJ 스톰 | 소셜 | DJ 스톰 |
  | 2026-05-23 | 스윙스캔들 토요소셜 DJ 이정 | 소셜 | DJ 이정 |


### 2026-05-19 00:30 실행 (스윙이벤트 수집 - Instagram & Naver Cafe)
- **신규 수집**: 6건 (해피홀, 스윙타임, 봉천살롱, 경성홀, 스윙타운)
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 사용자 요청에 따라 `meroniswing.com`은 수집 대상에서 완전히 제외 처리함.
- **개선 필요**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-19 | 경성홀 화요 소셜 | 소셜 | DJ 비비비 |
  | 2026-05-19 | 스윙타운 화요소셜 DJ 미우 | 소셜 | DJ 미우 |
  | 2026-05-20 | 스윙타임빠 수요 소셜 | 소셜 | DJ 서로비 |
  | 2026-05-22 | 금햅 (Friday Happy Hall Social) | 소셜 | DJ 나나씨 |
  | 2026-05-23 | 스윙타운 토요소셜 DJ 아드리안 | 소셜 | DJ 아드리안 |
  | 2026-05-28 | 서울 발보아 클럽 오픈 파티 | 파티/행사 | DJ 비비비 |


### 2026-05-16 02:15 실행 (스윙스캔들 과거 데이터 및 누락분 추가 수집)
- **신규 수집**: 2건 (스윙스캔들 5/14 목요소셜, 5/16 토요소셜)
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 사용자 요청에 따라 과거 데이터(5/14)를 예외적으로 수집 완료. 스캔들 네이버 카페의 누락된 토요소셜 정보도 추가 확보.
- **개선 필요**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-14 | 스윙스캔들 목요소셜 | 소셜 | DJ 루비 |
  | 2026-05-16 | 스윙스캔들 토요소셜 | 소셜 | DJ 탁 |
  | 2026-05-16 | SNL JAZZ SOCIAL | 소셜 | DJ 째, 가츠 |
  | 2026-05-16 | [스윙스캔들] 101회 지터벅 강습 | 강습 | 유기, 에펠 |
  | 2026-05-16 | 스윙타운 토요 소셜 | 소셜 | DJ 러블리 |
  | 2026-05-16 | 스윙타운 5/6월 정규 강습 | 강습 | - |
  | 2026-05-16 | [스위티스윙] 106기 신규 강습 | 강습 | - |
  | 2026-05-17 | Just 10 minutes (공연) | 파티/행사 | - |




### 2026-05-08 14:50 실행
- **신규 수집**: 0건
- **중복 스킵**: 다수 (해피홀, 봉천살롱, 경성홀, 스윙타운 등 기존 이미 수집됨)
- **접근 불가**: luna_swingbar(계정 없음), bebopbar_swing(계정 없음), dialogue_swing(계정 없음), 243_swingbar(계정 없음), asurajang_swing(계정 없음), sosyalclub_swing(미확인), swingit_seoul(계정 없음), lq_studio_swing(미확인), swingfactory_kr(계정 없음), gangnam_westies(계정 없음), swingkids_kr(계정 없음), allaboutswing_kr(계정 없음), inthemood_sillim(계정 없음), batswing.co.kr(SSL 오류), 스위티스윙 다음카페(렌더링 실패), 스윙홀릭(5월 일정 미게시)
- **이슈**: Static Collection List의 다수 Instagram 계정이 "페이지를 찾을 수 없습니다" — 계정 비활성화 또는 핸들 변경 가능성 높음. 목록 전면 업데이트 필요.
- **개선 필요**: 접근 불가 계정 핸들 재확인 및 Static Collection List 업데이트. 피에스타 월요 발보아 소셜 이미지에서 5월 날짜 확인 필요.
- **수집 목록**: 없음 (신규 0건)

---

### 2026-05-08 14:00 실행
- **신규 수집**: 4건
- **중복 스킵**: 다수 (5/9-5/10 기존 이벤트들)
- **접근 불가**: bebopbar_swing(계정 없음), allaboutswing_kr(계정 없음), gangnam_westies(계정 없음), swingit_seoul(계정 없음), swingfactory_kr(계정 없음), inthemood_sillim(계정 없음), swingkids_kr(계정 없음 → swingkids_ 로 확인), batswing.co.kr(DNS 오류), 다음카페 스위티스윙(iframe 렌더링 실패), 스윙스캔들 개별 게시글(로그인 필요)
- **이슈**: 여러 Instagram 계정이 "페이지를 찾을 수 없습니다"로 나타남. 계정 비활성화 또는 URL 변경 가능성. 스윙키즈는 swingkids_ 로 접근 가능 확인.
- **개선 필요**: 비활성 Instagram 계정 목록 업데이트 필요
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-09 | 스윙타운 토요 소셜 | 소셜 | DJ 나나씨 |
  | 2026-05-22 | 견우&뽈의 슬로우린디 강습 Part 1 | 강습 | 견우, 뽈 |
  | 2026-06-01 | 다이나믹 발보아 초급 강습 (라디앙&소피아) | 강습 | 라디앙, 소피아 |
  | 2026-06-13 | 갤러리 스윙 재즈 소셜 (개츠비의 밤) | 파티/행사 | 라이브 재즈 밴드 |

---

### 2026-05-06 08:10 실행
- **신규 수집**: 0건
- **중복 스킵**: 0건
- **과거 데이터 정리**: 3건 삭제
- **접근 불가**: Instagram 전체(로그인 리다이렉트), batswing.co.kr(DNS 오류), 네이버 카페 세부 포스트(cross-origin iframe/로그인 필요), 다음 카페 특강 게시판(로그인 필요)
- **이슈**: 스윙스캔들 목록에서 "[행사][5/9] 스윙스캔들 💯회 졸업 파티" 공지 확인했으나 포스터 이미지 URL 추출 불가(iframe cross-origin). 이미지 없으면 삽입 금지 규칙 적용.
- **수집 목록**: 없음

---

### 2026-05-05 08:10 실행
- **신규 수집**: 4건
- **중복 스킵**: 0건
- **접근 불가**: Instagram 전체(로그인 리다이렉트), 네이버 카페 전체(로그인 필요), batswing.co.kr(크롬 탭 에러), Facebook 대부분(로그인 필요 - 경성홀/스윙프렌즈/스윙타임빠만 비로그인 접근 가능)
- **이슈**: 경성홀은 이번주 신규 포스트 없음(주초 게시 패턴, 5/9-5/10 미게시). 5/9 이후 이벤트는 다음 수집 회차에서 수집 예정.
- **개선 필요**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-06 | 스윙타임빠 수요 소셜 | 소셜 | DJ 쓴귤 |
  | 2026-05-31 | 스윙타임빠 토요 소셜 | 소셜 | DJ 파인 |
  | 2026-06-01 | 스윙타임빠 일요 소셜 (HAA Music & Dance) | 소셜 | DJ 신씨네 음악가게, TC, 조이스, 은갱, 다시 |
  | 2026-06-07 | 스윙프렌즈 솔로째즈 강습 - 우엉스크램블 | 강습 | 우엉 |

---

### 2026-05-04 20:42 실행
- **신규 수집**: 2건
- **중복 스킵**: 17건 (기존 DB 이벤트)
- **접근 불가**: Instagram 전체(로그인 필요), 네이버카페 전체(로그인 필요), batswing.co.kr(SSL오류), Facebook 대부분 페이지(로그인 필요)
- **이슈**: Instagram 완전 차단 지속. Facebook 공개 페이지 일부에서 최신 이벤트 수집 성공.
- **개선 필요**: 경성홀, 박쥐스윙 Facebook 페이지는 비로그인 공개 접근 가능 - 지속 모니터링 필요
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-05 | 경성홀 어린이날 소셜 | 소셜 | DJ 아드리안 |
  | 2026-05-09 | 박쥐스윙 소셜 @ 인더무드신림 | 소셜 | DJ 다카포 |

---

### 2026-05-04 20:30 실행
- **신규 수집**: 4건 (경성홀 어린이날 소셜은 5/2 기수집으로 중복)
- **중복 스킵**: 1건
- **접근 불가**: bebopbar_swing(프로필이용불가), savoiballroom(프로필이용불가), luna_swingbar(프로필이용불가), inthemood_sillim(프로필이용불가), mayan_swing(프로필이용불가), dialogue_swing(프로필이용불가), 243_swingbar(프로필이용불가), asurajang_swing(프로필이용불가), sosyalclub_swing(프로필이용불가), swingit_seoul(프로필이용불가), spa_swingdance(프로필이용불가), lq_studio_swing(로그인필요), tamnahall(로그인필요), kpdancehall(프로필이용불가), stepupdance_swing(프로필이용불가), allaboutswing_kr(프로필이용불가), gangnam_westies(프로필이용불가), swingkids_kr(프로필이용불가), swingfactory_kr(프로필이용불가), swingholic(로그인필요), campswingit(로그인필요), badaje_jeju(프로필이용불가), busan_lindy_weekend(프로필이용불가), seoulindyfest(프로필이용불가), 네이버카페 전체(로그인필요), batswing.co.kr(DNS오류), 다음카페 스위티스윙(iframe/로그인필요)
- **이슈**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-05 | 봉천살롱 어(른)린이날 소셜 | 소셜 | DJ 후안 |
  | 2026-05-09 | 봉천살롱 토봉 소셜 | 소셜 | DJ 나나씨 |
  | 2026-05-09 | SNL JAZZ SOCIAL (해피홀) | 소셜 | DJ 휘향, DJ 정양 |
  | 2026-09-11 | Rockin' & Swingin' Festival 2026 | 페스티벌 | - |

---

### 2026-05-02 17:15 실행
- **신규 수집**: 7건 (대형 페스티벌/연합행사 위주)
- **중복 스킵**: 0건
- **접근 불가**: 모든 Instagram 계정(로그인 리다이렉트), Daum 카페 스위티스윙(게시글 직접 접근 불가), 네이버 카페 전체(로그인 필요), batswing.co.kr(SSL오류)
- **이슈**: Instagram 전체 계정이 비로그인 상태에서 로그인 페이지로 리다이렉트됨. WebFetch, WebSearch, DanceAtlas, 공식 웹사이트로 대체 수집.
- **개선 필요**: Instagram 비로그인 접근이 완전 차단됨. WebSearch + 공식 이벤트 사이트 위주 전략으로 전환 필요.
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-28 | Seoul Blues Dance Festival 2026 | 파티/행사 | Damon Stone, Kelsy Stone, Dan Repsch |
  | 2026-06-05 | PULSE IN SEOUL 2026 | 파티/행사 | 서효상과 핫한 녀석들 (라이브) |
  | 2026-09-03 | Korea Westival 2026 10th Anniversary | 파티/행사 | Kyle Redd, Sarah Vann Drake 외 |
  | 2026-09-18 | Bal & Hop 2026 | 파티/행사 | - |
  | 2026-10-08 | Seoul Lindyfest 2026 | 파티/행사 | - |
  | 2026-10-23 | Jeju Swing Camp 2026 | 파티/행사 | - |
  | 2026-11-13 | Korea Balboa Weekend 2026 | 파티/행사 | - |

---

### 2026-05-02 16:30 실행
- **신규 수집**: 6건 (네오스윙 139기 강습 4건 + 스윙타임바 소셜 2건 신규 이미지)
- **중복 스킵**: 기존 스윙타임바 수집분과 중복 없음 (신규 DJ 정보 포함 저장)
- **접근 불가**: fiesta_swingdance(로그인필요), bongcheonsalon(로그인필요), bebopbar_swing(프로필이용불가), savoiballroom(프로필이용불가), luna_swingbar(프로필이용불가), inthemood_sillim(프로필이용불가), mayan_swing(프로필이용불가), dialogue_swing(프로필이용불가), 243_swingbar(프로필이용불가), asurajang_swing(프로필이용불가), sosyalclub_swing(프로필이용불가), swingit_seoul(프로필이용불가), spa_swingdance(프로필이용불가), lq_studio_swing(프로필이용불가), tamnahall(로그인필요), kpdancehall(프로필이용불가), stepupdance_swing(프로필이용불가), allaboutswing_kr(프로필이용불가), kyungsunghall(로그인필요), gangnam_westies(프로필이용불가), swingkids_kr(프로필이용불가), swingfactory_kr(프로필이용불가), swingholic(로그인필요), campswingit(로그인필요), badaje_jeju(프로필이용불가), busan_lindy_weekend(프로필이용불가), seoulindyfest(프로필이용불가), 네이버카페(로그인필요)
- **이슈**: Instagram 비로그인 접근 가능 계정이 해피홀, 스윙타임바, 네오스윙만으로 극히 제한됨. 접근 가능 계정에서 최대한 수집.
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-10 | 네오스윙 139기 지터벅 강습 | 강습 | 마초, 호피 |
  | 2026-05-10 | 네오스윙 139기 린디합 입문 강습 | 강습 | 현, 제이 |
  | 2026-05-10 | 네오스윙 139기 린디합 초중급 강습 | 강습 | 네드, 신지 |
  | 2026-05-10 | 네오스윙 139기 베이직 & 베이직 플러스 강습 | 강습 | 제리, 빨강구두 |
  | 2026-05-02 | 스윙타임빠 토요 소셜 | 소셜 | 나나씨 |
  | 2026-05-03 | 스윙타임빠 일요 소셜 | 소셜 | 든 |

---

### 2026-05-02 16:02 실행
- **신규 수집**: 6건
- **중복 스킵**: 0건
- **접근 불가**: 비밥바(프로필 이용불가), 사보이볼룸(프로필 이용불가), 루나(프로필 이용불가), 인더무드신림(프로필 이용불가), 마얀(프로필 이용불가), Dialogue(프로필 이용불가), 243(프로필 이용불가), 아수라장(프로필 이용불가), 쏘셜클럽(프로필 이용불가), 스윙잇(프로필 이용불가), 스파(프로필 이용불가), LQ스튜디오(프로필 이용불가), KP댄스홀(프로필 이용불가), 올어바웃스윙(프로필 이용불가), 강남웨스티스(프로필 이용불가), 스윙키즈(프로필 이용불가), 스윙팩토리(프로필 이용불가), 바다제(프로필 이용불가), 부산린디(프로필 이용불가), 서울린디페스트(프로필 이용불가), batswing.co.kr(SSL오류), 스위티스윙(iframe 구조로 이미지 접근불가), 네이버카페 스윙스캔들/스윙프렌즈/스윙타운/스윙패밀리(이미지 접근불가-로그인필요)
- **이슈**:
  - Instagram "Profile을 이용할 수 없습니다" 오류 다수 계정에서 발생. 비로그인 상태 제약 심화로 보임
  - 네이버 카페는 게시글 목록 접근 가능하나 본문 이미지는 로그인 필요
  - batswing.co.kr SSL 인증서 오류 (ERR_SSL_VERSION_OR_CIPHER_MISMATCH)
- **개선 필요**:
  - Instagram 접근 가능 계정(해피홀, 스윙타임, 피에스타, 봉천살롱, 탐나홀, 경성홀, 스윙홀릭, CSI)은 정상 수집됨
  - 접근 불가 계정들은 Instagram 정책 변화로 인한 것 가능성 높음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-02 | 스윙타임빠 토요 소셜 | 소셜 | 나나씨 |
  | 2026-05-03 | 스윙타임빠 일요 소셜 | 소셜 | 든 |
  | 2026-05-03 | 피에스타 스페셜 워크샵 - 나나씨와 스윙댄스의 근본 | 강습 | 나나씨 |
  | 2026-05-02 | 봉천살롱 비어소셜 나이트 | 파티/행사 | 안단테, 러블리 |
  | 2026-05-02 | 경성홀 토요 소셜 | 소셜 | 제니스 |
  | 2026-05-05 | 경성어린이날 - 워크숍+소셜 | 파티/행사 | 아드리안 |

---

### 2026-04-30 06:10 실행 (중복방지 로직 테스트 — 3개 소스)
- **신규 수집**: 1건
- **중복 스킵**: 0건 (기존 동일 이벤트 없음)
- **접근 불가**: 스윙타임(로그인리다이렉트), 피에스타(로그인리다이렉트)
- **이슈**:
  - Instagram Chrome CDP 세션 여전히 만료 상태. 네이버 카페는 정상 접근 가능.
  - 결정론적 ID 생성 검증 완료: `1c9381cc44b053b5` (16자리 hex) ✅
  - 동일 ID 재삽입 시 `[]` 반환 확인 (중복 스킵 정상 작동) ✅
- **개선 필요**:
  - Instagram Chrome CDP 로그인 세션 재구축 필요 (매번 세션 만료)
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-04 | 견우&뽈의 린디합 베이직 프라이빗 | 강습 | 견우&뽈 |

---

## 🏗️ 현재 아키텍처

### 구성요소
| 구성 | 경로/내용 | 상태 |
|------|-----------|------|
| LaunchAgent plist | `/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.codex-ingestion.plist` | ✅ 로드됨 (매일 08:00) |
| 실행 스크립트 | `/Users/inteyeo/scripts/run-ingestion.sh` | ✅ Codex 실행 + watchdog + cleanup 로그 |
| 수집 스킬 | `/Users/inteyeo/Rhythmjoy2025555-5/.agents/skills/web-search-ingestion/SKILL.md` | ✅ 존재 |
| 실행 로그 | `/Users/inteyeo/claude_ingestion.log` | ✅ 기록 중 |
| 데이터 저장소 | Supabase `scraped_events` 테이블 (REST API) | ✅ 정상 |

### 실행 흐름
```
LaunchAgent (매일 08:00)
→ run-ingestion.sh
  → Telegram: 수집 시작 알림
  → Chrome CDP 포트 9222 확인/실행 (headless)
  → cleanup-past-collected.mjs: 과거 완료 데이터 대상 JSON 기록 후 삭제
  → codex --search exec (Web Search Ingestion V2 지침)
    → 인스타그램/네이버카페 스크랩 (Playwright browser → 봇판정 방지)
    → 이미지 Supabase Storage 업로드
    → Netlify scraped-events 함수로 후보 저장/중복 처리
  → Telegram: 수집 완료/실패 알림 (exit code 기반)
```

### Playwright MCP 구성
```bash
claude mcp get playwright
# Scope: Local config (private to you in this project)
# Command: npx @playwright/mcp@latest --cdp-endpoint http://localhost:9222
# Status: ✓ Connected (2026-04-24 확인)
```
- Chrome headless 모드로 CDP 9222 포트에서 실행
- MCP가 CDP endpoint에 연결 → 실제 브라우저 제어 (봇판정 방지 핵심)
- 2026-04-24 18:02 테스트 실행 exit=0 확인

---

## 📊 실행 로그

> 최신 회차가 맨 위. 수집 완료 시마다 SKILL.md 지시에 따라 자동 갱신됨.

---

### 2026-04-30 05:30 실행
- **신규 수집**: 3건
- **중복 스킵**: 1건 (해피홀 노동절 소셜 — 이미 DB 존재)
- **접근 불가**: 봉천살롱(로그인리다이렉트), 피에스타(로그인리다이렉트), 루나(로그인리다이렉트), 인더무드신림(로그인리다이렉트), 마얀(로그인리다이렉트), Dialogue(로그인리다이렉트), 243(로그인리다이렉트), 아수라장(로그인리다이렉트), 쏘셜클럽(로그인리다이렉트), 스윙잇(로그인리다이렉트), 스파(로그인리다이렉트), LQ스튜디오(로그인리다이렉트), 탐나홀(로그인리다이렉트), KP댄스홀(로그인리다이렉트), 올어바웃스윙(로그인리다이렉트), 경성홀(로그인리다이렉트), 강남웨스티스(로그인리다이렉트), 스윙키즈(로그인리다이렉트), 스윙팩토리(로그인리다이렉트), 스윙홀릭(로그인리다이렉트), CSI(로그인리다이렉트), 바다제(로그인리다이렉트), 부산린디합위켄드(로그인리다이렉트), 서울린디페스트(로그인리다이렉트), 비밥바(로그인리다이렉트), 사보이볼룸(로그인리다이렉트), batswing.co.kr(DNS오류), 네이버카페 게시물 본문(로그인 없이 읽기 불가)
- **이슈**:
  - Instagram 세션 쿠키 만료 — 초반에 happyhall2004, swingtimebar만 접근 가능했고, 이후 전체 Instagram 로그인 리다이렉트 발생. Chrome CDP 세션의 Instagram 로그인 상태가 유지되지 않음.
  - 네이버 카페 개별 게시물 본문은 비로그인 상태에서 읽을 수 없음 (목록만 확인 가능)
  - 다음 카페 스위티스윙 트레이닝 8기 강습은 모바일 버전으로 접근 성공, 수집 완료
- **개선 필요**:
  - Instagram Chrome CDP에 로그인 세션 유지 방법 구축 필요 (현재 세션 만료 주기가 불규칙함)
  - 다음 회차 시작 전 Instagram 로그인 상태 확인 로직 추가 필요
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-05-02 | 스윙타임 토요 소셜 | 소셜 | 나나씨 |
  | 2026-05-03 | 스윙타임 일요 소셜 | 소셜 | 든 |
  | 2026-05-16 | 스위티스윙 스위블 트레이닝 8기 | 강습 | 팔뤄 재재 |

---

### 2026-04-29 21:50 실행
- **신규 수집**: 8건
- **중복 스킵**: 3건 (해피홀 5/1·봉천살롱 5/2 이미 is_collected=true, 나나씨 강습 이중 포스트)
- **접근 불가**: 비밥바(Profile없음), 사보이볼룸(Profile없음), 루나(Profile없음), 인더무드신림(Profile없음), 마얀(Profile없음), Dialogue(Profile없음), 243(Profile없음), 아수라장(Profile없음), 쏘셜클럽(Profile없음), 스윙잇서울(Profile없음), 올어바웃스윙(Profile없음), 강남웨스티스(Profile없음), 스윙키즈(Profile없음), 스윙팩토리(Profile없음), KP댄스홀(Profile없음), 탐나홀(로그인필요), batswing.co.kr(DNS오류), 스위티스윙 특강게시판(정회원전용)
- **이슈**:
  - 스윙스캔들 5/9 졸파티 — 게시글 접근 시 페이지 리다이렉트 오류, 수집 불가
  - 문탄+이화 Monthly Jazz / 린디랩 Vol.5 DB에 중복 2건씩 존재 (이전 회차 수집분 포함) — 인제스터에서 중복 처리 필요
- **개선 필요**:
  - 비공개/삭제된 Instagram 계정 URL 전면 재정비 (18개 이상)
  - 스윙스캔들 졸파티 페이지 접근 방식 재검토
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-30 | 스윙스캔들 목요소셜 | 소셜 | 테일 |
  | 2026-05-02 | 스윙스캔들 토요소셜 | 소셜 | 민 |
  | 2026-05-03 | 피에스타 Nanassi 강습 | 강습 | Nanassi |
  | 2026-05-04 | 피에스타 월요 발보아 소셜 | 소셜 | - |
  | 2026-05-04 | 문탄+이화 Monthly Jazz 5월 | 강습 | 문탄, 이화 |
  | 2026-05-07 | 솔로재즈 3주 과정 (Rico) | 강습 | Rico |
  | 2026-05-11 | 린디랩 Vol.5 - Close Connection | 강습 | 한보&은댕 |
  | 2026-06-05 | 펄스인서울2026 - Javi & Lucia | 파티/행사 | Javi & Lucia |

---

### 2026-04-27 16:55 실행 (스윙프렌즈 타임바 게시판)
- **신규 수집**: 0건
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 미래 이벤트 포스트 없음. 소셜 공지 마지막이 4/23~25(과거), 105기 강습 시작일 4/18(과거). 다음 수요일 소셜 공지 아직 미게시.

---

### 2026-04-27 16:51 실행 (스윙타운 카페 단독)
- **신규 수집**: 2건
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-28 | 스윙타운 소셜 DJ 데미안 | 소셜 | 데미안 |
  | 2026-05-09 | 스윙타운 5/6월 정규 강습 | 강습 | 도도&화초, 주니어&헤네시, 붐바스틱&클라라, 진&루비 |

---

### 2026-04-27 16:22 실행
- **신규 수집**: 3건
- **중복 스킵**: 6건 (SNL Jazz Social 5/9·5/16·5/30·6/13, 피에스타 5/3 워크샵, 경성홀 5/5)
- **접근 불가**: 봉천살롱(Profile없음), 비밥바(Profile없음), 사보이볼룸(Profile없음), 루나(Profile없음), 인더무드신림(Profile없음), 마얀(Profile없음), Dialogue(Profile없음), 243(Profile없음), 아수라장(Profile없음), 쏘셜클럽(Profile없음), 스윙잇서울(Profile없음), 스파(Profile없음), LQ스튜디오(Profile없음), KP댄스홀(Profile없음), 스탭업댄스(Profile없음), 올어바웃스윙(Profile없음), 강남웨스티스(Profile없음), 스윙키즈(Profile없음), 스윙프렌즈(Profile없음), 스윙팩토리(Profile없음), 스윙타운(Profile없음), 바다제(Profile없음), 부산린디위켄드(Profile없음), 서울린디페스트(Profile없음), BAT SWING(DNS오류), 스위티스윙(렌더링실패), 스윙스캔들카페(게시물 이미지 로그인 필요)
- **이슈**:
  - 스윙스캔들 5/9 졸업파티, 5/16 101회 강습 제목 확인됐으나 이미지 접근 불가 → 수집 규칙상 스킵
  - 스윙패밀리 카페(스윙타운) 펄스인서울2026(6/5~6/7), 5월 솔로재즈 — 게시물 이미지 로그인 필요 → 스킵
  - 피에스타 월요 발보아 소셜 5월 재개 예고 있으나 날짜 미확정 → 스킵
  - RSF 2026 신규 발굴: 9월 개최 예정, 신청 오픈 4/30 (신규 삽입)
- **개선 필요**:
  - 비공개/삭제된 Instagram 계정 URL 정비 (20개 이상)
  - 네이버카페 이미지는 로그인 없이는 접근 불가 — Instagram 계정 병행 수집 권장
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-06-02 (화) | 스윙타임 라이브 밴드 소셜 | 파티/행사 | 라이브 밴드 |
  | 2026-06-12 (금) | 스윙타임 라이브 밴드 소셜 | 파티/행사 | 라이브 밴드 |
  | 2026-09-01 (예정) | RSF 2026 - Rockin' & Swingin' Festival | 파티/행사 | Sakarias, Stephen&Karine |

---

### 2026-04-27 10:57 수동 실행 (전체 소스 순회)
- **신규 수집**: 3건
- **중복 스킵**: 0건
- **접근 불가**: 봉천살롱(Profile없음), 비밥바(Profile없음), 사보이볼룸(Profile없음), 강남웨스티스(Profile없음), 스윙키즈(Profile없음), 올어바웃스윙(Profile없음), 서울린디페스트(Profile없음), 마얀(Profile없음), 스윙잇서울(Profile없음), KP댄스홀(Profile없음), 인더무드신림(Profile없음), 243(Profile없음), 스윙프렌즈(Profile없음), 스윙팩토리(Profile없음), BAT SWING(SSL오류), 스위티스윙Daum카페(렌더링실패), 스윙스캔들카페(로그인필요)
- **이슈**:
  - 과거 데이터 12건 삭제 완료 (is_collected=true & date < 2026-04-27)
  - Instagram 비공개/없는 계정이 14개로 지속. 계정 URL 정비 필요
  - 스윙스캔들 5/9 졸업파티, 5/16 101회 강습 제목 확인했으나 본문/이미지 접근 실패 → 수집 불가
- **개선 필요**:
  - 비공개 계정 URL을 활성 계정으로 교체 (봉천살롱 등)
  - 스윙스캔들 카페 접근 방식 재검토
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-28 (화) | 경성홀 소셜 | 소셜 | Nova |
  | 2026-05-03 (일) | 피에스타 스페셜 워크샵 - 나나씨 | 강습 | 나나씨 |
  | 2026-05-09 (토) | 스윙타운 5/6월 정규 강습 | 강습 | 도도/화초/주니어/헤네시/붐바스틱/클라라/진/루비 |

---

### 2026-04-24 18:15 수동 실행 (전체 소스 순회)
- **신규 수집**: 5건
- **중복 스킵**: 6건 (SNL 재즈소셜 4/25 ×2, April Savoy 4/26, 버니클리닉 4/30, 문탄이화 5/4, 다이나믹 발보아 5/4)
- **접근 불가**: Instagram 전체 프로필 (로그인 리다이렉트), 스윙스캔들 게시글 (로그인 필요), BAT SWING (DNS 오류), 스위티스윙 Daum 카페 (SPA 렌더링 실패)
- **이슈**:
  - Instagram 프로필 페이지 로그인 리다이렉트 지속 (개별 포스트 URL은 접근 가능)
  - 해피홀 5월 수요일 소셜 DJ 미명시 → 수집 규칙상 스킵
- **개선 필요**:
  - 경성홀 등 주요 계정 개별 포스트 URL 직접 접근 방식 고려
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-24 (금) | 해피홀 금요 소셜 (DJ 피터팬) | 소셜 | 피터팬 |
  | 2026-05-04 (월) | 다이나믹 발보아 패턴&스타일링 | 강습 | 라디앙/소피아 |
  | 2026-05-07 (목) | 5월의 솔로재즈 강습 (리코) | 강습 | 리코 |
  | 2026-05-20 (수) | 따끔한 베이직 with 나나씨 | 강습 | 나나씨 |
  | 2026-06-05 (금) | 펄스인서울2026 (Javi & Lucia) | 파티/행사 | Javi & Lucia |

---

### 2026-04-24 18:00 수동 실행 (경성홀 인스타그램 단독 테스트)
- **신규 수집**: 0건
- **중복 스킵**: 2건 (경성홀 어린이날 워크샵/소셜 — 이미 수집됨)
- **접근 불가**: 없음
- **이슈**:
  - 없음
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | (없음 — 기존 데이터 중복) | | | |

---

### 2026-04-24 수동 실행 (스캔들 네이버 카페 단독)
- **신규 수집**: 1건
- **중복 스킵**: 0건
- **접근 방식**: Playwright MCP 불가 → Naver cafe JSON API (`apis.naver.com/cafe-web/cafe2/ArticleListV2.json`) + 이미지 직접 다운로드
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ |
  |------|----------|------|----|
  | 2026-04-25 | 스윙스캔들 토요소셜 | 소셜 | 짜장 |
- **이슈**:
  - 게시글 본문은 CSR로 API 접근 불가 → 썸네일 이미지로 DJ명 확인
  - Playwright MCP 세션 종료 시 네이버 카페 API로 대체 가능

---

### 2026-04-23 09:42 실행
- **신규 수집**: 9건
- **중복 스킵**: 4/22 수소셜, 4/18-19 토/일소셜, DDPlay DDP 4/22, 스윙타운 5/6월 강습 (동일 포스트 중복 태그)
- **접근 불가**: 마얀, sosyalclub_swing, swingfactory_kr, swingtown_kr, gangnam_westies, swingkids_kr, allaboutswing_kr, seoulindyfest, badaje_jeju, busan_lindy_weekend, spa_swingdance, lq_studio_swing, kpdancehall, stepupdance_swing (비공개), batswing.co.kr (SSL 오류), 스윙스캔들/스윙패밀리 네이버카페 (게시글 로그인 필요)
- **이슈**:
  - 비공개 인스타 계정이 더 늘어남 (총 14개 접근 불가)
  - 네이버 카페 이미지는 pstatic CDN 인증 필요 — 브라우저 fetch도 CORS 차단. 스크린샷으로 대체 업로드
- **개선 필요**:
  - 비공개 계정 URL 정비 필요 (새 계정으로 교체 또는 삭제)
  - 네이버 카페 이미지: 브라우저 세션 공유 방식 검토
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-24 (금) | 슬로우잼 소셜 @ 스윙타임바 | 소셜 | 로젤, 휘모리 |
  | 2026-05-05 (화) | 경성홀 어린이날 워크숍 | 강습 | Adrian |
  | 2026-05-02 (토) | 스윙팝 초급반 강습 | 강습 | - |
  | 2026-05-02 (토) | 박쥐스윙 119시즌 Starter LV1 | 강습 | - |
  | 2026-05-02 (토) | 박쥐스윙 119시즌 Walker LV2 | 강습 | - |
  | 2026-05-09 (토) | 스윙타운 린디 엘리 LV.2 (주니어&헤네시) | 강습 | 주니어/헤네시 |
  | 2026-05-09 (토) | 스윙타운 린디 미들 LV.3 (붐바스틱&클라라) | 강습 | 붐바스틱/클라라 |
  | 2026-05-09 (토) | 스윙타운 린디 하이 LV.4 (진&루비) | 강습 | 진/루비 |
  | 2026-05-16 (토) | 스윙타운 린디 킨더 LV.1 (도도&화초) | 강습 | 도도/화초 |

---

### 2026-04-24 수동 수집 (스캔들 목요소셜 과거 데이터)
- **신규 수집**: 1건
- **중복 스킵**: 0건
- **접근 불가**: 없음
- **이슈**: 사용자 요청으로 과거 날짜(2026-04-23) 데이터 예외 수집
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-23 (목) | 스윙스캔들 목요소셜 | 소셜 | 저스틴 |

---

### 2026-04-21 13:33 실행
- **신규 수집**: 2건
- **중복 스킵**: SNL Jazz Social 시즌8 전 회차, DDPlay DDP 4/22, 스윙타임 슬로우잼, 스윙스캔들 101회 강습 (이미 존재)
- **접근 불가**: 봉천살롱, 비밥바, 사보이볼룸, 올어바웃스윙, Dialogue, 243, 아수라장, 스윙잇, 루나, 인더무드신림, KP댄스홀, 스윙키즈, 스윙프렌즈 (비공개 또는 URL 불일치), batswing.co.kr (SSL 오류)
- **이슈**:
  - Instagram 다수 계정 "Profile을 이용할 수 없습니다" 상태 — 비공개 전환 혹은 URL 변경 가능성
- **개선 필요**:
  - 접근 불가 계정 URL 재확인 및 목록 정비 필요
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-21 (화) | 경성홀 화요 소셜 (DJ 스톰) | 소셜 | 스톰 |
  | 2026-05-04 (월) | 문탄+이화 Monthly Jazz 5월 | 강습 | 문탄/이화 |

---

### 2026-04-17 07:08 실행
- **신규 수집**: 3건 (발보아 패턴&스타일링, 봄날의 스윙팍 DDP, 다이나믹 발보아)
- **중복 스킵**: 로빈 JAZZSEASON 솔로재즈, April Savoy Live Night, 린디랩 Vol.5, 시옷x피치봉 버니합 (이미 존재)
- **접근 불가**: Instagram 전체 계정 (로그인 리다이렉트), batswing.co.kr (DNS 오류), 다음카페 스위티스윙 (iframe 구조), 스윙스캔들 네이버카페 (게시글 로그인 필요)
- **이슈**:
  - Instagram 모든 계정이 로그인 페이지로 리다이렉트됨 (로그인 없이 접근 불가)
  - 네이버 카페 게시글 본문은 로그인 없이 접근 불가 (목록만 확인 가능)
  - batswing.co.kr SSL 오류 및 DNS 오류
- **개선 필요**:
  - Instagram 수집 방법 재검토 필요 (공개 계정도 로그인 요구)
  - 네이버 카페는 목록 확인 후 iframe URL 직접 접근 방식으로 일부 가능
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-22 (수) | 봄날의 스윙팍 @ DDP | 파티/행사 | 스윙제리 라이브 밴드 |
  | 2026-05-04 (월) | 다이나믹 발보아 패턴&스타일링 (라디앙&소피아) | 강습 | 라디앙/소피아 |

---

### 2026-04-15 00:10 실행
- **신규 수집**: 10건
- **중복 스킵**: 해피홀 4/17, DDPlay 4/22 DDP, April Savoy Live Night 4/26
- **접근 불가**: 봉천살롱, 비밥바, 사보이볼룸, 루나, 인더무드신림 (비공개/URL 불일치)
- **이슈**:
  - `API Error: Stream idle timeout - partial response received` x2 발생
  - 수집 자체는 완료됨 (stream timeout 후에도 claude가 재시도)
- **개선 필요**:
  - 소스가 너무 많아 한 세션에서 순회 시 timeout 발생. 배치 분할 고려.
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | 2026-04-18 (토) | 스윙타임바 소셜 | 소셜 | DJ 홍 |
  | 2026-04-19 (일) | 스윙타임바 소셜 | 소셜 | DJ 비비비 |
  | 2026-04-18 (토) | 스윙스캔들 토요소셜 @ 사보이볼룸 | 소셜 | DJ 탁이 |
  | 2026-04-24 (금) | 스윙타임바 슬로우잼 Q2 | 파티/행사 | 추후 공지 |
  | 2026-05-15 (금) | 스윙타임바 슬로우잼 Q2 | 파티/행사 | - |
  | 2026-06-02 (화) | 스윙타임바 슬로우잼 Q2 | 파티/행사 | - |
  | 2026-06-12 (금) | 스윙타임바 슬로우잼 Q2 | 파티/행사 | - |
  | 2026-04-20 (월~) | 로빈 JAZZSEASON 솔로재즈 루틴 클래스 | 강습 | 로빈 |
  | 2026-04-27 (월~) | 시옷x피치봉 버니합 팀 강습 | 강습 | 시옷/피치봉 |
  | 2026-05-11 (월) | 한보&은댕 린디랩 Vol.5 - Close Connection | 강습 | 한보/은댕 |

---

### 2026-04-14 00:00 실행
- **신규 수집**: 0건 (rate limit으로 실행 불가)
- **이슈**:
  - `You've hit your limit · resets 3am (Asia/Seoul)` — 자정 실행이 API 한도와 겹침
- **개선 필요**: 스케줄을 오전으로 변경 → **2026-04-17 오전 10시로 수정 완료**

---

## ✅ 변경 이력

### 2026-04-24 — run-ingestion.sh 복구 (claude -p 방식)
- **변경 전**: `node scrape-events-v2.mjs` 호출 → 파일 없어서 매일 exit=1 실패
- **변경 후**: `claude -p "/web-search-ingestion" --allowedTools` (Playwright MCP 포함)
- **이유**: Playwright MCP 필수 — 실제 브라우저로 접근해야 봇판정 없음
- **Telegram 알림**: 시작/완료 양쪽 전송 (JSON body 방식으로 수정)
- **테스트 결과**: 2026-04-24 18:02~18:17 exit=0, 신규 5건 수집 확인

### 이전 — 스케줄 변경: 자정 → 오전 8시
- **변경 전**: `Hour=0` (자정) → Claude API rate limit 초과
- **변경 후**: `Hour=8` (오전 8시) — 현재 plist 설정

---

## 🚨 잔존 문제 (날짜별 기록)

### ❌ [영구 불가] Instagram 비로그인 접근
- **최초 확인**: 2026-04-17
- **현상**: 공개 계정도 로그인 페이지 리다이렉트 — 세션마다 다름
- **2026-04-24 상태**: 전체 인스타 프로필 접근 불가 (로그인 리다이렉트)
- **2026-04-30 상태**: 수집 초반 happyhall2004·swingtimebar 2개만 접근 가능 (이전 세션 쿠키 잔존), 이후 전체 로그인 리다이렉트 전환됨. Instagram 세션 쿠키 수명이 매우 짧음(수 시간 이내).
- **대응**: 수집 시 자동 스킵. 접근 가능한 계정은 즉시 수집. Chrome CDP 로그인 세션 유지 방안 별도 검토 필요.

### ❌ [영구 불가] BAT SWING (batswing.co.kr) DNS/SSL 오류
- **최초 확인**: 2026-04-17
- **현상**: 사이트 자체가 죽어있음
- **대응**: 수집 시 자동 스킵

### ✅ [해결됨] 스위티스윙 Daum 카페
- **최초 확인**: 2026-04-24
- **현상**: SPA 구조로 Playwright 렌더링 실패, iframe 차단
- **2026-04-30 해결**: `m.cafe.daum.net` 모바일 URL로 접근 시 iframe 없이 직접 목록/게시물 렌더링됨. 트레이닝 8기 강습 수집 성공.
- **대응**: 이후 `m.cafe.daum.net/sweetyswing/5ngW` 형식으로 접근할 것.

### ⚠️ [간헐적] Stream idle timeout
- **최초 확인**: 2026-04-15
- **현상**: `API Error: Stream idle timeout` — 전체 소스 순회 시 발생
- **2026-04-24 상태**: 발생 안함 (16분 내 완료)
- **대응**: 현재는 양호. 재발 시 소스 배치 분할 고려.

---

## 🔧 현재 파일 요약

### `/Users/inteyeo/scripts/run-ingestion.sh`
- Telegram 시작 알림 → Chrome CDP 확인/실행 → `claude -p "/web-search-ingestion"` → Telegram 완료/실패 알림
- `--allowedTools`: Bash, Read/Write/Edit/Glob/Grep, WebFetch/WebSearch, mcp__playwright__browser_* 전체

### `/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.claude-ingestion.plist`
- 실행: `/bin/bash /Users/inteyeo/scripts/run-ingestion.sh`
- 스케줄: **매일 오전 08:00**
- 로그: `/Users/inteyeo/claude_ingestion.log`
- 상태: `launchctl list | grep rhythmjoy` → 로드 확인됨

### 로그 확인 명령
```bash
tail -50 /Users/inteyeo/claude_ingestion.log
```
