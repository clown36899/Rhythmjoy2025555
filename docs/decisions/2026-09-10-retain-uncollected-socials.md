# 미수집 정규 소셜 보존과 수집 실패 재시도

- 날짜: 2026-09-10
- 상태: 구현·검증, 서버 배포 전. 로컬 실행기 연결 적용.
- 대체: 2026-07-26 롤링 캘린더 및 2026-08-23 휴무 가시화 결정의 지난 일반 생성본 삭제 정책.

## 결정

수집 여부와 날짜 경과를 캘린더 삭제 근거로 사용하지 않는다. 기존 과거 생성본은 규칙이 종료돼도 역사적 내용 그대로 보존한다. 실제 등록 일정의 기본 생성본 대체, 미래 규칙 유효기간 및 휴무 표시 우선순위는 유지한다. 이미 사라진 과거 회차는 현재 반복 규칙으로 추정 복원하지 않는다.

기존 collection-registry의 sourceId→URL을 정규 규칙에 연결해 events.link1/link_name1과 기존 상세 바로가기를 재사용한다. 휴무 원문·공식 API override 링크를 우선한다. 남아 있는 과거 생성본은 기존 링크가 없을 때만 수집 위치를 보완한다. 날짜·DJ·장소·포스터를 바꾸지 않는다. 같은 ID의 갱신은 기존 저장기의 upsert를 이용하고, 저장 성공 후 대체되지 않는 오래된 행만 정리한다.

접근 실패 소스를 기존 remainingSources에 남겨 다음 예약이 우선 재시도하게 한다. 접근 실패가 있는 Instagram 소스는 완료 게시물 체크포인트를 전진시키지 않는다. 후보 근거 검증과 로그인 차단 안전장치는 유지한다.

예약이 동시에 시작되면 기존 단일 잠금이 풀릴 때까지 최대 120분 기다린다. 잠금 책임을 추가하지 않고 설치된 실행기의 acquire_lock 구현을 scripts/ingestion/run-lock.sh로 옮겼다. /Users/inteyeo/scripts/run-ingestion.sh는 이를 source하고 획득 실패 시 종료한다. 살아 있는 프로세스의 잠금은 오래됐어도 빼앗지 않는다. 새 DB·큐·상태값·예약은 없다.

## 적용·복구 경계

로컬 실행기 연결은 적용되어 다음 예약부터 읽는다. 이미 실행 중인 프로세스와 놓친 예약은 자동 재시작하지 않았다. 서버 변경은 배포되지 않아 운영 캘린더에는 기존 삭제 정책이 남아 있다. 설치 실행기의 변경 전 사본은 /tmp/rhythmjoy-run-ingestion-before-20260910.sh에 보관했다. 로컬 롤백은 해당 실행기 사본 복구, 코드 롤백은 관련 변경 되돌리기다. 미수집 과거 일정이 보존되면 저장량은 누적되지만 수집 원장 및 외부 API 스키마 마이그레이션은 없다.

## 검증

정규 소셜·외부 API·저장 실패/건조 실행 회귀, 기존 수집 표준, Node 잠금·자동등록 보고 검사, Cafe24 빌드를 수행했다. 운영 공개 /api/events 응답 1,000건 중 정규 생성본 89건, 링크 없음 85건을 읽기 전용 확인했다. 응답에 한도가 있고 공식 예외 원장을 함께 읽지 않았으므로 전체 운영 조정 건수로 해석하지 않는다. 실수집 재실행·운영 DB 수정·과거 추정 복구·배포는 수행하지 않았다. Instagram 로그인 제한이나 PC 중단 자체는 이 변경으로 해소되지 않는다.

## Deployment and recovery follow-up

- Deployment follow-up (2026-09-10): user authorized deployment and recovery of Sep 7–10. Commit 10e7a762 was pushed before deployment; health/version 1789018114603 verified. Production reconciliation: creates=0, removes=0, retained=197. Two Sep 9 socials (Chori at Social Club, Yoonseul at Swingtime) restored through existing administrator candidate/registration APIs with official source images. Normal automatic future-only filtering remains unchanged.
- Additional root cause: the legacy document fallback (71723533c) and direct-media URL preference (fe2b77c) admitted recommended post images and alt text. Moved the existing document reader to readInstagramPostDocument and excluded media linked to another post. Original media, hidden carousel slides and legacy article scope are preserved. Two DOM regression tests, ingestion standards and lint passed; the live Kyungsung post retained its original image and rejected six recommendations.
