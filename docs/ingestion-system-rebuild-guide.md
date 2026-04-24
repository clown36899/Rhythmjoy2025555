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
```

`/Users/inteyeo/scripts/run-ingestion.sh` 파일 내용:

```bash
#!/bin/bash

export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
export HOME=/Users/inteyeo

TELEGRAM_BOT_TOKEN="8729202565:AAGUm9aGEFxDneskGyPrV0EAcz1KP7z6WcM"
TELEGRAM_CHAT_ID="8639707405"
LOG_FILE="/Users/inteyeo/claude_ingestion.log"

telegram_notify() {
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"${TELEGRAM_CHAT_ID}\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" \
        > /dev/null 2>&1
}

echo "--- 🚀 수집 시작: $(date '+%Y-%m-%d %H:%M:%S') ---" >> "$LOG_FILE"

telegram_notify "🔄 *스윙씬 수집 시작*
📅 $(date '+%Y-%m-%d %H:%M')"

# Chrome CDP 모드 확인 및 실행
if ! curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    echo "Chrome CDP 시작 중..." >> "$LOG_FILE"
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --remote-debugging-port=9222 \
        --user-data-dir="/Users/inteyeo/.chrome-automation" \
        --headless=new \
        --no-first-run \
        --no-default-browser-check &
    sleep 6
fi

sleep 2

cd /Users/inteyeo/Rhythmjoy2025555-5

/opt/homebrew/bin/claude -p "/web-search-ingestion" \
    --output-format text \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_evaluate,mcp__playwright__browser_wait_for,mcp__playwright__browser_close,mcp__playwright__browser_navigate_back,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_select_option,mcp__playwright__browser_tabs,mcp__playwright__browser_resize,mcp__playwright__browser_network_requests,mcp__playwright__browser_console_messages,mcp__playwright__browser_handle_dialog,mcp__playwright__browser_hover,mcp__playwright__browser_drag,mcp__playwright__browser_fill_form,mcp__playwright__browser_file_upload" \
    >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "--- 수집 종료: $(date '+%Y-%m-%d %H:%M:%S') / exit=$EXIT_CODE ---" >> "$LOG_FILE"

SUMMARY=$(tail -n 40 "$LOG_FILE" | grep -E '신규|수집|스킵|완료|오류|실패|건' | tail -n 8 | sed 's/"/\\"/g')

if [ $EXIT_CODE -eq 0 ]; then
    telegram_notify "✅ *스윙씬 수집 완료*
📅 $(date '+%Y-%m-%d %H:%M')

${SUMMARY:-수집이 완료되었습니다.}

🔗 https://swingenjoy.com/admin/v2/ingestor"
else
    telegram_notify "❌ *스윙씬 수집 실패*
📅 $(date '+%Y-%m-%d %H:%M')
Exit: $EXIT_CODE

${SUMMARY:-로그를 확인하세요.}

🔗 https://swingenjoy.com/admin/v2/ingestor"
fi
```

```bash
chmod +x /Users/inteyeo/scripts/run-ingestion.sh
```

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
