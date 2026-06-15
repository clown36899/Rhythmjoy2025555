# Mini PC Kiosk Worklog

최종 업데이트: 2026-06-15

## 목적

Mini PC Ubuntu를 매장/현장용 댄스빌보드 키오스크로 안정화한다.

핵심 요구:

- 재부팅 후 Chrome 키오스크 자동 실행
- 화면은 세로형 키오스크에 맞게 사용
- 업데이트, 알림, 블루투스, 브라우저 팝업 등 키오스크 방해 요소 차단
- 사용자가 `swingenjoy.com` 밖으로 빠져나가면 QR 안내를 보여주고 홈으로 복귀
- 외부 앱 호출 링크가 `xdg-open` 같은 시스템 확인창을 띄우지 못하게 차단
- Mini PC 상태나 Chrome extension 주입 여부에 의존하지 않도록 사이트 `/kiosk` 라우트에서 키오스크 모드를 처리

## 현재 연결 정보

- Mini PC SSH 대상: `kiosk-j@172.30.1.13`
- Chrome 원격 디버깅: `127.0.0.1:9222` on Mini PC
- 키오스크 전용 URL: `https://swingenjoy.com/kiosk`
- 홈 URL: `https://swingenjoy.com/`
- Legacy URL guard local server: `http://127.0.0.1:9230`

비밀번호와 SSH 개인키는 이 repo에 저장하지 않는다.
비밀번호가 필요하면 채팅에 쓰지 말고 SSH 터미널 프롬프트에 직접 입력한다.

## 백업된 파일

Repo 보관 경로:

```text
ops/kiosk/mini-pc/snapshot/
```

원격 복원 대상:

```text
/home/kiosk-j/.local/bin/kiosk-url-guard.py
/home/kiosk-j/.local/bin/kiosk-display-setup.sh
/home/kiosk-j/.local/share/kiosk-domain-guard/
/home/kiosk-j/.config/systemd/user/kiosk-chrome.service
/home/kiosk-j/.config/systemd/user/kiosk-url-guard.service
/home/kiosk-j/.config/systemd/user/kiosk-display.service
/etc/opt/chrome/policies/managed/kiosk-suppress-update-ui.json
```

Repo 안에서는 `.local`과 `.config` 대신 `dot-local`, `dot-config` 이름을 사용한다.

## 완료된 작업

### SSH

- Mini PC에 `openssh-server` 설치 확인
- `ssh` 서비스 enable/start
- Mac에서 `kiosk-j@172.30.1.13` 접속 확인
- 임시 공개키를 `authorized_keys`에 추가해서 비대화식 관리 가능하게 구성

### Mini PC Bluetooth

- `bluetooth.service` disable
- `bluetooth.service` mask
- `rfkill block bluetooth`
- 상태 확인 결과: `Loaded: masked`, `Active: inactive (dead)`

### Chrome 키오스크 자동 실행

Systemd user service:

```text
/home/kiosk-j/.config/systemd/user/kiosk-chrome.service
```

주요 설정:

- `--kiosk`
- `--user-data-dir=/home/kiosk-j/.config/kiosk-chrome-profile`
- `--force-device-scale-factor=1.40`
- `--remote-debugging-address=127.0.0.1`
- `--remote-debugging-port=9222`
- `--disable-notifications`
- `--deny-permission-prompts`
- `--disable-translate`
- `--disable-background-networking`
- `--disable-component-update`
- 시작 URL: `https://swingenjoy.com/kiosk`

2026-06-15 변경:

- Chrome 시작 URL을 `https://swingenjoy.com/`에서 `https://swingenjoy.com/kiosk`로 전환한다.
- `--load-extension=/home/kiosk-j/.local/share/kiosk-domain-guard`와 `--disable-extensions-except=...`를 제거한다.
- CSS, 외부 링크 QR 안내, 광고 좌우 버튼은 사이트 코드가 담당한다.
- `kiosk-url-guard.service`는 legacy fallback으로만 보관하고 기본 상태는 disabled/stopped다.
- 적용 전 service 백업: `/home/kiosk-j/.config/systemd/user/kiosk-chrome.service.bak-20260615-133514`
- 기존 Chrome profile 백업: `/home/kiosk-j/.config/kiosk-chrome-profile.legacy-20260615-133644`

### Display

Systemd user service:

```text
/home/kiosk-j/.config/systemd/user/kiosk-display.service
```

Script:

```text
/home/kiosk-j/.local/bin/kiosk-display-setup.sh
```

목표 상태:

- TV/모니터 native `1920x1080`
- 화면 회전 right
- 논리 사용감은 세로 `1080x1920`

### Chrome update and popup hardening

Chrome managed policy:

```text
/etc/opt/chrome/policies/managed/kiosk-suppress-update-ui.json
```

목적:

- Chrome 업데이트 재시작 UI 억제
- 알림/팝업 억제
- 외부 앱 호출 스킴 차단

차단 스킴 예:

```text
tel, mailto, intent, kakaotalk, kakaolink, market, sms, line,
data, blob, file, instagram, facebook, zoom, slack, discord 등
```

이 정책은 `xdg-open을 여시겠습니까?` 같은 브라우저/OS 앱 실행 확인창을 막기 위한 안전장치다.

### Kiosk domain guard

상태: legacy fallback. 2026-06-15 이후 기본 운영에서는 사용하지 않는다.

Script:

```text
/home/kiosk-j/.local/bin/kiosk-url-guard.py
```

Service:

```text
/home/kiosk-j/.config/systemd/user/kiosk-url-guard.service
```

기능:

- Chrome DevTools `127.0.0.1:9222`를 감시
- 허용 도메인: `swingenjoy.com` 및 하위 도메인
- 외부 URL 감지 시 `http://127.0.0.1:9230/external?u=...`로 이동
- `홈으로 돌아가기`는 외부 페이지를 새로 로딩하지 않고 기존 홈 탭 활성화/외부 탭 정리 방식으로 처리
- 45초 후 자동 홈 복귀

이 기능은 PC/Chrome 주입 상태에 따라 실패할 수 있어, 운영 주 경로에서 제외했다.
사이트 `/kiosk` 라우트의 `KioskModeController`가 외부 링크 차단과 QR 안내를 담당한다.

### QR 안내

QR 대상:

```text
https://swingenjoy.com/
```

안내 문구:

```text
외부 링크 연결 기능 등 온전한 기능 사용은
모바일에서 댄스빌보드 사이트를 열어주세요.
```

### External link interception

상태: legacy fallback. 2026-06-15 이후 기본 운영에서는 사이트 코드가 담당한다.

Mini PC 전용 Chrome extension:

```text
/home/kiosk-j/.local/share/kiosk-domain-guard/
```

주요 파일:

- `external-link-qr.js`
- `external-lock.css`
- `kiosk-tv.css`
- `kiosk-carousel-controls.js`
- `kiosk-carousel-controls.css`
- `manifest.json`
- `swingenjoy-qr.png`

외부 이동 차단 경로:

- 일반 외부 `<a href>`
- `window.open()`
- `location.href`
- `form submit`
- `tel:`
- `intent://`
- `data:`
- `blob:`
- `file:`

### TV 전용 CSS

상태: legacy fallback. 2026-06-15 이후 기본 운영에서는 사이트 코드의 `src/styles/kiosk-mode.css`가 담당한다.

파일:

```text
/home/kiosk-j/.local/share/kiosk-domain-guard/kiosk-tv.css
```

목적:

- TV 세로 표시에서 댄스빌보드 홈이 잘리지 않게 보정
- 헤더/하단 메뉴/광고 카드 크기 조정
- 광고 카드 겹침 구조 유지
- 광고 좌우 버튼 표시

주의:

- 사용자가 광고 카드 겹침, 뒤 카드 크기, opacity 변경에 매우 민감했다.
- 카드 크기/겹침/opacity는 임의로 바꾸지 말 것.

### 광고 좌우 버튼

상태: legacy fallback. 2026-06-15 이후 기본 운영에서는 사이트 코드의 `KioskModeController`가 담당한다.

파일:

```text
kiosk-carousel-controls.js
kiosk-carousel-controls.css
```

목적:

- 키오스크 마우스 환경에서 광고 좌우 이동이 어려워서 좌/우 버튼을 추가
- 버튼 클릭은 광고 상세 진입이 아니라 carousel indicator 이동을 트리거

## 검증한 항목

### 2026-06-15 사이트 `/kiosk` 라우트 검증

운영 배포:

- 깨끗한 임시 worktree `/Users/inteyeo/.codex/tmp/rhythmjoy-kiosk-deploy`에서 키오스크 변경만 적용해 `npm run deploy:cafe24` 실행
- 운영 `https://swingenjoy.com/kiosk`: `200 OK`
- 운영 `version.json`: `2026-06-15T04:42:35.803Z`
- 운영 app bundle: `https://swingenjoy.com/assets/index-BCc3GuXu.js`

검증 결과:

- `/kiosk` 진입 후 URL은 `https://swingenjoy.com/`로 replace
- `html`, `body`에 `kiosk-link-router-active v2-home-mode` 적용
- 키오스크 모드에서는 서비스워커가 page controller가 되지 않음
- 외부 `<a href="https://example.com/...">` 클릭 시 페이지 이탈 없이 QR 안내 표시
- 실제 `window.open("https://example.com/...")` 버튼 경로도 QR 안내 표시
- QR 안내 문구와 45초 자동 홈 복귀 카운트 표시

Mini PC 원격 Chrome에서 최종 확인:

- 원격 DevTools tunnel: `ssh -N -L 9223:127.0.0.1:9222 kiosk-j@172.30.1.13`
- `/kiosk?fresh=...` 진입 후 최종 URL: `https://swingenjoy.com/`
- 로드된 bundle: `assets/index-BCc3GuXu.js`
- `localStorage["rhythmjoy:kiosk-mode"]`: `mini-pc`
- `sessionStorage["rhythmjoy:kiosk-mode"]`: `mini-pc`
- `navigator.serviceWorker.controller`: `false`
- 외부 테스트 링크 `https://example.com/kiosk-test` 클릭 시 `#kiosk-external-lock` QR 오버레이 표시

### 2026-06-15 Mini PC 원격 적용 절차

SSH 접속:

```bash
ssh kiosk-j@172.30.1.13
```

현재 Mac에는 Mini PC용 SSH key가 없으므로 비밀번호 프롬프트가 뜬다.
비밀번호는 채팅에 남기지 말고 터미널 프롬프트에 직접 입력한다.

접속 후 실행할 명령:

```bash
set -e
SERVICE="$HOME/.config/systemd/user/kiosk-chrome.service"
cp "$SERVICE" "$SERVICE.bak-$(date +%Y%m%d-%H%M%S)"
python3 - <<'PY'
from pathlib import Path

path = Path.home() / ".config/systemd/user/kiosk-chrome.service"
text = path.read_text()
text = text.replace(
    " --disable-extensions-except=/home/kiosk-j/.local/share/kiosk-domain-guard --load-extension=/home/kiosk-j/.local/share/kiosk-domain-guard",
    "",
)
text = text.replace(" https://swingenjoy.com/", " https://swingenjoy.com/kiosk")
path.write_text(text)
PY
systemctl --user daemon-reload
systemctl --user disable --now kiosk-url-guard.service || true
systemctl --user restart kiosk-display.service kiosk-chrome.service
systemctl --user is-active kiosk-chrome.service kiosk-display.service
systemctl --user is-enabled kiosk-url-guard.service || true
systemctl --user cat kiosk-chrome.service
```

기대 상태:

- `kiosk-chrome.service`: `active`
- `kiosk-display.service`: `active`
- `kiosk-url-guard.service`: `disabled`
- `kiosk-chrome.service`의 마지막 URL: `https://swingenjoy.com/kiosk`

### 외부 링크 테스트

실행 파일:

```text
/tmp/test_kiosk_external_links.py
```

검증 결과:

- `https://linktr.ee/neoswing` 클릭: QR 안내
- `window.open("https://open.kakao.com/...")`: QR 안내
- `location.href = "https://linktr.ee/..."`: QR 안내
- 외부 form submit: QR 안내
- `tel:` 클릭: QR 안내 또는 정책 차단
- `intent://`: QR 안내
- `data:` 강제 이동: 홈 유지 또는 정책 차단

### 내부 라우트 테스트

실행 파일:

```text
/tmp/test_kiosk_route_external_links.py
```

검증 라우트:

- `https://swingenjoy.com/events`
- `https://swingenjoy.com/oneday`
- `https://swingenjoy.com/board`

각 라우트에서 검증:

- 외부 링크 클릭
- `window.open`
- `location.href`

결과:

- 모두 QR 안내 페이지로 이동
- 최종 홈 복귀 확인

### 현재 상태 확인

백업 당시:

- `kiosk-chrome.service`: active
- `kiosk-display.service`: active
- `kiosk-url-guard.service`: legacy fallback, 기본 disabled 권장
- Chrome 탭: `https://swingenjoy.com/ :: 댄스빌보드`
- Chrome 시작 URL: `https://swingenjoy.com/kiosk`
- 로드된 운영 bundle: `assets/index-B3LKFnlq.js`

상태 로그:

```text
ops/kiosk/mini-pc/status/
```

### 2026-06-15 13:52 KST 메뉴/장르 위치 재검증

사이트 키오스크 CSS를 다시 배포했다.

- 운영 버전: `version.json` buildTime `1781499072842`
- 운영 번들: `assets/index-B3LKFnlq.js`
- 운영 CSS: `assets/index-B_uTh6zM.css`
- Cafe24 운영 배포: 완료
- Git commit/push: 키오스크 변경 전용 커밋으로 수행
- Mini PC Chrome 실제 viewport: `772 x 1372`
- 장르 탭 위치: header bottom `127.99px`, genre top `134.99px`
- 하단 메뉴 접힘: panel height `150px`
- 하단 메뉴 펼침: panel height `375.58px`, `overflowY: visible`
- 메뉴 확인 후 Mini PC 화면은 다시 `/kiosk` 진입 상태의 접힌 메뉴로 복귀시켰다.

수정 의도:

- 키오스크에서 하단 메뉴가 내부 스크롤만 생기지 않고 위로 펼쳐지게 한다.
- 키오스크 헤더 확대 때문에 장르 탭이 헤더에 가려지지 않게 홈 본문 시작 위치를 조금 내린다.

## 복원 방법

이 폴더에서:

```bash
SSH_KEY=/path/to/ssh/key ./restore-mini-pc-kiosk.sh kiosk-j@172.30.1.13
```

SSH key 없이 기존 SSH 설정을 쓰려면:

```bash
./restore-mini-pc-kiosk.sh kiosk-j@172.30.1.13
```

복원 후 확인:

```bash
ssh kiosk-j@172.30.1.13 'systemctl --user is-active kiosk-chrome.service kiosk-display.service; systemctl --user is-enabled kiosk-url-guard.service || true'
```

`kiosk-chrome.service`, `kiosk-display.service`는 `active`가 나와야 한다.
`kiosk-url-guard.service`는 legacy fallback이므로 기본은 `disabled`가 맞다.

## 다음 작업자가 조심할 점

- 사이트 프로젝트 파일을 수정할 작업과 키오스크 운영 설정 작업을 섞지 말 것.
- 2026-06-15 이후 키오스크 CSS/외부 링크 제한은 사이트 `/kiosk` 라우트가 담당한다.
- Mini PC extension 주입 방식은 legacy fallback으로만 다룰 것.
- Chrome profile, cookie, password, SSH private key는 repo에 넣지 말 것.
- 외부 링크 관련 수정 후 반드시 아래 케이스를 다시 테스트할 것:
  - 일반 외부 링크
  - 상세 페이지 외부 링크
  - `window.open`
  - `location.href`
  - `form submit`
  - `tel:`
  - `intent://`
  - `data:` 또는 `blob:`
