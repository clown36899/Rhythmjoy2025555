# 소셜 캘린더 릴스 자동 생성·게시

## 실행

일반 운영에서는 중복 방지, 최대 3회 재시도, 결과 검증, 실행 상태 기록을 포함한 다음 명령을 사용한다.

```bash
npm run social-reel:run
```

같은 날짜에 검증 완료된 결과가 있으면 다시 인코딩하지 않는다. 강제로 새로 만들 때만 다음처럼 실행한다.

```bash
npm run social-reel:run -- --force
```

저수준 생성기만 직접 실행해야 할 때는 `npm run social-reel:generate`를 사용한다.

영상 생성부터 Instagram Reel 게시까지 실행하려면 다음 명령을 사용한다.

```bash
npm run social-reel:publish
```

실제 `Share`를 누르지 않고 음악·커버 설정 및 공유 직전 화면까지 검사한 뒤 편집 내용을 폐기하려면 다음을 사용한다.

```bash
npm run social-reel:publish:dry-run
```

Mac의 화·목·토 12:30 예약 작업을 설치하거나 갱신하려면 다음을 사용한다.

```bash
npm run social-reel:install-macos
```

결과물은 기본적으로 아래 위치에 생성된다.

```text
artifacts/social-reels/YYYY-MM-DD/YYYY-MM-DD-social-reel-4k.mp4
artifacts/social-reels/YYYY-MM-DD/YYYY-MM-DD-social-reel-cover-4k.jpg
artifacts/social-reels/YYYY-MM-DD/instagram-share-ready.png
artifacts/social-reels/YYYY-MM-DD/publication-state.json
```

배치 로직만 날짜별로 확인할 때는 다음처럼 실행한다.

```bash
npm run social-reel:generate -- --dry-layout --date=2026-07-30
```

테스트:

```bash
npm run test:social-reel
```

## 고정 규칙

- `swingenjoy.com/calendar`에서 `오늘` 버튼을 누른 뒤 파란 오늘 날짜의 실제 DOM 좌표를 읽는다.
- 결과물은 2160×3840, 30fps, 15초 H.264 MP4로 만든다.
- 캘린더 화면은 세로 프레임의 90% 안에 contain 배치해 Instagram 상·하단 UI에 화면이 잘리지 않게 한다.
- 캘린더 캡처는 Android 모바일 환경의 390×844 CSS viewport를 5배 해상도로 캡처한다. 실제 휴대폰 폭에 맞춰 사이트 글자가 430px viewport보다 약 10% 크게 렌더링되며, 4K 프레임으로 축소할 때 약한 선명화만 적용한다.
- 글자 배경은 흰색이며 1080 기준 20px 둥근 모서리와 4px 연회색 외곽선을 사용한다.
- `N일 소셜`은 흰 직사각형의 가로·세로 중앙에 둔다.
- 글자 상자는 1080 기준 440×150이고 글자 크기는 100px, 굵기는 500으로 고정한다. 굵은 획이 뭉치지 않으면서 프로필 커버에서도 크게 읽히게 한다.
- 글자 상자는 오늘 날짜보다 항상 위에 둔다. 아래에는 두지 않는다.
- 오늘이 화면 왼쪽이면 글자를 오른쪽 위, 오늘이 화면 오른쪽이면 왼쪽 위에 둔다.
- 오늘이 가운데면 좌우 여백이 더 넓은 쪽을 사용한다. 정확히 가운데면 왼쪽 위를 사용한다.
- 화살표는 글자 상자 쪽에서 오늘 파란 원을 향하도록 매번 벡터와 각도를 다시 계산한다.
- 화살표 외곽과 글자 상자 사이는 최소 40px, 화살표 외곽과 오늘 표시는 최소 35px를 유지한다.
- 화살표는 진행 방향을 따라 0.8초 주기로 4px만 왕복한다.
- 캘린더 배경에는 채도·대비·밝기 보정을 적용하지 않고 모바일 캡처 원본 색을 유지한다.
- 흰 상자·검정 글자·파란 화살표에도 별도 색상 필터를 적용하지 않는다.
- 영상 첫 프레임부터 완성된 글자와 화살표를 표시한다.
- 동일한 첫 프레임을 고해상도 JPG 커버로 함께 생성하고 Instagram의 `Edit cover`에서 지정한다.
- Instagram 프로필 크롭은 기본 원본 상태를 사용한다. 별도의 확대, 축소, 이동을 적용하지 않는다.
- 출력은 BT.709 limited, yuv420p, H.264 High Profile CRF 16으로 만든다.
- Instagram 계정은 게시 시작 전에 `korea_swing_social`인지 확인한다.
- 영상과 커버는 실행 날짜가 포함된 전용 Android 경로에 복사한 뒤 최신 미디어인지 확인하고 선택한다.
- 음악은 Instagram 안에서 검색하고 제목과 아티스트가 모두 정확히 일치하는 곡만 선택한다.
- 재즈 목록은 `Take Five`, `Like It Is`, `Teo`, `Sunday`, `Do What You Wanna`, `So What` 순환이며, 직전 게시 곡은 반복하지 않는다.
- 커버는 `Add from camera roll`에서 생성된 4K JPG를 선택하고 `Crop profile image`에는 들어가지 않는다.
- 캡션은 현재 비워 둔다.

## 운영 경계

- 실제 Instagram 게시 환경의 단일 기준 AVD는 `Medium_Phone`이다.
- `Medium_Phone`은 항상 `-no-snapshot-load -no-snapshot-save`로 cold boot한다.
  앱과 로그인 데이터는 AVD 영구 사용자 데이터만 사용하며 Quick Boot 스냅샷은
  게시 상태의 근거 또는 복구 수단으로 사용하지 않는다.
- `Medium_Phone_2`는 게시 환경이 아니며 실행 중인 에뮬레이터가 하나뿐이어도
  AVD 이름이 정확히 `Medium_Phone`이 아니면 게시 대상으로 대체하지 않는다.
- 게시 전 선택한 AVD 이름, ADB serial, `com.instagram.android` 패키지 존재를
  Android Package Manager의 `pm path`로 확인하고 반드시 로그로 남긴다.
  RAM·스냅샷 문자열은 설치 증거로 인정하지 않는다. 셋 중 하나라도 다르면
  공유 화면으로 진행하지 않는다.
- 영상 생성은 헤드리스 브라우저로 실행하므로 화면 잠금과 무관하다.
- Instagram 앱 조작도 ADB로 실행하므로 Mac 화면 잠금 상태에서 진행할 수 있다.
- Mac이 잠자기, 종료 또는 네트워크 단절 상태면 로컬 예약 실행은 동작하지 않는다. 설치된 LaunchAgent는 실행 동안 `caffeinate -dimsu`로 잠자기를 막는다.
- 예약 실행은 로그인된 Mac 사용자 세션의 LaunchAgent
  `com.rhythmjoy.social-reel-publish`가 화·목·토 12:30 KST에 호출한다.
- 에뮬레이터가 꺼져 있으면 `Medium_Phone` AVD를 자동 시작하고 부팅 완료까지 기다린다. 이미 실행 중이면 재시작하지 않는다.
- 실행 잠금으로 중복 실행을 차단하고, 네트워크·페이지 로드·인코딩 실패 시 최대 3회 다시 시도한다.
- 생성된 MP4의 H.264, 2160×3840, 30fps, 15초, yuv420p, BT.709와 커버 크기를 `ffprobe`로 검사한다.
- `artifacts/social-reels/YYYY-MM-DD/run-state.json`에 생성 성공, 재시도 또는 실패 상태를 남긴다. 검증된 같은 날짜 결과는 재사용한다.
- `publication-state.json`에 게시 전·공유 시작·검증 완료 상태를 원자적으로 기록한다.
- `Share` 이전 실패는 다음 예약이나 수동 실행에서 안전하게 다시 시작할 수 있다.
- `Share`를 누른 뒤에는 업로드가 백그라운드 작업으로 넘어갈 시간을 둔 다음 해당 계정 프로필 딥링크를 다시 연다. 표시된 게시물 수가 공유 전과 같으면 프로필을 실제로 아래로 당겨 새로고침한 뒤 다시 읽는다. 새 릴스 화면, 게시 직후 권한창, 프로필의 캐시된 게시물 수를 게시 실패로 오판하지 않는다.
- 강제 새로고침 후에도 프로필 게시물 수 증가를 확인하지 못하면 `verification-required`로 멈추고 자동 재게시를 금지한다. 알림은 실패가 아니라 `공유 완료 · 게시 확인 대기`로 구분한다. 다음 실행은 먼저 기존 기준 게시물 수와 현재 게시물 수를 같은 방식으로 대조해 이미 게시된 건이면 `published`로 복구하며, 증가가 없을 때만 계속 차단한다. 이는 중복 게시 방지 규칙이다.
- 로그인 만료, Instagram UI 변경, 음악 검색 결과 부재는 게시 전 실패로 기록한다.
- Telegram 환경 값이 유효하면 결과를 Telegram으로 알리고, 실패하면 macOS 알림과 로그로 대체한다. 비밀 값은 저장소와 로그에 쓰지 않는다.
- 로그는 `~/social-reel-runs/launchd.log`에 남긴다.
- 계정 정보, 쿠키, 비밀번호는 저장소나 결과물 디렉터리에 기록하지 않는다.

## 검증 시간

- 2026-07-26 실제 에뮬레이터 드라이런:
  - 기존 4K 영상 검증·재사용
  - 계정·게시물 수 확인
  - 영상 선택
  - `Do What You Wanna — Ramsey Lewis` 검색 및 선택
  - 4K 커버 지정
  - `Share` 직전 화면 캡처
  - 편집 내용 자동 폐기
- Instagram UI 구간: 106.5초
- 이미 생성된 영상 재사용을 포함한 전체 실행은 약 2분이다.
- 새 영상 생성이 필요한 날의 4K 캡처·인코딩은 현재 Mac에서 약 15초가 추가된다.
- 실제 업로드 후 프로필 검증은 Instagram 네트워크 상태에 따라 추가로 약 30초~수 분이 걸릴 수 있다.

## 최적화 원칙

- 같은 날짜의 검증된 4K 파일은 재생성하지 않는다.
- 실행 중인 에뮬레이터를 재사용한다.
- UI는 긴 고정 대기 대신 접근성 ID가 나타나는 즉시 다음 단계로 진행한다.
- Android UI 덤프 일시 실패는 짧은 간격으로 최대 3회 복구한다.
- 5MB 안팎의 최종 MP4와 커버만 에뮬레이터로 전송한다.
- 음악 목록을 제한해 검색 결과 탐색 시간을 일정하게 유지한다.

## 관련 파일

- `scripts/social-reels/generate-social-reel.mjs`
- `scripts/social-reels/run-social-reel.mjs`
- `scripts/social-reels/run-scheduled-social-reel.mjs`
- `scripts/social-reels/instagram-reel-adb.mjs`
- `scripts/social-reels/install-macos-launch-agent.sh`
- `scripts/social-reels/layout.mjs`
- `scripts/social-reels/layout.test.mjs`
- `scripts/social-reels/instagram-reel-adb.test.mjs`
- `ops/macos/com.rhythmjoy.social-reel-publish.plist`
