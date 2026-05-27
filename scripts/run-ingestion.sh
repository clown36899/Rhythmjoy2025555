#!/bin/bash

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
    echo "run-ingestion.sh는 source로 실행하지 말고 bash scripts/run-ingestion.sh 형태로 실행하세요." >&2
    return 2
fi

set -u

export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin
export HOME=/Users/inteyeo

INGESTION_ENV_FILE="${INGESTION_ENV_FILE:-/Users/inteyeo/.rhythmjoy-ingestion.env}"
if [ -f "$INGESTION_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$INGESTION_ENV_FILE"
    set +a
fi

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="${LOG_FILE:-/Users/inteyeo/claude_ingestion.log}"
PROJECT_ROOT="${PROJECT_ROOT:-/Users/inteyeo/Rhythmjoy2025555-5}"
LOCK_DIR="/tmp/rhythmjoy-ingestion.lock"
LOCK_MAX_AGE_SECONDS=21600
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1500}"
RUN_ID="$(date '+%Y%m%d_%H%M%S')_$$"
RUN_DIR="${RUN_DIR:-/Users/inteyeo/ingestion-runs}"
RUN_OUTPUT="$RUN_DIR/${RUN_ID}.jsonl"
RUN_LAST="$RUN_DIR/${RUN_ID}.last.txt"
RUN_META="$RUN_DIR/${RUN_ID}.meta"
INGESTION_PROFILE="${INGESTION_PROFILE:-swing-daily}"

if [ -z "${PROMPT_FILE:-}" ]; then
    case "$INGESTION_PROFILE" in
        expanded-research)
            PROMPT_FILE="$PROJECT_ROOT/scripts/codex-expanded-research-prompt.md"
            ;;
        *)
            PROMPT_FILE="$PROJECT_ROOT/scripts/codex-ingestion-prompt.md"
            ;;
    esac
fi

mkdir -p "$RUN_DIR"

log() {
    echo "$*" >> "$LOG_FILE"
}

load_supabase_env() {
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        # shellcheck disable=SC1091
        . "$PROJECT_ROOT/.env"
        set +a
    fi

    export SUPABASE_URL="${SUPABASE_URL:-${VITE_PUBLIC_SUPABASE_URL:-}}"
    export SUPABASE_KEY="${SUPABASE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
}

telegram_notify() {
    local text="$1"
    local payload http_code response_file

    if [ "${TELEGRAM_DRY_RUN:-0}" = "1" ]; then
        log "--- Telegram dry-run ---"
        log "$text"
        return 0
    fi

    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        log "--- Telegram 전송 스킵: TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 없음 ---"
        log "$text"
        return 0
    fi

    response_file="/tmp/rhythmjoy_telegram_${RUN_ID}.json"
    payload=$(printf '%s' "$text" | python3 -c "import sys,json; print(json.dumps({'chat_id':'${TELEGRAM_CHAT_ID}','text':sys.stdin.read()}))")

    http_code=$(curl -sS --max-time 15 -o "$response_file" -w "%{http_code}" \
        -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>> "$LOG_FILE" || echo "000")

    if [ "$http_code" = "200" ]; then
        log "--- Telegram 전송 성공: http=$http_code ---"
        rm -f "$response_file"
        return 0
    fi

    log "--- Telegram 전송 실패: http=$http_code / response=$(cat "$response_file" 2>/dev/null) ---"
    rm -f "$response_file"
    return 1
}

cleanup_lock() {
    if [ -d "$LOCK_DIR" ] && [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
        rm -rf "$LOCK_DIR"
    fi
}

handle_termination() {
    local signal_name="${1:-TERM}"
    log "--- Codex 수집 외부 종료 신호 수신: signal=$signal_name / run=$RUN_ID ---"

    if [ -n "${CODEX_PID:-}" ] && kill -0 "$CODEX_PID" 2>/dev/null; then
        kill_tree "$CODEX_PID" TERM
        sleep 3
        if kill -0 "$CODEX_PID" 2>/dev/null; then
            kill_tree "$CODEX_PID" KILL
        fi
    fi

    cleanup_playwright_mcp TERM
    cleanup_playwright_mcp KILL

    {
        echo "ended_at=$(date '+%Y-%m-%d %H:%M:%S')"
        echo "exit_code=143"
        echo "terminated_by=$signal_name"
    } >> "$RUN_META" 2>/dev/null || true

    telegram_notify "댄스 이벤트 Codex 수집 실패
$(date '+%Y-%m-%d %H:%M')
외부 종료 신호: $signal_name

신규: -
스킵: -
과거데이터삭제: ${INGESTION_PRE_CLEANUP_COUNT:--}
접근불가: -
이슈: 수집 프로세스가 summary 없이 중단됨

run: $RUN_ID
log: $RUN_OUTPUT" || true

    cleanup_lock
    exit 143
}

kill_tree() {
    local pid="$1"
    local signal="${2:-TERM}"
    local child

    if [ -z "$pid" ]; then
        return 0
    fi

    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child" "$signal"
    done

    kill "-$signal" "$pid" 2>/dev/null || true
}

cleanup_playwright_mcp() {
    local signal="${1:-TERM}"
    pkill "-$signal" -f "npm exec @playwright/mcp@latest --cdp-endpoint http://localhost:9222" 2>/dev/null || true
    pkill "-$signal" -f "playwright-mcp --cdp-endpoint http://localhost:9222" 2>/dev/null || true
}

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "$$" > "$LOCK_DIR/pid"
        date +%s > "$LOCK_DIR/started_at"
        trap cleanup_lock EXIT
        trap 'handle_termination INT' INT
        trap 'handle_termination TERM' TERM
        return 0
    fi

    local old_pid started_at now age
    old_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    started_at=$(cat "$LOCK_DIR/started_at" 2>/dev/null || echo 0)
    now=$(date +%s)
    age=$((now - started_at))

    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null && [ "$age" -lt "$LOCK_MAX_AGE_SECONDS" ]; then
        log "--- 중복 실행 차단: 기존 PID=$old_pid / age=${age}s ---"
        telegram_notify "스윙씬 수집 중복 실행 차단
기존 실행 PID: $old_pid
경과: ${age}s"
        exit 75
    fi

    log "--- stale lock 정리: PID=${old_pid:-unknown} / age=${age}s ---"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" || exit 75
    echo "$$" > "$LOCK_DIR/pid"
    date +%s > "$LOCK_DIR/started_at"
    trap cleanup_lock EXIT
    trap 'handle_termination INT' INT
    trap 'handle_termination TERM' TERM
}

find_codex() {
    if [ -n "${CODEX_BIN:-}" ] && [ -x "$CODEX_BIN" ]; then
        echo "$CODEX_BIN"
        return 0
    fi

    command -v codex 2>/dev/null && return 0
    [ -x "/Applications/Codex.app/Contents/Resources/codex" ] && echo "/Applications/Codex.app/Contents/Resources/codex" && return 0
    return 1
}

count_new_today() {
    local today
    today=$(date +%Y-%m-%d)
    load_supabase_env
    if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_KEY:-}" ]; then
        curl -s "$SUPABASE_URL/rest/v1/scraped_events?is_collected=eq.false&created_at=gte.${today}T00:00:00&select=id" \
            -H "apikey: $SUPABASE_KEY" \
            -H "Authorization: Bearer $SUPABASE_KEY" \
            2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?"
    else
        echo "?"
    fi
}

run_ingestion_preflight() {
    if [ ! -f "$PROJECT_ROOT/scripts/test-ingestion-standards.mjs" ]; then
        log "--- 수집 기준 테스트 파일 없음: scripts/test-ingestion-standards.mjs ---"
        telegram_notify "댄스 이벤트 Codex 수집 실패
수집 기준 테스트 파일이 없습니다.
run: $RUN_ID"
        exit 78
    fi

    if ! node "$PROJECT_ROOT/scripts/test-ingestion-standards.mjs" >> "$LOG_FILE" 2>&1; then
        log "--- 수집 기준 테스트 실패 ---"
        telegram_notify "댄스 이벤트 Codex 수집 실패
수집 기준 사전검사 실패
run: $RUN_ID"
        exit 78
    fi

    log "--- 수집 기준 테스트 통과 ---"

    if [ "$INGESTION_PROFILE" = "swing-daily" ]; then
        if ! node --input-type=module <<'NODE' >> "$LOG_FILE" 2>&1
import { getAutomationSourceList } from './scripts/ingestion/collection-registry.mjs';

const sources = getAutomationSourceList('swing-daily');
const invalid = sources.filter((source) => {
  const url = String(source.url || '');
  return source.scope !== 'swing'
    || source.saveEnabled !== true
    || /batswing\.co\.kr|meroniswing\.com/i.test(url);
});

if (!sources.length) {
  console.error('swing-daily source list is empty');
  process.exit(1);
}

if (invalid.length) {
  console.error('swing-daily contains invalid sources:', JSON.stringify(invalid, null, 2));
  process.exit(1);
}

console.log(`swing-daily source guard passed: ${sources.length} sources`);
NODE
        then
            log "--- swing-daily 소스 가드 실패 ---"
            telegram_notify "댄스 이벤트 Codex 수집 실패
swing-daily 소스 가드 실패
run: $RUN_ID"
            exit 78
        fi

        log "--- swing-daily 소스 가드 통과 ---"
    fi
}

run_past_cleanup() {
    local cleanup_log result cleanup_count cleanup_deleted
    cleanup_log="$RUN_DIR/${RUN_ID}.cleanup.json"

    if ! result=$(node "$PROJECT_ROOT/scripts/ingestion/cleanup-past-collected.mjs" --apply --out "$cleanup_log" 2>> "$LOG_FILE"); then
        log "--- 과거 완료 데이터 정리 실패: log=$cleanup_log ---"
        telegram_notify "댄스 이벤트 Codex 수집 실패
과거 완료 데이터 정리 사전검사 실패
run: $RUN_ID
log: $cleanup_log"
        exit 78
    fi

    cleanup_count=$(node -e "const data=JSON.parse(process.argv[1]); console.log(data.count ?? '?')" "$result" 2>/dev/null || echo "?")
    cleanup_deleted=$(node -e "const data=JSON.parse(process.argv[1]); console.log(data.deleted ?? '?')" "$result" 2>/dev/null || echo "?")

    export INGESTION_PRE_CLEANUP_COUNT="$cleanup_deleted"
    export INGESTION_PRE_CLEANUP_CANDIDATES="$cleanup_count"
    export INGESTION_PRE_CLEANUP_LOG="$cleanup_log"

    echo "cleanup_log=$cleanup_log" >> "$RUN_META"
    echo "cleanup_candidates=$cleanup_count" >> "$RUN_META"
    echo "cleanup_deleted=$cleanup_deleted" >> "$RUN_META"
    log "--- 과거 완료 데이터 정리: candidates=$cleanup_count / deleted=$cleanup_deleted / log=$cleanup_log ---"
}

extract_summary() {
    awk '
        /==TELEGRAM_SUMMARY_START==/ { found=1; block=""; next }
        /==TELEGRAM_SUMMARY_END==/ { if(found) last=block; found=0; next }
        found { block = block "\n" $0 }
        END { print last }
    ' "$RUN_LAST" "$RUN_OUTPUT" 2>/dev/null
}

build_fallback_summary() {
    local issue_line="$1"
    local new_line skip_line cleanup_line block_line

    new_line="신규: $(count_new_today)건 (오늘 DB 기준)"
    skip_line="스킵: -"
    cleanup_line="과거데이터삭제: ${INGESTION_PRE_CLEANUP_COUNT:--}"
    block_line="접근불가: -"

    cat <<EOF
${new_line}
${skip_line}
${cleanup_line}
${block_line}
이슈: ${issue_line}
EOF
}

build_smoke_prompt() {
    cat <<'EOF'
Do not edit files. Do not run ingestion. This is a smoke test for scheduled Codex execution.
Confirm that you can read the repository and then print exactly:

==TELEGRAM_SUMMARY_START==
신규: 0건
스킵: 0건
과거데이터삭제: 0건
접근불가: smoke-test(none)
이슈: smoke test ok
==TELEGRAM_SUMMARY_END==
EOF
}

log "--- Codex 수집 시작: $(date '+%Y-%m-%d %H:%M:%S') / run=$RUN_ID ---"

acquire_lock
cleanup_playwright_mcp TERM

telegram_notify "댄스 이벤트 Codex 수집 시작
$(date '+%Y-%m-%d %H:%M')
run: $RUN_ID"

if ! curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    log "Chrome CDP 시작 중..."
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --remote-debugging-port=9222 \
        --user-data-dir="/Users/inteyeo/.chrome-automation" \
        --headless=new \
        --no-first-run \
        --no-default-browser-check &
    sleep 6
fi

cd "$PROJECT_ROOT" || exit 1
load_supabase_env
run_ingestion_preflight

CODEX="$(find_codex || true)"
if [ -z "$CODEX" ]; then
    log "--- Codex 실행 파일 없음 ---"
    telegram_notify "댄스 이벤트 Codex 수집 실패
Codex CLI를 찾을 수 없습니다."
    exit 127
fi

if [ "${INGESTION_SMOKE_TEST:-0}" = "1" ]; then
    build_smoke_prompt > "$RUN_DIR/${RUN_ID}.prompt.md"
else
    cp "$PROMPT_FILE" "$RUN_DIR/${RUN_ID}.prompt.md"
fi

echo "run_id=$RUN_ID" > "$RUN_META"
echo "started_at=$(date '+%Y-%m-%d %H:%M:%S')" >> "$RUN_META"
echo "codex=$CODEX" >> "$RUN_META"
echo "profile=$INGESTION_PROFILE" >> "$RUN_META"
echo "prompt=$RUN_DIR/${RUN_ID}.prompt.md" >> "$RUN_META"
echo "output=$RUN_OUTPUT" >> "$RUN_META"
echo "last=$RUN_LAST" >> "$RUN_META"

if [ "${INGESTION_SKIP_CLEANUP:-0}" = "1" ]; then
    export INGESTION_PRE_CLEANUP_COUNT=0
    export INGESTION_PRE_CLEANUP_CANDIDATES=0
    export INGESTION_PRE_CLEANUP_LOG=""
    echo "cleanup_skipped=true" >> "$RUN_META"
    echo "cleanup_candidates=0" >> "$RUN_META"
    echo "cleanup_deleted=0" >> "$RUN_META"
    log "--- 과거 완료 데이터 정리 스킵: INGESTION_SKIP_CLEANUP=1 ---"
else
    run_past_cleanup
fi

TIMEOUT_FLAG="$RUN_DIR/${RUN_ID}.timeout"
rm -f "$TIMEOUT_FLAG"

"$CODEX" --search exec \
    --cd "$PROJECT_ROOT" \
    --sandbox danger-full-access \
    --dangerously-bypass-approvals-and-sandbox \
    -c shell_environment_policy.inherit=all \
    --json \
    --output-last-message "$RUN_LAST" \
    - < "$RUN_DIR/${RUN_ID}.prompt.md" \
    > "$RUN_OUTPUT" 2>&1 &

CODEX_PID=$!
echo "codex_pid=$CODEX_PID" >> "$RUN_META"

DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))
EXIT_CODE=0
TIMED_OUT=0

while kill -0 "$CODEX_PID" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        TIMED_OUT=1
        {
            echo "timeout_at=$(date '+%Y-%m-%d %H:%M:%S')"
            echo "timeout_after_seconds=$TIMEOUT_SECONDS"
        } > "$TIMEOUT_FLAG"

        log "--- Codex 수집 타임아웃: pid=$CODEX_PID / ${TIMEOUT_SECONDS}s ---"
        kill_tree "$CODEX_PID" TERM
        cleanup_playwright_mcp TERM
        sleep 10

        if kill -0 "$CODEX_PID" 2>/dev/null; then
            log "--- Codex 수집 강제 종료: pid=$CODEX_PID ---"
            kill_tree "$CODEX_PID" KILL
        fi
        cleanup_playwright_mcp KILL
        break
    fi

    sleep 5
done

if [ "$TIMED_OUT" -eq 1 ]; then
    wait "$CODEX_PID" 2>/dev/null || true
    EXIT_CODE=124
else
    wait "$CODEX_PID"
    EXIT_CODE=$?
fi

if [ -f "$TIMEOUT_FLAG" ]; then
    EXIT_CODE=124
    cat "$TIMEOUT_FLAG" >> "$RUN_META"
fi

kill_tree "$CODEX_PID" TERM
cleanup_playwright_mcp TERM

echo "ended_at=$(date '+%Y-%m-%d %H:%M:%S')" >> "$RUN_META"
echo "exit_code=$EXIT_CODE" >> "$RUN_META"

perl -pe 's/(SUPABASE_(?:SERVICE_)?KEY[=:]\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(TELEGRAM_BOT_TOKEN[=:]\s*)[A-Za-z0-9:_-]+/${1}[REDACTED]/g; s/(Bearer\s+)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(apikey:\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/gi' "$RUN_OUTPUT" >> "$LOG_FILE"
log "--- Codex 수집 종료: $(date '+%Y-%m-%d %H:%M:%S') / exit=$EXIT_CODE / run=$RUN_ID ---"

SUMMARY_BLOCK="$(extract_summary)"

if [ -z "$SUMMARY_BLOCK" ]; then
    if [ "$EXIT_CODE" -eq 124 ] || [ "$EXIT_CODE" -eq 137 ]; then
        SUMMARY_BLOCK="$(build_fallback_summary "타임아웃/강제종료로 Codex summary block missing")"
    elif [ "$EXIT_CODE" -eq 143 ]; then
        SUMMARY_BLOCK="$(build_fallback_summary "외부 종료 신호로 Codex summary block missing")"
    else
        SUMMARY_BLOCK="$(build_fallback_summary "Codex summary block missing")"
    fi

    {
        echo "==TELEGRAM_SUMMARY_START=="
        echo "$SUMMARY_BLOCK"
        echo "==TELEGRAM_SUMMARY_END=="
    } > "$RUN_LAST"

    log "--- fallback summary 생성: run=$RUN_ID / exit=$EXIT_CODE ---"
fi

PARSED_NEW=$(echo "$SUMMARY_BLOCK" | grep "^신규:" | tail -1)
PARSED_SKIP=$(echo "$SUMMARY_BLOCK" | grep "^스킵:" | tail -1)
PARSED_CLEANUP=$(echo "$SUMMARY_BLOCK" | grep "^과거데이터삭제:" | tail -1)
PARSED_BLOCK=$(echo "$SUMMARY_BLOCK" | grep "^접근불가:" | tail -1)
PARSED_ISSUE=$(echo "$SUMMARY_BLOCK" | grep "^이슈:" | tail -1)

if [ $EXIT_CODE -eq 0 ]; then
    telegram_notify "댄스 이벤트 Codex 수집 완료
$(date '+%Y-%m-%d %H:%M')

${PARSED_NEW:-신규: -}
${PARSED_SKIP:-스킵: -}
${PARSED_CLEANUP:-과거데이터삭제: -}
${PARSED_BLOCK:-접근불가: -}
${PARSED_ISSUE:-이슈: 없음}

run: $RUN_ID
https://swingenjoy.com/admin/v2/ingestor"
else
    if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ]; then
        FAIL_REASON="타임아웃/강제종료"
    elif [ $EXIT_CODE -eq 75 ]; then
        FAIL_REASON="중복 실행 차단"
    else
        FAIL_REASON="Exit: $EXIT_CODE"
    fi

    telegram_notify "댄스 이벤트 Codex 수집 실패
$(date '+%Y-%m-%d %H:%M')
${FAIL_REASON}

${PARSED_NEW:-}
${PARSED_BLOCK:-}
${PARSED_ISSUE:-}

run: $RUN_ID
log: $RUN_OUTPUT"
fi

exit $EXIT_CODE
