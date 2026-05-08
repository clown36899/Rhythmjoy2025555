#!/bin/bash

set -u

export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
export HOME=/Users/inteyeo

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-8729202565:AAGUm9aGEFxDneskGyPrV0EAcz1KP7z6WcM}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-8639707405}"
LOG_FILE="${LOG_FILE:-/Users/inteyeo/claude_ingestion.log}"
PROJECT_ROOT="${PROJECT_ROOT:-/Users/inteyeo/Rhythmjoy2025555-5}"
RUN_OUTPUT="/tmp/ingestion_run_$$.txt"
LOCK_DIR="/tmp/rhythmjoy-ingestion.lock"
LOCK_MAX_AGE_SECONDS=21600
TIMEOUT_SECONDS=1200

telegram_notify() {
    local text="$1"
    local escaped
    escaped=$(printf '%s' "$text" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"${TELEGRAM_CHAT_ID}\",\"text\":${escaped},\"parse_mode\":\"Markdown\"}" \
        > /dev/null 2>&1
}

cleanup_lock() {
    if [ -d "$LOCK_DIR" ] && [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
        rm -rf "$LOCK_DIR"
    fi
}

kill_tree() {
    local pid="$1"
    local signal="${2:-TERM}"
    local child

    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child" "$signal"
    done

    kill "-$signal" "$pid" 2>/dev/null || true
}

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "$$" > "$LOCK_DIR/pid"
        date +%s > "$LOCK_DIR/started_at"
        trap cleanup_lock EXIT INT TERM
        return 0
    fi

    local old_pid started_at now age
    old_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    started_at=$(cat "$LOCK_DIR/started_at" 2>/dev/null || echo 0)
    now=$(date +%s)
    age=$((now - started_at))

    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null && [ "$age" -lt "$LOCK_MAX_AGE_SECONDS" ]; then
        echo "--- 중복 실행 차단: 기존 PID=$old_pid / age=${age}s ---" >> "$LOG_FILE"
        telegram_notify "⚠️ *스윙씬 수집 중복 실행 차단*
기존 실행 PID: $old_pid
경과: ${age}s"
        exit 75
    fi

    echo "--- stale lock 정리: PID=${old_pid:-unknown} / age=${age}s ---" >> "$LOG_FILE"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" || exit 75
    echo "$$" > "$LOCK_DIR/pid"
    date +%s > "$LOCK_DIR/started_at"
    trap cleanup_lock EXIT INT TERM
}

echo "--- 🚀 수집 시작: $(date '+%Y-%m-%d %H:%M:%S') ---" >> "$LOG_FILE"

acquire_lock

telegram_notify "🔄 *스윙씬 수집 시작*
📅 $(date '+%Y-%m-%d %H:%M')"

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
cd "$PROJECT_ROOT" || exit 1

# macOS 기본 환경에는 setsid가 없다. job control로 background job을 별도 process group으로 실행한다.
set -m
/opt/homebrew/bin/claude -p "/web-search-ingestion" \
    --output-format text \
    --max-turns 120 \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_evaluate,mcp__playwright__browser_wait_for,mcp__playwright__browser_close,mcp__playwright__browser_navigate_back,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_select_option,mcp__playwright__browser_tabs,mcp__playwright__browser_resize,mcp__playwright__browser_network_requests,mcp__playwright__browser_console_messages,mcp__playwright__browser_handle_dialog,mcp__playwright__browser_hover,mcp__playwright__browser_drag,mcp__playwright__browser_fill_form,mcp__playwright__browser_file_upload" \
    > "$RUN_OUTPUT" 2>&1 &

CLAUDE_PID=$!

(sleep "$TIMEOUT_SECONDS"; echo "--- ⏱ watchdog: ${TIMEOUT_SECONDS}s 초과, PID/PGID=$CLAUDE_PID 정리 ---" >> "$LOG_FILE"; kill -- -$CLAUDE_PID 2>/dev/null; kill_tree "$CLAUDE_PID" TERM; sleep 30; kill -- -$CLAUDE_PID 2>/dev/null; kill_tree "$CLAUDE_PID" KILL) &
WATCHDOG_PID=$!

wait $CLAUDE_PID
EXIT_CODE=$?

kill -- -$WATCHDOG_PID 2>/dev/null
kill_tree "$WATCHDOG_PID" TERM
kill $WATCHDOG_PID 2>/dev/null
kill -- -$CLAUDE_PID 2>/dev/null
kill_tree "$CLAUDE_PID" TERM

cat "$RUN_OUTPUT" >> "$LOG_FILE"
echo "--- 수집 종료: $(date '+%Y-%m-%d %H:%M:%S') / exit=$EXIT_CODE ---" >> "$LOG_FILE"

SUMMARY_BLOCK=$(awk '
    /==TELEGRAM_SUMMARY_START==/ { found=1; block=""; next }
    /==TELEGRAM_SUMMARY_END==/ { if(found) last=block; found=0; next }
    found { block = block "\n" $0 }
    END { print last }
' "$RUN_OUTPUT")

if [ -n "$SUMMARY_BLOCK" ]; then
    PARSED_NEW=$(echo "$SUMMARY_BLOCK"   | grep "^신규:"    | tail -1)
    PARSED_SKIP=$(echo "$SUMMARY_BLOCK"  | grep "^스킵:"    | tail -1)
    PARSED_BLOCK=$(echo "$SUMMARY_BLOCK" | grep "^접근불가:" | tail -1)
    PARSED_ISSUE=$(echo "$SUMMARY_BLOCK" | grep "^이슈:"    | tail -1)
else
    TODAY=$(date +%Y-%m-%d)
    SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null)
    SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null)
    if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ]; then
        NEW_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/scraped_events?is_collected=eq.false&created_at=gte.${TODAY}T00:00:00&select=id" \
            -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
            2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null || echo "?")
        PARSED_NEW="신규: ${NEW_COUNT}건 (오늘 DB 기준)"
    else
        PARSED_NEW="신규: 조회불가"
    fi
    PARSED_SKIP=""
    PARSED_BLOCK=""
    PARSED_ISSUE="⚠️ 에이전트가 요약 블록 미출력"
fi

rm -f "$RUN_OUTPUT"

if [ $EXIT_CODE -eq 0 ]; then
    telegram_notify "✅ *스윙씬 수집 완료*
📅 $(date '+%Y-%m-%d %H:%M')

${PARSED_NEW:-신규: -}
${PARSED_SKIP:-스킵: -}
${PARSED_BLOCK:-접근불가: -}
${PARSED_ISSUE:-이슈: 없음}

🔗 https://swingenjoy.com/admin/v2/ingestor"
else
    if [ $EXIT_CODE -eq 75 ]; then
        FAIL_REASON="중복 실행 차단"
    elif [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ]; then
        FAIL_REASON="⏱ 타임아웃/강제종료"
    else
        FAIL_REASON="Exit: $EXIT_CODE"
    fi
    telegram_notify "❌ *스윙씬 수집 실패*
📅 $(date '+%Y-%m-%d %H:%M')
${FAIL_REASON}

${PARSED_NEW:-}
${PARSED_BLOCK:-}
${PARSED_ISSUE:-}

🔗 https://swingenjoy.com/admin/v2/ingestor"
fi

exit $EXIT_CODE
