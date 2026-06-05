# Android TV Kiosk Notes

최종 업데이트: 2026-06-05

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

기본 연결:

```bash
adb connect 172.30.1.28:5555
```

사용자가 TV에서 개발자 옵션과 디버깅 허용을 켠 뒤 진행했다.

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

```bash
adb devices
adb shell getprop ro.product.model
adb shell settings list secure
adb shell settings list global
adb shell settings list system
```

Bluetooth 관련 패키지/서비스는 TV 모델마다 다르므로, 무리해서 삭제하지 말고 disable/hide 가능한 범위부터 확인한다.

## 주의

- TV는 Mini PC와 다르게 제조사 앱/서비스 영향이 크다.
- ADB 명령은 TV 모델별로 다르게 동작할 수 있다.
- 시스템 앱 삭제보다는 disable, notification off, setting 변경을 우선한다.
- Mini PC Chrome kiosk 설정과 TV ADB 설정을 섞어서 생각하지 말 것.

## 아직 부족한 것

이 메모는 채팅 맥락 보존용이다. Mini PC처럼 완전한 파일 스냅샷은 아니다.

다음에 TV 쪽을 더 작업하면 아래를 추가로 저장하는 것이 좋다.

- TV 모델명
- `settings list` 스냅샷
- 변경 전/후 설정 diff
- 적용한 ADB 명령 목록
- 되돌리는 명령 목록
