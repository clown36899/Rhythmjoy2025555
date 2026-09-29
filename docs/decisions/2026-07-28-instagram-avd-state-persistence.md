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

## 2026-08-27 Addendum — 게시 생성물 수명과 AVD 실행 수명

2026-08-25 저장공간 고갈 수정 뒤에도 8월 27일 예약 실행은 Share 전에 다시
저장공간 기준에 걸렸다. 전용 Android 미디어 경로는 이미 비어 있었고, AVD를
데이터 삭제 없이 cold boot하자 사용 가능 공간이 약 68MB에서 282MB로
회복됐다. Instagram 자체 캐시는 10MB 미만이었으며, 사용자 데이터에는 로그인과
앱 DB가 함께 들어 있어 통째로 지우는 것은 기존 영속성 결정에 어긋난다.

- `Medium_Phone` 데이터 파티션은 6GB로 유지한다. 용량 확장·AVD 재생성·앱
  데이터 초기화로 자동화 소유 파일의 수명 문제를 감추지 않는다.
- 프로필 게시물 수 증가로 게시 성공이 확인된 뒤에만 날짜별 Android 전송본과
  로컬 MP4·커버·중간 프레임·렌더링 PNG를 삭제한다.
- Share 전 실패와 `sharing`·`verification-required` 상태에서는 로컬 입력과
  게시 원장을 유지한다. 게시 확인이 불확실할 때 파일 정리를 이유로 Share를
  다시 누르지 않는다.
- `published` 원장은 영상 존재 여부보다 먼저 읽는다. 이미 게시된 날짜는
  영상을 다시 만들지 않고 남은 정리만 멱등적으로 수행한다.
- 자동화가 시작한 AVD는 결과가 확정된 뒤 정상 종료해 장시간 실행 중 생기는
  임시 사용량을 회수한다. 사용자가 미리 실행한 AVD는 종료하지 않으며,
  Share 결과가 불확실한 AVD는 업로드를 방해하지 않도록 계속 실행한다.
- 게시 상태 JSON과 Share·게시 확인 스크린샷은 생성 미디어가 아니라 중복 방지와
  외부 결과 검증 원장이므로 유지한다.

## Consequences

- Mac 화면 잠금과 무관하게 ADB 자동 게시를 계속할 수 있다.
- 부팅은 Quick Boot보다 느리지만 오래된 상태로 롤백되는 위험을 제거한다.
- 앱 제거 또는 로그인 만료 시 자동 복구를 추측하지 않고 공유 전에 중단한다.
- 앱 재설치와 계정 로그인은 공식 설치 경로와 사용자 인증이 필요한 별도 복구
  단계이며, 한 번 복구한 뒤에는 cold boot 기반 영구 데이터로 유지된다.
- 성공한 게시의 생성 미디어는 로컬·Android 양쪽에 누적되지 않고, 자동 시작한
  AVD는 다음 예약까지 유휴 상태로 계속 실행되지 않는다.

## Related

- `scripts/social-reels/instagram-reel-adb.mjs`
- `scripts/social-reels/instagram-reel-adb.test.mjs`
- `docs/social-reel-automation.md`
- `docs/ISSUE_LOG.md`
