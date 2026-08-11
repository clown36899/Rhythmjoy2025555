# 알림 설정·구독·전달·알림함 수명주기 분리

- 날짜: 2026-08-11
- 상태: 채택

## 배경

계정의 알림 설정, 브라우저의 Web Push 구독, 실제 전달 결과, 인앱 알림함 읽음 상태가 한 상태처럼 취급됐다. 그 결과 계정 설정이 켜져 있어도 현재 브라우저 endpoint가 서버에서 확인되지 않으면 설정 화면이 꺼짐으로 보였다. 만료 endpoint는 DB 키 길이 초과로 삭제되지 않았고, 아침 요약은 알림함 저장 성공을 전달 성공으로 간주해 실패 후 재시도할 수 없었다. 요약의 여러 일정도 서버 알림함에는 항목 데이터가 없어 한 카드로 축약됐다.

## 결정

1. `user_notification_preferences`를 계정 알림 설정의 유일한 원본으로 사용한다. 설정 화면과 사이드 메뉴의 ON/OFF는 현재 브라우저 구독이 아니라 이 계정 설정을 표시한다.
2. 브라우저 구독은 기기별 전달 채널이다. endpoint 전체는 JSON에 보존하고 `generic_records.record_id`는 `push:`와 endpoint SHA-256으로 만든 고정 길이 키를 사용한다.
3. 서로 다른 기기를 UA나 OS 문자열로 추정해 삭제하지 않는다. 서버가 404, 410 또는 확정된 VAPID 불일치를 받은 endpoint만 삭제하고 실제 DB 삭제 건수를 기록한다.
4. 계정 설정이 켜져 있고 사용자가 해당 기기에서 명시적으로 끄지 않았다면, 앱은 서버가 소유하지 않는 기존 브라우저 구독을 새 endpoint로 교체한다. 설정 화면에는 계정 설정과 현재 기기 연결 상태를 따로 표시한다.
5. 아침 요약은 직접 발송하지 않고 공용 `notification_queue`에 사용자·날짜별 결정적 ID로 넣는다. 인앱 저장과 Web Push 성공을 별도로 기록하고, 성공한 구독이 없으면 제한된 재시도 기간 동안 새 기기 연결을 다시 찾는다. `sent`는 실제 Web Push 성공이 있을 때만 사용하며 인앱만 저장된 경우 `inbox_only`로 구분한다.
6. 서버 `user_notifications`가 모든 화면 크기의 알림함 원본이다. 일정 요약은 Push에는 최대 8개, 인앱 알림함에는 해당 요약의 전체 일정 항목을 저장한다. 뱃지 숫자는 DB 행 수가 아니라 실제 표시 카드 수를 사용한다.
7. 종 버튼을 여는 행위는 읽음 처리가 아니다. 개별 카드 선택 또는 사용자의 명시적인 모두 읽음 동작만 읽음 상태를 바꾼다. 과거 자동 읽음으로 훼손된 최근 신규 일정 상태는 1회 데이터 마이그레이션으로 복구한다.
8. 오늘 일정과 신규 등록은 서로 다른 계약이다. 오늘 일정은 기본 시작일(`start_date`, 없으면 `date`/`date_value`)이 당일인 일정의 요약이고, 신규 등록은 `new_event_enabled_at` 이후 생성된 큐만 전달하는 전진 전용 경로다. Push와 인앱 알림함은 같은 정규 설정·활성화 경계·분류 필터를 사용한다.
9. 알림 클릭의 서버 요청은 항상 안전한 루트 경로를 사용한다. 알림 종류·원본 ID·내부 목적지는 서버에 전송되지 않는 URL fragment로 전달하고, 인증 확인 후 클라이언트 라우터가 내부 목적지로 이동한다.
10. 오늘 일정 알림은 캘린더의 모든 회차를 뜻하지 않는다. `event_dates`의 후속 회차나 `start_date`~`end_date` 사이 날짜를 확장하지 않고 시작일이 오늘인 행만 포함한다. 카드에는 그 시작일을 저장·표시한다.
11. 설정 조회 실패는 알림 OFF 상태가 아니다. 계정 설정을 정상적으로 읽기 전에는 스위치와 저장 버튼을 표시하지 않고 오류와 재시도 동작을 보여준다. 알림 해제 저장 실패도 성공으로 닫지 않는다.

## 결과

계정 설정은 기기 교체나 endpoint 만료와 독립적으로 유지된다. 만료 구독은 실제로 제거되고 재연결할 수 있으며, 아침 알림 실패는 인앱 저장 성공에 가려지지 않는다. 모바일과 데스크톱은 같은 서버 데이터로 같은 카드 목록과 숫자를 표시한다. 오늘 일정과 신규 등록의 의미·대상·읽음 상태가 화면과 전달 경로에서 분리되며, 큐 UUID가 WAF 쿼리 검사에 노출되지 않는다.

반복 수업의 두 번째 이후 회차와 진행 중인 기간 일정은 오늘 일정 알림에 다시 나타나지 않는다. 설정 API의 일시 장애가 저장된 ON/OFF 값을 뒤집어 보이게 하지 않는다.

## 관련 파일

- `server/cafe24/push-subscription-key.js`
- `server/cafe24/generic-data-api.js`
- `server/cafe24/push-api.js`
- `src/lib/pushNotifications.ts`
- `src/components/NotificationSettingsModal.tsx`
- `src/lib/notificationStore.ts`
- `src/layouts/MobileShell.tsx`
- `src/lib/notificationLaunch.ts`
- `src/components/NotificationHistoryModal.tsx`
- `server/cafe24/migrations/2026-08-11-notification-route-boundaries.sql`
- `scripts/reconcile-daily-notification-occurrences.mjs`
