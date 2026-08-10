# 로컬 자동화 복구와 Instagram 사전 승인

- 날짜: 2026-08-09
- 상태: 제안, 자동화 코드 미적용

## 배경

수집과 Instagram 릴스 게시가 macOS LaunchAgent에 의해 실행된다. 예약 실행 기록은 남아 있어도 컴퓨터가 완전히 꺼져 있으면 실행 자체가 없고, 고정된 최신 게시물 개수만 확인하는 방식은 정지 기간에 여러 게시물이 올라온 소스의 오래된 항목을 건너뛸 수 있다. Instagram 게시기는 최종 Share 화면까지 자동으로 진행한 뒤 즉시 게시하므로 사용자가 실제 게시 직전 결과를 승인할 단계가 없다.

## 수집 복구 제안

- 예약 시각 실행 여부가 아니라 소스별 `last_successful_cursor`를 기준으로 다음 범위를 결정한다.
- cursor는 게시물 ID·게시 시각과 마지막 완전 스캔 시각을 함께 저장하고, 소스 스캔이 성공한 뒤에만 전진시킨다.
- 다음 실행은 cursor 이후 게시물을 최소 2건 중첩해 다시 읽고 기존 후보·운영 일정 중복 판정으로 멱등 처리한다.
- 컴퓨터 부팅·로그인 또는 다음 예약 실행에서 마지막 완전 실행 이후의 공백을 감지하면 일반 실행 전에 catch-up을 수행한다.
- catch-up도 기존 AI 98% 자동등록 기준, 금지 키워드, 날짜·요일·장소 검증을 그대로 사용한다. 공백을 메운다는 이유로 안전 게이트를 우회하지 않는다.
- 전체 실행은 단일 lock과 제한 시간으로 보호하고, 시간이 부족하면 남은 source ID를 다음 실행에 저장해 이어서 처리한다.

## Telegram 승인 제안

Instagram 게시 상태를 다음과 같이 명시적으로 분리한다.

`preparing → awaiting-approval → approved → sharing → published`

거절·시간초과·재시작은 각각 `rejected`, `approval-expired`, `approval-interrupted`로 닫히며 Share를 누르지 않는다.

1. 릴스를 만들고 Instagram 최종 Share 화면까지 이동한다.
2. `instagram-share-ready.png`, 날짜, 선택 음악을 릴스 전용 Telegram 봇으로 전송한다.
3. 메시지에 `게시 승인`과 `취소` inline 버튼을 붙인다. 자유 텍스트 `ok`는 오인 가능성이 있어 승인 신호로 사용하지 않는다.
4. 승인 callback은 설정된 단일 `TELEGRAM_CHAT_ID`, 실행별 난수 nonce, 날짜, 10~15분 TTL을 모두 만족해야 한다.
5. 승인 직전에 publication lock, 대상 계정, 최종 Share 화면, Share 버튼, 이전 게시물 수를 다시 검증한다.
6. 검증 성공 뒤 상태를 원자적으로 `approved`, 이어서 `sharing`으로 기록한 다음에만 Share를 한 번 누른다.
7. callback은 한 번만 소비하고 Telegram 메시지를 승인·취소·만료 상태로 수정한다. 같은 callback 재전송은 무시한다.

현재 릴스 전용 봇은 outbound 메시지만 사용하고 webhook이 없으므로 로컬 `getUpdates` long polling 방식이 적합하다. Codex 대화용 Telegram 채널 봇과 토큰이 다르므로 두 봇을 결합하지 않는다.

## 운영 제약

- 최종 화면 승인 방식에서는 Mac과 Android 에뮬레이터가 승인 대기 중 켜져 있어야 한다.
- 정해진 TTL 안에 승인하지 않으면 게시하지 않고 다음 실행에서 새 화면과 새 nonce를 만든다.
- Mac이 꺼진 동안에도 승인 요청을 받고 싶다면 별도 상시 서버와 webhook이 필요하지만, 로컬 Instagram UI 게시 자체도 실행할 수 없으므로 현재 단계에서는 로컬 long polling이 더 단순하고 일관된다.
