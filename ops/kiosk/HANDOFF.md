# Kiosk Ops Handoff

이 폴더는 댄스빌보드 사이트 코드가 아니라, 현장 키오스크 운영 설정을 보관하는 공간이다.

다음 Codex 채팅에서 이어받을 때는 이 파일을 먼저 읽고, 이어서 아래 파일을 확인한다.

- Mini PC 백업과 복원: `ops/kiosk/mini-pc/README.md`
- Mini PC 작업 로그: `ops/kiosk/mini-pc/WORKLOG.md`
- Android TV 작업 메모: `ops/kiosk/android-tv/NOTES.md`

## 현재 관리 대상

- Mini PC Ubuntu 키오스크
- Mini PC의 Chrome 키오스크 실행, 세로 화면, TV 전용 CSS, 외부 링크 가드
- Android TV의 키오스크 방해 요소 차단 메모

## 저장 원칙

- 사이트 소스 코드는 `src/` 등 기존 프로젝트 영역에서 관리한다.
- 키오스크 운영 설정은 `ops/kiosk/` 아래에서만 관리한다.
- SSH 개인키, 비밀번호, Chrome 프로필, 쿠키, 로그인 세션은 저장하지 않는다.
- 원격 실제 경로의 `.local`, `.config`는 repo 안에서 `dot-local`, `dot-config`로 보관한다.
  프로젝트 `.gitignore`가 `.local`, `.config`, `*.json`, `*.png`를 무시하기 때문이다.

## 다음 채팅에서 물어볼 문장

```text
ops/kiosk/HANDOFF.md부터 읽고 미니PC 키오스크 상태 이어서 봐줘.
```

## 현재 스냅샷 위치

```text
ops/kiosk/mini-pc/
```

이 폴더는 `git add ops/kiosk/mini-pc ops/kiosk/HANDOFF.md ops/kiosk/android-tv`로 커밋 대상에 포함하면 된다.
