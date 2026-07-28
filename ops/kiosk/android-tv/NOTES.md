# Android TV Kiosk Notes

최종 업데이트: 2026-07-28

## 목적

Android TV가 Mini PC 키오스크 화면을 방해하지 않도록 설정한다.

Mini PC와 TV는 별도 관리 대상이다.

- Mini PC: Ubuntu, Chrome kiosk, URL guard, TV 전용 CSS
- Android TV: 입력/알림/블루투스/절전/화면 표시 방해 요소 관리

## 연결

ADB 대상:

```text
172.30.1.28:5555
```

운영 중에는 이 주소로 `adb connect`를 실행하지 않는다. 승인되지 않은 ADB
클라이언트의 연결 시도 자체가 TV에 USB 디버깅 승인 모달을 띄운다.

## 진행한 방향

TV는 웹사이트를 띄우는 주체가 아니라 Mini PC 화면을 보여주는 출력 장치로 다룬다.

따라서 TV 자체에서 아래 항목이 키오스크를 방해하지 않게 하는 것이 목표다.

- Bluetooth pairing 요청
- TV 알림
- Assistant/음성 관련 UI
- 절전/sleep/screensaver
- 화면 보정 때문에 생기는 잘림/비율 문제

## 진행한 설정 메모

채팅 중 TV 쪽에서 다음 성격의 설정을 진행했다.

- 개발자 옵션 활성화
- 네트워크 디버깅/ADB 허용
- Bluetooth/pairing 관련 방해 요소 차단
- 알림/절전/스크린세이버/Assistant 등 키오스크 방해 요소 점검
- TV 표시 모드 관련 설정 점검
- PC mode 성격의 입력 표시 사용
- pixel shift 성격의 화면 이동 기능 비활성화

정확한 TV 모델별 메뉴명은 다를 수 있다. 다음 작업자는 ADB로 현재 설정을 다시 조회한 뒤 수정해야 한다.

## 다음 작업자가 먼저 확인할 것

ADB 상태 조회도 먼저 연결을 요구하므로 운영 화면에서는 실행하지 않는다. TV 설정
변경이 꼭 필요할 때만 현장 확인이 가능한 정비 시간에 수행한다.

Bluetooth 관련 패키지/서비스는 TV 모델마다 다르므로, 무리해서 삭제하지 말고 disable/hide 가능한 범위부터 확인한다.

## 주의

- TV는 Mini PC와 다르게 제조사 앱/서비스 영향이 크다.
- ADB 명령은 TV 모델별로 다르게 동작할 수 있다.
- 시스템 앱 삭제보다는 disable, notification off, setting 변경을 우선한다.
- Mini PC Chrome kiosk 설정과 TV ADB 설정을 섞어서 생각하지 말 것.

## USB 디버깅 승인 모달 원격 제거 절차

2026-07-28 확인한 장치:

- Android TV: `2K US Google TV`
- 주소: `172.30.1.28`
- Android TV Remote v2: TCP `6466`, `6467`
- Mini PC: `172.30.1.13`이며 ADB가 설치되어 있지 않음

승인 모달은 관리 Mac의 ADB가 `172.30.1.28:5555`에 연결되어 `unauthorized`가 되면서 발생했다. `adb disconnect`와 `adb kill-server`는 재발 연결은 막지만 이미 화면에 떠 있는 Android 시스템 모달을 닫지는 못한다. Mini PC Chrome 재시작, HDMI 신호 재설정, Chrome DevTools 클릭도 Android 시스템 오버레이에는 효과가 없다.

검증된 해결 방법:

1. 관리 Mac에서 ADB 연결과 서버를 종료한다.
2. `androidtvremote2`로 Android TV Remote v2를 페어링한다.
3. TV에 표시된 6자리 페어링 코드를 입력한다.
4. 페어링된 리모컨으로 `BACK` 키를 두 번 전송한다.
5. TV가 `com.google.android.tv.inputplayer` HDMI 입력으로 복귀하고 현장 화면에서 모달이 사라졌는지 확인한다.

중요:

- `DPAD_LEFT` 후 `DPAD_CENTER`만 전송한 첫 시도는 모달을 닫지 못했다.
- 성공한 명령은 Android TV Remote v2의 `BACK` 두 번이다.
- 인증서는 로컬 관리 장치의 `~/.config/rhythmjoy-androidtv-remote/`에만 보관하며 저장소에 넣지 않는다.
- 실제 화면 확인 전에는 “닫혔다”고 보고하지 않는다.
- 운영 중에는 ADB를 자동 연결하지 않는다.
- 관리 Mac과 Mini PC에 ADB 자동연결 프로세스/서비스를 두지 않는다.
- 모달 제거는 ADB가 아니라 페어링된 Android TV Remote v2의 `BACK` 두 번만 사용한다.
- 포트 5555가 열려 있어도 클라이언트가 연결하지 않으면 승인 모달은 발생하지 않는다.

## 아직 부족한 것

이 메모는 채팅 맥락 보존용이다. Mini PC처럼 완전한 파일 스냅샷은 아니다.

다음에 TV 쪽을 더 작업하면 아래를 추가로 저장하는 것이 좋다.

- TV 모델명
- `settings list` 스냅샷
- 변경 전/후 설정 diff
- 적용한 ADB 명령 목록
- 되돌리는 명령 목록
