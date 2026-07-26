# 소셜 캘린더 릴스 동적 배치 자동화

- 날짜: 2026-07-26
- 상태: accepted

## Context

Instagram 릴스용 캘린더 영상에서 오늘 날짜의 요일 열이 매일 바뀐다. 고정 좌표를 사용하면 글자 상자나 화살표가 오늘 날짜, 요일, 서로의 영역을 가릴 수 있다. 모바일 편집 앱에서 스티커를 회전하는 방식은 화면 잠금과 편집기 제약 때문에 안정적으로 자동화하기 어려웠다.

## Decision

- 편집 앱 스티커 대신 코드로 15초 MP4를 직접 생성한다.
- 캘린더의 `오늘` 버튼을 누른 후 파란 오늘 표시의 DOM 좌표를 측정한다.
- 글자 상자는 항상 오늘보다 위쪽의 좌·우 중 여유 있는 쪽에 배치한다.
- 오늘이 정확히 가운데면 글자 상자를 왼쪽 위에 둔다.
- 화살표 다각형은 글자 쪽에서 오늘 방향으로 매번 다시 계산한다.
- 글자 상자·화살표·오늘 표시 사이의 최소 안전거리를 자동 검증한다.
- 영상 생성과 Instagram 음악 선택·게시를 분리한다.
- 운영 진입점은 실행 잠금, 최대 3회 재시도, 4K 결과 검증과 상태 기록을 포함한다.
- Instagram 프로필 크롭은 수동 확대 없이 기본 원본 상태를 사용한다.
- 영상 생성과 Instagram 앱 제어는 Mac에서 실행한다.
- Instagram UI는 녹화 좌표가 아니라 ADB UI 계층의 접근성 ID·텍스트·설명을 확인한 후 다음 단계로 진행한다.
- 화·목·토 12:30 KST에 로그인된 Mac 사용자 세션의 LaunchAgent로 실행한다.
- 에뮬레이터가 꺼져 있으면 자동 시작하고, 실행 중이면 기존 AVD를 재사용한다.
- 음악은 검증된 재즈 목록을 순환하며 직전 성공 곡을 반복하지 않는다.
- 공유 전 상태는 재시도할 수 있지만, `Share` 이후 결과가 불명확하면 자동 재시도를 금지한다.
- 커버는 별도 생성한 4K JPG를 사용하고 프로필 크롭 화면에는 들어가지 않는다.

## Consequences

- 요일과 월이 바뀌어도 같은 생성 명령을 사용할 수 있다.
- 화면 잠금 상태에서도 헤드리스 생성은 가능하지만 실행 장치가 잠자면 로컬 예약 작업은 멈춘다.
- LaunchAgent가 실행 중에는 `caffeinate`로 Mac 잠자기를 막지만, Mac 전원 종료와 사용자 로그아웃은 복구할 수 없다.
- 음악 선택은 Instagram에서 제공되는 음원과 계정 상태에 의존한다. 정확한 곡이 없으면 다음 재즈 후보를 사용한다.
- 사이트 DOM 클래스가 변경되면 오늘 표시 탐색기를 갱신해야 한다. 요일 기반 좌표는 테스트용 fallback으로만 사용한다.
- 같은 날짜의 검증 완료 결과는 재사용해 연결 재시도 중 중복 생성·중복 인코딩을 막는다.
- Instagram UI가 변경되면 해당 접근성 선택자를 갱신해야 한다. 화면 상태가 예상과 다르면 좌표를 추측해 누르지 않고 게시 전에 실패한다.
- 공유 결과가 불명확한 날은 사람이 프로필을 확인한 후에만 복구할 수 있어 중복보다 게시 누락을 우선한다.
- 2026-07-26 공유 직전 드라이런의 앱 UI 구간은 106.5초였다.

## Related

- `docs/social-reel-automation.md`
- `scripts/social-reels/generate-social-reel.mjs`
- `scripts/social-reels/run-social-reel.mjs`
- `scripts/social-reels/run-scheduled-social-reel.mjs`
- `scripts/social-reels/instagram-reel-adb.mjs`
- `ops/macos/com.rhythmjoy.social-reel-publish.plist`
- `scripts/social-reels/layout.mjs`
- `scripts/social-reels/layout.test.mjs`
