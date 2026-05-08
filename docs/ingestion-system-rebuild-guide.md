# 스윙씬 자동 수집 시스템 — 재구축 가이드

> 이 문서는 컴퓨터가 교체/초기화되었을 때 수집 시스템 전체를 그대로 복구하기 위한 기록입니다.  
> **마지막 검증**: 2026-04-24 (테스트 실행 exit=0 확인)

---

## 전체 구조 한눈에 보기

```
macOS LaunchAgent (매일 08:00 자동 실행)
  └─ /Users/inteyeo/scripts/run-ingestion.sh
       ├─ Telegram: 수집 시작 알림
       ├─ Chrome headless (CDP 포트 9222) 실행
       ├─ claude -p "/web-search-ingestion" --allowedTools (Playwright MCP 포함)
       │    └─ SKILL.md 지침에 따라 Instagram/네이버카페 등 순회
       │         → Playwright MCP로 실제 브라우저 제어 (봇판정 방지 핵심)
       │         → 이미지 Supabase Storage 업로드
       │         → scraped_events 테이블 INSERT
       │         → INGESTION_STATUS.md 결과 기록
       └─ Telegram: 수집 완료/실패 알림 + 인제스터 링크
```

---

## 1단계 — 필수 소프트웨어 설치

```bash
# Homebrew (없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Claude Code CLI
brew install claude  # 또는 npm install -g @anthropic-ai/claude-code

# Node.js (npx 필요)
brew install node

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

## 3단계 — Playwright MCP 등록

Playwright MCP는 **프로젝트 로컬 scope**으로 등록되어야 합니다.

```bash
cd /Users/inteyeo/Rhythmjoy2025555-5

claude mcp add playwright \
  --scope local \
  npx @playwright/mcp@latest --cdp-endpoint http://localhost:9222
```

확인:
```bash
claude mcp get playwright
# Scope: Local config 이어야 함
# Command: npx @playwright/mcp@latest --cdp-endpoint http://localhost:9222
```

> **왜 Playwright MCP인가**: Instagram, 네이버 카페 등은 headless fetch로 접근 시 봇 차단됨.  
> 실제 Chrome 브라우저를 CDP로 제어해야 정상 접근 가능.

---

## 4단계 — 실행 스크립트 생성

```bash
mkdir -p /Users/inteyeo/scripts
cp /Users/inteyeo/Rhythmjoy2025555-5/scripts/run-ingestion.sh /Users/inteyeo/scripts/run-ingestion.sh
chmod +x /Users/inteyeo/scripts/run-ingestion.sh
```

`scripts/run-ingestion.sh`는 git 관리 대상이다. 운영 파일을 직접 편집하지 말고 repo 스크립트를 수정한 뒤 위 명령으로 설치한다.

핵심 안전장치:
- macOS에 없는 `setsid`를 사용하지 않는다.
- `/tmp/rhythmjoy-ingestion.lock`으로 중복 실행을 차단한다.
- 20분 watchdog으로 hang 된 Claude/Playwright 자식 프로세스를 정리한다.
- `==TELEGRAM_SUMMARY_*==` 블록이 없어도 실패/완료 알림을 보낸다.

---

## 5단계 — LaunchAgent 등록 (매일 08:00 자동 실행)

`/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.claude-ingestion.plist` 파일 내용:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rhythmjoy.claude-ingestion</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/inteyeo/scripts/run-ingestion.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/inteyeo/claude_ingestion.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/inteyeo/claude_ingestion.log</string>
</dict>
</plist>
```

```bash
# LaunchAgent 로드
launchctl load ~/Library/LaunchAgents/com.rhythmjoy.claude-ingestion.plist

# 로드 확인
launchctl list | grep rhythmjoy
# 출력: -  0  com.rhythmjoy.claude-ingestion  ← 정상
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
| Claude API Key | `~/.claude` 에 저장됨 — `claude` CLI 로그인으로 복구 |

---

## 핵심 파일 경로

| 파일 | 역할 |
|------|------|
| `/Users/inteyeo/scripts/run-ingestion.sh` | 수집 실행 스크립트 |
| `/Users/inteyeo/Library/LaunchAgents/com.rhythmjoy.claude-ingestion.plist` | 자동 실행 스케줄러 |
| `/Users/inteyeo/claude_ingestion.log` | 실행 로그 |
| `/Users/inteyeo/scripts/INGESTION_STATUS.md` | 수집 이력 및 잔존 문제 기록 |
| `.claude/skills/web-search-ingestion/SKILL.md` | 수집 에이전트 지침 (수집 소스 목록 포함) |

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
