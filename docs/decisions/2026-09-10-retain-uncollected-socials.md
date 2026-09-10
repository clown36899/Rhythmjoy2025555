# 미수집 정규 소셜 보존과 수집 실패 재시도

- 날짜: 2026-09-10
- 상태: 구현·검증, 서버 배포 전. 로컬 실행기 연결 적용.
- 대체: 2026-07-26 롤링 캘린더 및 2026-08-23 휴무 가시화 결정의 지난 일반 생성본 삭제 정책.

## 결정

수집 여부와 날짜 경과를 캘린더 삭제 근거로 사용하지 않는다. 기존 과거 생성본은 규칙이 종료돼도 역사적 내용 그대로 보존한다. 실제 등록 일정의 기본 생성본 대체, 미래 규칙 유효기간 및 휴무 표시 우선순위는 유지한다. 이미 사라진 과거 회차는 현재 반복 규칙으로 추정 복원하지 않는다.

기존 collection-registry의 sourceId→URL을 정규 규칙에 연결해 events.link1/link_name1과 기존 상세 바로가기를 재사용한다. 휴무 원문·공식 API override 링크를 우선한다. 남아 있는 과거 생성본은 기존 링크가 없을 때만 수집 위치를 보완한다. 날짜·DJ·장소·포스터를 바꾸지 않는다. 같은 ID의 갱신은 기존 저장기의 upsert를 이용하고, 저장 성공 후 대체되지 않는 오래된 행만 정리한다.

접근 실패 소스를 기존 remainingSources에 남겨 다음 예약이 우선 재시도하게 한다. 접근 실패가 있는 Instagram 소스는 완료 게시물 체크포인트를 전진시키지 않는다. 후보 근거 검증과 로그인 차단 안전장치는 유지한다.

예약이 동시에 시작되면 기존 단일 잠금이 풀릴 때까지 최대 120분 기다린다. 잠금 책임을 추가하지 않고 설치된 실행기의 acquire_lock 구현을 scripts/ingestion/run-lock.sh로 옮겼다. /Users/inteyeo/scripts/run-ingestion.sh는 이를 source하고 획득 실패 시 종료한다. 살아 있는 프로세스의 잠금은 오래됐어도 빼앗지 않는다. 새 DB·큐·상태값·예약은 없다.

## 최초 로컬 수정 당시 적용·복구 경계 (아래 배포 후속 기록으로 갱신됨)

로컬 실행기 연결은 적용되어 다음 예약부터 읽는다. 이미 실행 중인 프로세스와 놓친 예약은 자동 재시작하지 않았다. 서버 변경은 배포되지 않아 운영 캘린더에는 기존 삭제 정책이 남아 있다. 설치 실행기의 변경 전 사본은 /tmp/rhythmjoy-run-ingestion-before-20260910.sh에 보관했다. 로컬 롤백은 해당 실행기 사본 복구, 코드 롤백은 관련 변경 되돌리기다. 미수집 과거 일정이 보존되면 저장량은 누적되지만 수집 원장 및 외부 API 스키마 마이그레이션은 없다.

## 검증

정규 소셜·외부 API·저장 실패/건조 실행 회귀, 기존 수집 표준, Node 잠금·자동등록 보고 검사, Cafe24 빌드를 수행했다. 운영 공개 /api/events 응답 1,000건 중 정규 생성본 89건, 링크 없음 85건을 읽기 전용 확인했다. 응답에 한도가 있고 공식 예외 원장을 함께 읽지 않았으므로 전체 운영 조정 건수로 해석하지 않는다. 실수집 재실행·운영 DB 수정·과거 추정 복구·배포는 수행하지 않았다. Instagram 로그인 제한이나 PC 중단 자체는 이 변경으로 해소되지 않는다.

## Deployment and recovery follow-up

- Deployment follow-up (2026-09-10): user authorized deployment and recovery of Sep 7–10. Commit 10e7a762 was pushed before deployment; health/version 1789018114603 verified. Production reconciliation: creates=0, removes=0, retained=197. Two Sep 9 socials (Chori at Social Club, Yoonseul at Swingtime) restored through existing administrator candidate/registration APIs with official source images. Normal automatic future-only filtering remains unchanged.
- Additional root cause: the legacy document fallback (71723533c) and direct-media URL preference (fe2b77c) admitted recommended post images and alt text. Moved the existing document reader to readInstagramPostDocument and excluded media linked to another post. Original media, hidden carousel slides and legacy article scope are preserved. Two DOM regression tests, ingestion standards and lint passed; the live Kyungsung post retained its original image and rejected six recommendations.

## 2026-09-10 재수집 최종 검증과 날짜 해석 보완

- 증상 → 판정 → 부작용 → 결과: 공식 9/9 소셜의 신청 마감 문구 ‘9월 8일 23시’ → 구분자가 선택 사항인 일자 목록 정규식이 23을 날짜로 해석 → AI 근거 검사와 서버 등록 검사도 같은 구문 허용 → 9/23 잘못된 후보 생성. 정확한 원문 단독 재수집(저장 없는 검사)에서 재현했다.
- 기존 구현 일부 있음: d61966c87의 날짜 추출과 fe2b77c68의 압축된 복수 날짜 근거 지원이 원래 목적이다. 기존 세 계층의 구문을 고쳐 다음 날짜 앞에는 구분자를 요구하며, 완전성 검사에는 이미 있는 신청 마감일 제외 함수를 연결했다. 새 필드·큐·저장 구조는 없다. 복수 날짜·상속 월·휴무 제외·등록 전 근거 검증을 유지한다.
- 관련 등록/AI 검사 65건, 기존 수집 표준과 신청 마감 경계 확장, lint 통과. 무관한 UI/미디어 작업은 포함하지 않았다.
- 운영 복구: 공식 원문과 이미지 확인 후 기존 관리자 수집 후보/등록 API로 9/8 경성홀 아드리안, 봉천살롱 안토니와 9/9 소셜클럽 쵸리, 스윙타임 윤슬 총 4건 복구. 9/10 스윙스캔들 굼바 기존 등록 유지. 확인한 공식 소스 9곳에서 9/7 소셜 공지는 발견되지 않았다. 과거 수동 복구만 허용하고 정상 자동 수집 미래 날짜 정책은 유지했다.
- 공개 주간 API·실제 캘린더에 위 5건 표시, 이미지 5건 HTTP 200. 운영 조정 dry-run retained=197, creates=0, removes=0, 기본 소셜 누락 링크=0, 다음날 기준 과거 삭제=0. 이미 삭제되어 원문 근거가 없는 과거 행을 추정 생성하지 않았다.

- 최종 실제 원문 단독 수집 검증: 발견 1 / 후보 1 / 기대 1 / 준비 1 / 누락 0 / 차단 0, 저장 없는 실행 성공. 9/9만 남고 신청 마감 9/8과 시각 오인식 9/23이 제거됨.

- 배포 완료: f6b8dd25를 origin/codex/social-retention-recovery-20260910에 푸시 후 Cafe24 배포. 운영 health 정상, version buildTime=1789019537895 확인. 배포 직후 복구 4건 및 목요일 기존 1건 공개 API·이미지 HTTP 200 재확인.
- 동일 날짜 오인식으로 생성된 9/23 중복 2건을 읽기 전용 조사: 원문과 동일한 정상 9/2·9/9 이벤트가 이미 존재함을 확인. 기존 관리자 API로 잘못된 후보를 제외 처리하고, 이미지 연결을 해제한 뒤 잘못된 중복 이벤트만 정정했다(삭제 이미지 0). 원장/정상 이벤트/이미지 백업·보존. 기존 조정기가 9/23 기본 소셜과 수집 위치 링크를 다시 생성했고 공개 API 확인. 미수집 기본 일정의 자동 삭제와는 별개인 근거 확인된 오등록 정정이다. 복구 전 원장은 운영 임시 백업 /tmp/social-date-correction-before.json에 보관했다.
