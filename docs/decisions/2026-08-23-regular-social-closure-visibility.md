# 정규 소셜 휴무 회차 가시화

- 날짜: 2026-08-23
- 상태: 채택
- 대체 범위: `2026-07-26-rolling-regular-social-calendar.md`의 휴무 회차 완전 숨김 정책

## 배경

기존 조정기는 공식 수집 후보나 외부 API 예외가 `closure`이면 해당 날짜의 정규 소셜 생성본을 제거했다. 실제 운영은 없다는 점은 정확했지만, 사용자는 그 날짜가 누락된 것인지 공식 휴무인지 구분할 수 없었고 휴무 사유와 원문 링크도 일정 화면에서 확인할 수 없었다.

## 결정

- 휴무·휴관·취소가 날짜와 공식 출처로 확인되면 해당 정규 소셜 회차를 삭제하지 않고 기존 결정론 ID의 `events` 행으로 물질화한다.
- 표시용 회차는 `category=social`, `activity_type=social`, `genre=휴무`, `dj_name=휴무`, `automation.exception_type=closure`를 사용한다.
- 캘린더 소셜 DJ 슬롯과 리스트 분류 배지는 기수·사유와 관계없이 `휴무`만 표시한다.
- 휴무 후보 또는 외부 API 예외의 `source_url`을 이벤트 `link1`에, `휴무 공지`를 `link_name1`에 저장한다. 수집 근거 또는 API 설명은 상세 내용으로 보존한다.
- 같은 날짜와 규칙에 실제 개별 소셜이 이미 있으면 기존 우선순위를 유지해 휴무 회차를 추가하지 않는다.
- 휴무 예외가 제거되면 다음 조정에서 같은 ID가 기본 정규 소셜로 복귀한다.

## 유지하는 안전장치

- 수집 후보 원장과 외부 API 예외 원장은 수정하거나 삭제하지 않는다.
- 과거 회차의 포스터를 휴무 회차에 재사용하지 않는다.
- 실제 개별 소셜이 생성 반복본을 대체하는 규칙, 90일 범위, 지난 생성본 정리, Cron 인증과 동일 ID 재실행 안전성을 유지한다.
- 새 테이블·큐·상태값은 추가하지 않고 기존 `scraped_events`, `external_regular_social_exceptions`, `events`와 조정 작업을 재사용한다.

## 부작용과 복구

휴무도 공개 일정 수에 포함되지만 실제 개최 일정과 구분되도록 `휴무` 장르와 자동화 메타데이터를 갖는다. 문제가 생기면 표시용 휴무 생성만 이전 정책으로 되돌릴 수 있으며, 원장 예외를 삭제하지 않았으므로 데이터 손실 없이 재조정할 수 있다.

## 관련 파일

- `server/cafe24/regular-social-reconciler.js`
- `server/cafe24/regular-social-reconciler.test.js`
- `src/pages/calendar/utils/calendarEventKind.ts`
- `src/pages/calendar/components/CalendarListView.tsx`
