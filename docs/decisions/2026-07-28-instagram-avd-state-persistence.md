# 2026-07-28 — Instagram 게시 AVD 상태 영속성

- 날짜: 2026-07-28
- 상태: accepted

## Context

Instagram 설치·로그인이 완료된 뒤보다 오래된 Android Emulator Quick Boot
스냅샷이 자동 로드되면서 앱과 로그인 상태가 이전 시점으로 되돌아갔다.
스냅샷 RAM의 패키지명 문자열은 실제 설치 여부를 보장하지 못한다.

## Decision

- 자동 게시의 단일 AVD는 `Medium_Phone`이다.
- 시작할 때 `-no-snapshot-load -no-snapshot-save`를 사용해 Quick Boot
  스냅샷을 읽거나 쓰지 않는다.
- 앱과 로그인 상태는 AVD 영구 사용자 데이터에만 유지한다.
- Instagram 설치 여부는 대상 AVD의 Android Package Manager에서
  `pm path com.instagram.android`가 실제 패키지 경로를 반환하는지로 판단한다.
- 실행 중인 에뮬레이터가 하나뿐이어도 AVD 이름이 다르면 대체 사용하지 않는다.
- AVD를 자동으로 삭제·재생성·초기화하거나 `-wipe-data`로 시작하지 않는다.
- 계정명은 Instagram 프로필 화면에서 `korea_swing_social`인지 확인한 뒤에만
  미디어 선택과 공유 단계로 진행한다.

## Consequences

- Mac 화면 잠금과 무관하게 ADB 자동 게시를 계속할 수 있다.
- 부팅은 Quick Boot보다 느리지만 오래된 상태로 롤백되는 위험을 제거한다.
- 앱 제거 또는 로그인 만료 시 자동 복구를 추측하지 않고 공유 전에 중단한다.
- 앱 재설치와 계정 로그인은 공식 설치 경로와 사용자 인증이 필요한 별도 복구
  단계이며, 한 번 복구한 뒤에는 cold boot 기반 영구 데이터로 유지된다.

## Related

- `scripts/social-reels/instagram-reel-adb.mjs`
- `scripts/social-reels/instagram-reel-adb.test.mjs`
- `docs/social-reel-automation.md`
- `docs/ISSUE_LOG.md`
