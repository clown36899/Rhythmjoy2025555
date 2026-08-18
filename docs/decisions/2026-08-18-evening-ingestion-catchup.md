# 익일 공지용 저녁 수집 보강

- 날짜: 2026-08-18
- 상태: 채택

## 배경

`swing-daily` priority1·2는 각각 08:00·09:00에 실행된다. 자동등록 대상인 공식 소셜 공지가 오전 실행 뒤 게시되면 다음 날 오전까지 다시 확인하지 않아, 익일 일정이 실제 DJ·포스터 대신 `DJ 미정` 정규 반복 일정으로 남을 수 있다. 2026-08-19 스윙타임 수요 소셜은 오전 실행에는 없었지만 2026-08-18 20시대 공식 Instagram과 Naver 카페에서 모두 확인됐고 기존 판정 규칙을 그대로 통과했다.

## 결정

1. priority1 LaunchAgent는 기존 08:00에 더해 20:30에 다시 실행한다.
2. priority2 LaunchAgent는 기존 09:00에 더해 21:00에 다시 실행한다.
3. 저녁 실행도 별도 수집 목록을 만들지 않고 `getAutomationSourceList('swing-daily')`의 동일 우선순위 목록만 사용한다.
4. 기존 체크포인트가 이미 확인한 Instagram 게시물을 건너뛰고 새 게시물을 우선 처리한다. Naver 카페 재확인은 결정론 후보 ID와 서버 중복 판정으로 멱등성을 보장한다.
5. priority1의 최대 실행 예산은 20분이므로 20:30 실행이 정상 범위에서 끝난 뒤 21:00 priority2가 시작된다. 예외적으로 겹치면 기존 전역 잠금이 동시 실행을 차단하고 실행 로그와 Telegram 요약에 남긴다.
6. 장기 혜택 탐색이 중심인 priority3·4는 오전 실행을 유지한다.

## 운영 경계

- 저장은 공식 원문과 날짜·활동·이미지 검증을 통과한 후보만 Cafe24 수집 API로 수행한다.
- 정규 반복 일정은 실제 공지가 등록되기 전의 임시 표시일 뿐이며, 명시 일정 등록 뒤 공개 응답에서는 대체된다.
- 저녁 예약 이후 게시된 극단적인 심야 공지는 다음 오전 체크포인트에서 처리한다. 실시간 웹훅이 제공되지 않는 소스에 대해 무제한 폴링은 하지 않는다.

## 검증

- `plutil -lint scripts/com.rhythmjoy.codex-ingestion.plist scripts/com.rhythmjoy.codex-ingestion-priority2.plist`
- 설치된 LaunchAgent의 `StartCalendarInterval`이 각각 `08:00·20:30`, `09:00·21:00`인지 확인
- `node scripts/test-ingestion-standards.mjs`
- 2026-08-19 스윙타임 실제 공지 재수집과 공개 일정 API 검증

## 관련 파일

- `scripts/com.rhythmjoy.codex-ingestion.plist`
- `scripts/com.rhythmjoy.codex-ingestion-priority2.plist`
- `docs/ISSUE_LOG.md`
