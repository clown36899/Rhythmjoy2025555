# Kiosk Chat Summary

작성일: 2026-06-05

이 문서는 전체 채팅 원문이 아니라, 다음 작업자가 맥락을 빠르게 이어받기 위한 요약이다.

## 큰 흐름

사용자는 Mini PC Ubuntu와 Android TV를 현장 키오스크처럼 안정화하려고 했다.

처음에는 MacBook에서 Mini PC에 어떻게 접속하는지부터 시작했다. HDMI로 MacBook을 연결하는 방식이 아니라, Mini PC에서 SSH를 켜고 MacBook 터미널에서 접속하는 방식으로 진행했다.

Mini PC 접속 후에는 Bluetooth, Ubuntu/Chrome 업데이트 UI, Chrome 키오스크 자동 실행, 세로 화면, TV용 CSS, 외부 링크 차단, QR 안내, 광고 carousel 조작 버튼까지 순서대로 다뤘다.

## 사용자의 핵심 요구

- 키오스크 화면에는 OS/Chrome 업데이트 알림이 절대 보이면 안 된다.
- 사용자가 사이트 밖으로 빠져나가면 돌아올 수 없으므로, 외부 링크는 강하게 막아야 한다.
- 외부 기능은 모바일에서 쓰게 안내하고, QR과 주소를 보여준다.
- 안내 문구는 다음 의미여야 한다:

```text
외부 링크 연결 기능 등 온전한 기능 사용은
모바일에서 댄스빌보드 사이트를 열어주세요.
```

- QR은 `https://swingenjoy.com/`로 연결되어야 한다.
- 45초 후 자동 홈 복귀가 필요하다.
- `홈으로 돌아가기` 버튼도 필요하다.
- 홈 복귀는 느리면 안 된다. 기존 홈 탭을 살리고 외부/안내 탭만 닫는 방식이 선호된다.
- 사이트 프로젝트 파일과 Mini PC 운영 설정은 구분해야 한다.

## 중요한 판단

### 프로젝트 소스 수정 대신 Mini PC 전용 운영 설정

이 채팅에서는 사이트 프로젝트 소스 자체를 수정하지 않기로 했다.

대신 Mini PC에 Chrome extension, Python URL guard, systemd service, Chrome managed policy를 설치해서 키오스크만 다르게 동작하게 했다.

### 외부 링크 처리 방식

처음에는 외부 사이트를 띄우고 그 위에 잠금 오버레이를 씌우는 방향이었다.

하지만 실제 테스트에서 아래 문제가 있었다.

- 외부 사이트가 먼저 열리고 잠금창이 늦게 뜨는 틈이 있음
- 상세 페이지에서 일부 외부 링크는 잠금창이 안 뜨는 경우가 있음
- `linktr.ee` 같은 페이지에서 다시 `open.kakao`로 빠질 수 있음
- `tel:`, `intent://`, `kakaotalk://` 같은 앱 호출 링크가 `xdg-open` 확인창을 띄울 수 있음

그래서 최종 방식은 다음으로 바뀌었다.

- 외부 사이트를 실제로 열지 않는다.
- 외부 이동을 감지하는 즉시 로컬 QR 안내 페이지로 보낸다.
- JS 가드가 놓친 경우 Python guard가 Chrome 탭 URL을 감시해서 다시 QR 안내로 보낸다.
- 앱/특수 프로토콜은 Chrome managed policy에서도 차단한다.

### 홈 복귀 방식

처음에는 `https://swingenjoy.com/`로 새로 이동하는 방식이라 느렸다.

최종 방식:

- 기존 홈 탭이 있으면 즉시 활성화
- 외부/안내 탭은 닫음
- 홈 탭이 없을 때만 새로 홈으로 이동

## TV/CSS 관련 사용자의 강한 선호

Mini PC 전용 CSS 조정 중 사용자가 강하게 지적한 내용이다. 다음 작업자는 특히 조심해야 한다.

- 광고 카드 1, 2, 3은 겹쳐야 한다.
- 1, 2, 3의 겹침 간격은 같아야 한다.
- 3, 4의 간격은 원래처럼 더 넓어야 한다.
- 뒤에 있는 카드 크기를 줄이면 안 된다.
- 뒤 카드 opacity를 임의로 건드리면 안 된다.
- 카드가 화면 밖으로 잘리면 안 된다.
- 광고 제목은 해당 광고 아래 중앙이지, 화면 중앙이 아니다.
- 신규 이벤트 영역과 메인 헤더 사이 간격을 줄여 광고 영역을 조금 위로 올리는 방향은 허용됐다.
- 상단 헤더와 하단 메뉴 글자는 키오스크에서 크게 보여야 한다.
- 광고 왼쪽 뒤에 대기 상태 카드도 잘리면 안 된다.

## Android TV 쪽 흐름

Android TV는 Mini PC와 별도로 SSH/ADB로 조작하는 대상으로 정리했다.

사용자는 TV 개발자 옵션과 네트워크 디버깅을 열고 허용했다.

TV 쪽에서는 키오스크 방해 요소를 막기 위한 설정을 진행했다.

- Bluetooth/pairing 관련 방해 요소 차단
- TV 알림/절전/스크린세이버/Assistant 등 키오스크 방해 요소 점검
- TV 화면 비율, PC mode, pixel shift 등 표시 관련 설정 점검

세부 내용은 `ops/kiosk/android-tv/NOTES.md`에 따로 정리한다.

## 현재 보관 방식

처음에는 projectless Codex thread의 `outputs`에 백업을 만들었다.

이후 사용자가 기존 프로젝트 `Rhythmjoy2025555-5` 안에 보관하는 것이 더 낫다고 판단했다.

최종 보관 위치:

```text
ops/kiosk/
```

Mini PC 백업:

```text
ops/kiosk/mini-pc/
```

## 다음 채팅에서 이어받는 방법

다음 Codex 채팅에서 프로젝트 `Rhythmjoy2025555-5`를 열고 이렇게 말하면 된다.

```text
ops/kiosk/HANDOFF.md와 ops/kiosk/CHAT_SUMMARY.md부터 읽고 키오스크 작업 이어서 해줘.
```

## 아직 커밋 전

이 문서를 작성한 시점 기준, `ops/kiosk/`는 프로젝트에 추가됐지만 아직 commit/push는 하지 않았다.

추천 커밋:

```bash
git add ops/kiosk
git commit -m "Add kiosk operations backup and handoff docs"
git push
```
