# 스윙씬 자동 수집 시스템 — 재구축 가이드

> 이 문서는 컴퓨터가 교체/초기화되었을 때 수집 시스템 전체를 그대로 복구하기 위한 기록입니다.  
> **마지막 검증**: 2026-05-10 (Codex smoke test exit=0 확인)

---

## 전체 구조 한눈에 보기

```
macOS LaunchAgent (매일 08:00 자동 실행)
  └─ /Users/inteyeo/scripts/run-ingestion.sh
       ├─ Telegram: 수집 시작 알림
       ├─ Chrome headless (CDP 포트 9222) 실행
       ├─ codex exec + Web Search Ingestion V2
       │    └─ SKILL.md 지침에 따라 Instagram/네이버카페 등 순회
       │         → Codex가 브라우저/웹 검색/쉘 도구로 실제 소스 확인
       │         → 이미지 Supabase Storage 업로드
       │         → scraped_events 테이블 INSERT
       │         → /Users/inteyeo/ingestion-runs 에 JSONL/최종 요약 기록
       └─ Telegram: 수집 완료/실패 알림 + 알림 전송 결과 로그
```

---

## 1단계 — 필수 소프트웨어 설치

```bash
# Homebrew (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Codex CLI
# Codex 앱 설치 후 `codex --version` 이 동작해야 한다.

# Node.js (npx 필요) + ripgrep
brew install node
brew install ripgrep

# Netlify CLI (환경변수 조회용)
npm install -g netlify-cli
netlify login  # 브라우저에서 인증
```

---

## 2단계 — 프로젝트 클론 및 의존성

```bash
git clone https://github.com/clown36899/Rhythmjoy2025555.git /Users/inteyeo/Rhythmjoy2025555-5
cd /Users/inteyeo/Rhythmjoy2025555-5
npm install

# Netlify 프로젝트 연결 (환경변수 접근용)
netlify link  # 프로젝트 선택: Rhythmjoy2025555
```

---

## 3단계 — Codex 실행 확인

```bash
cd /Users/inteyeo/Rhythmjoy2025555-5
codex --version
codex exec --cd /Users/inteyeo/Rhythmjoy2025555-5 "Do not edit files. Reply CODEX_OK"
```

> Codex 자동 실행은 `codex exec` 비대화 모드로 동작한다. 실행 로그는 JSONL로 남긴다.

---

## 4단계 — 실행 스크립트 생성

```bash
mkdir -p /Users/inteyeo/scripts
cp /Users/inteyeo/Rhythmjoy2025555-5/scripts/run-ingestion.sh /Users/inteyeo/scripts/run-ingestion.sh
chmod +x /Users/inteyeo/scripts/run-ingestion.sh
```

`scripts/run-ingestion.sh`는 git 관리 대상이다. 운영 파일을 직접 편집하지 말고 repo 스크립트를 수정한 뒤 위 명령으로 설치한다.

핵심 안전장치:
- Claude CLI를 사용하지 않고 `codex exec`로 실행한다.
- `/Users/inteyeo/ingestion-runs/{run_id}.jsonl`, `.last.txt`, `.meta`를 남긴다.
- `/tmp/rhythmjoy-ingestion.lock`으로 중복 실행을 차단한다.
- `gtimeout`으로 hang 된 Codex 실행을 정리한다.
- Telegram 전송 성공/실패를 로그에 남긴다.
- `==TELEGRAM_SUMMARY_*==` 블록이 없어도 실패/완료 알림을 보낸다.

---

## 5단계 — LaunchAgent 등록 (매일 08:00 자동 실행)

`/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.codex-ingestion.plist` 파일은 repo의 `scripts/com.rhythmjoy.codex-ingestion.plist`를 설치한다.

```bash
cp scripts/com.rhythmjoy.codex-ingestion.plist ~/Library/LaunchAgents/com.rhythmjoy.codex-ingestion.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rhythmjoy.codex-ingestion.plist

# 로드 확인
launchctl list | grep rhythmjoy
# 출력: -  0  com.rhythmjoy.codex-ingestion
```

> **macOS 동작 조건**: 전원 연결(충전기) 상태에서 덮개를 닫아도 08:00에 실행됨.  
> 배터리만으로 덮개 닫으면 깊은 잠자기로 실행 안 될 수 있음.

---

## 6단계 — 수동 테스트 실행

```bash
/bin/bash /Users/inteyeo/scripts/run-ingestion.sh
```

- 약 15~20분 소요
- 완료 시 Telegram으로 결과 알림 도착
- 로그 확인: `tail -50 /Users/inteyeo/claude_ingestion.log`

---

## 환경변수 / 인증 정보

| 항목 | 값/위치 |
|------|---------|
| Supabase URL | `https://mkoryudscamnopvxdelk.supabase.co` |
| Supabase Service Key | Netlify 환경변수 `SUPABASE_SERVICE_KEY` — `netlify env:get SUPABASE_SERVICE_KEY` |
| Telegram Bot Token | `8729202565:AAGUm9aGEFxDneskGyPrV0EAcz1KP7z6WcM` |
| Telegram Chat ID | `8639707405` |
| Codex 인증 | `~/.codex/auth.json` — Codex 앱/CLI 로그인으로 복구 |

---

## 핵심 파일 경로

| 파일 | 역할 |
|------|------|
| `/Users/inteyeo/scripts/run-ingestion.sh` | 수집 실행 스크립트 |
| `/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.codex-ingestion.plist` | 자동 실행 스케줄러 |
| `/Users/inteyeo/claude_ingestion.log` | 실행 로그 |
| `/Users/inteyeo/ingestion-runs/` | 실행별 JSONL/최종 요약/메타 로그 |
| `.agents/skills/web-search-ingestion/SKILL.md` | 수집 에이전트 지침 (수집 소스 목록 포함) |

---

## 알려진 고정 불가 문제

| 소스 | 문제 | 대응 |
|------|------|------|
| Instagram 다수 계정 | 비로그인 접근 시 로그인 리다이렉트 (간헐적) | 자동 스킵 |
| BAT SWING (batswing.co.kr) | 사이트 DNS/SSL 오류 — 사이트 자체 죽어있음 | 자동 스킵 |
| 스위티스윙 Daum 카페 | SPA 구조로 Playwright 렌더링 실패 | 자동 스킵 |

---

## 인제스터 관리 화면

수집된 데이터 확인 및 게시 처리:  
👉 https://swingenjoy.com/admin/v2/ingestor
