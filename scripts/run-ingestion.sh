#!/bin/bash

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
    echo "run-ingestion.sh는 source로 실행하지 말고 bash scripts/run-ingestion.sh 형태로 실행하세요." >&2
    return 2
fi

set -u

export PATH="${INGESTION_RUNTIME_PATH:-$HOME/.local/bin}:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export TZ="${TZ:-Asia/Seoul}"
umask 077

INGESTION_ENV_FILE="${INGESTION_ENV_FILE:-$HOME/.rhythmjoy-ingestion.env}"
if [ -f "$INGESTION_ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$INGESTION_ENV_FILE"
    set +a
fi

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
LOG_FILE="${LOG_FILE:-$HOME/claude_ingestion.log}"
PROJECT_ROOT="${PROJECT_ROOT:-$SCRIPT_DIR/..}"
LOCK_DIR="${INGESTION_LOCK_DIR:-/tmp/rhythmjoy-ingestion.lock}"
LOCK_MAX_AGE_SECONDS=21600
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1500}"
CODEX_STARTUP_CHECK="${CODEX_STARTUP_CHECK:-1}"
CODEX_STARTUP_TIMEOUT="${CODEX_STARTUP_TIMEOUT:-75}"
TELEGRAM_SEND_TIMEOUT="${TELEGRAM_SEND_TIMEOUT:-12}"
INGESTION_CHROME_HEADLESS="${INGESTION_CHROME_HEADLESS:-0}"
INGESTION_BROWSER_PORT="${INGESTION_BROWSER_PORT:-9222}"
export INGESTION_BROWSER_CDP_URL="${INGESTION_BROWSER_CDP_URL:-http://127.0.0.1:$INGESTION_BROWSER_PORT}"
export INGESTION_BROWSER_HEADLESS="$INGESTION_CHROME_HEADLESS"
export INGESTION_BROWSER_PROFILE_DIR="${INGESTION_BROWSER_PROFILE_DIR:-$HOME/.chrome-automation}"
INGESTION_INSTAGRAM_SAFE_MODE="${INGESTION_INSTAGRAM_SAFE_MODE:-1}"
INGESTION_INSTAGRAM_SOURCE_DELAY_MS="${INGESTION_INSTAGRAM_SOURCE_DELAY_MS:-30000}"
INGESTION_INSTAGRAM_POST_DELAY_MS="${INGESTION_INSTAGRAM_POST_DELAY_MS:-8000}"
INGESTION_INSTAGRAM_FAILURE_CIRCUIT_THRESHOLD="${INGESTION_INSTAGRAM_FAILURE_CIRCUIT_THRESHOLD:-3}"
INGESTION_NATIVE_RUN_BUDGET_MS="${INGESTION_NATIVE_RUN_BUDGET_MS:-1200000}"
INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS="${INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS:-20000}"
INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS="${INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS:-12000}"
INGESTION_NATIVE_INSTAGRAM_POST_LIMIT="${INGESTION_NATIVE_INSTAGRAM_POST_LIMIT:-}"
INGESTION_NATIVE_SOURCE_PRIORITY="${INGESTION_NATIVE_SOURCE_PRIORITY:-${INGESTION_NATIVE_PRIORITY:-}}"
export INGESTION_INSTAGRAM_SAFE_MODE
export INGESTION_INSTAGRAM_SOURCE_DELAY_MS
export INGESTION_INSTAGRAM_POST_DELAY_MS
export INGESTION_INSTAGRAM_FAILURE_CIRCUIT_THRESHOLD
export INGESTION_NATIVE_RUN_BUDGET_MS
export INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS
export INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS
export INGESTION_NATIVE_INSTAGRAM_POST_LIMIT
export INGESTION_NATIVE_SOURCE_PRIORITY
RUN_ID="$(date '+%Y%m%d_%H%M%S')_$$"
RUN_STARTED_AT_UTC="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
RUN_DIR="${RUN_DIR:-$HOME/ingestion-runs}"
RUN_OUTPUT="$RUN_DIR/${RUN_ID}.jsonl"
RUN_LAST="$RUN_DIR/${RUN_ID}.last.txt"
RUN_META="$RUN_DIR/${RUN_ID}.meta"
INGESTION_PROFILE="${INGESTION_PROFILE:-swing-daily}"
if [ -z "${INGESTION_ENGINE:-}" ]; then
    if [ "$INGESTION_PROFILE" = "swing-daily" ]; then
        INGESTION_ENGINE="native"
    else
        INGESTION_ENGINE="codex"
    fi
fi

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

. "$PROJECT_ROOT/scripts/ingestion/telegram-notify.sh"

cleanup_lock() {
    if [ -d "$LOCK_DIR" ] && [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
        rm -rf "$LOCK_DIR"
    fi
}

write_duplicate_run_artifacts() {
    local old_pid="$1"
    local age="$2"
    local summary_block

    summary_block="신규: 0건
스킵: 0건
과거데이터삭제: -
접근불가: none
인스타회로차단: none
수집대상없음: none
이슈: 중복 실행 차단: existing PID ${old_pid:-unknown}, age ${age}s"

    {
        echo "run_id=$RUN_ID"
        echo "started_at=$(date '+%Y-%m-%d %H:%M:%S')"
        echo "started_at_utc=$RUN_STARTED_AT_UTC"
        echo "engine=$INGESTION_ENGINE"
        echo "profile=$INGESTION_PROFILE"
        echo "duplicate_blocked=true"
        echo "duplicate_existing_pid=${old_pid:-unknown}"
        echo "duplicate_existing_age_seconds=$age"
        echo "prompt=$RUN_DIR/${RUN_ID}.prompt.md"
        echo "output=$RUN_OUTPUT"
        echo "last=$RUN_LAST"
        echo "ended_at=$(date '+%Y-%m-%d %H:%M:%S')"
        echo "exit_code=75"
    } > "$RUN_META"

    echo "Duplicate ingestion blocked by existing run ${old_pid:-unknown}" > "$RUN_DIR/${RUN_ID}.prompt.md"

    {
        echo "INGESTION_RESULT_JSON_START"
        printf '{"engine":"%s","insertCount":0,"skipCount":0,"accessFailures":[],"instagramCircuitSkips":{"count":0,"sources":[]},"noContentSources":[],"issues":["duplicate run blocked; existing PID %s age %ss"],"candidates":[],"deadlineReached":false,"remainingSources":[],"remainingSourceCount":0}\n' "$INGESTION_ENGINE" "${old_pid:-unknown}" "$age"
        echo "INGESTION_RESULT_JSON_END"
        echo "==TELEGRAM_SUMMARY_START=="
        echo "$summary_block"
        echo "==TELEGRAM_SUMMARY_END=="
    } > "$RUN_OUTPUT"

    cp "$RUN_OUTPUT" "$RUN_LAST" 2>/dev/null || true
}

handle_termination() {
    local signal_name="${1:-TERM}"
    log "--- 이벤트 수집 외부 종료 신호 수신: signal=$signal_name / run=$RUN_ID ---"

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

    telegram_notify "댄스 이벤트 수집 실패
$(date '+%Y-%m-%d %H:%M')
외부 종료 신호: $signal_name

신규: -
스킵: -
과거데이터삭제: ${INGESTION_PRE_CLEANUP_COUNT:--}
접근불가: -
이슈: 수집 프로세스가 summary 없이 중단됨

run: $RUN_ID
log: $RUN_OUTPUT" failure termination || true

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
    # Native workers own their child processes; never match another browser's MCP.
    [ "$INGESTION_ENGINE" = "native" ] && return 0
    local pid args
    while read -r pid; do
        args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
        if [[ "$args" == *"--cdp-endpoint $INGESTION_BROWSER_CDP_URL"* ]]; then
            kill "-$signal" "$pid" 2>/dev/null || true
        fi
    done < <(pgrep -f 'playwright-mcp|@playwright/mcp' || true)
}

cleanup_stale_chrome_singleton() {
    local lock_path lock_target lock_pid process_args
    lock_path="$INGESTION_BROWSER_PROFILE_DIR/SingletonLock"

    if [ ! -L "$lock_path" ]; then
        return 0
    fi

    lock_target="$(readlink "$lock_path" 2>/dev/null || true)"
    lock_pid="${lock_target##*-}"
    case "$lock_pid" in
        ''|*[!0-9]*)
            return 0
            ;;
    esac

    if kill -0 "$lock_pid" 2>/dev/null; then
        process_args="$(ps -p "$lock_pid" -o args= 2>/dev/null || true)"
        if printf '%s' "$process_args" | grep -Fq -- "$INGESTION_BROWSER_PROFILE_DIR"; then
            if printf '%s' "$process_args" | grep -Fq -- "--remote-debugging-port=$INGESTION_BROWSER_PORT"; then
                return 0
            fi

            log "--- Chrome automation profile without CDP 종료: pid=$lock_pid / profile=$INGESTION_BROWSER_PROFILE_DIR ---"
            kill "$lock_pid" 2>/dev/null || true
            sleep 3
            if kill -0 "$lock_pid" 2>/dev/null; then
                kill -9 "$lock_pid" 2>/dev/null || true
            fi
        elif [ -n "$process_args" ]; then
            log "--- stale Chrome automation singleton PID 재사용 감지: pid=$lock_pid / profile=$INGESTION_BROWSER_PROFILE_DIR ---"
        else
            return 0
        fi
    fi

    rm -f \
        "$INGESTION_BROWSER_PROFILE_DIR/SingletonLock" \
        "$INGESTION_BROWSER_PROFILE_DIR/SingletonCookie" \
        "$INGESTION_BROWSER_PROFILE_DIR/SingletonSocket"
    log "--- stale Chrome automation singleton 정리: pid=$lock_pid / profile=$INGESTION_BROWSER_PROFILE_DIR ---"
}

. "$PROJECT_ROOT/scripts/ingestion/run-lock.sh"

find_codex() {
    if [ -n "${CODEX_BIN:-}" ] && [ -x "$CODEX_BIN" ]; then
        echo "$CODEX_BIN"
        return 0
    fi

    command -v codex 2>/dev/null && return 0
    [ -x "/Applications/Codex.app/Contents/Resources/codex" ] && echo "/Applications/Codex.app/Contents/Resources/codex" && return 0
    return 1
}

extract_result_field() {
    local field="$1"
    python3 - "$RUN_OUTPUT" "$field" <<'PY' 2>/dev/null || true
import json
import re
import sys

path, field = sys.argv[1], sys.argv[2]
try:
    text = open(path, encoding="utf-8", errors="ignore").read()
except OSError:
    sys.exit(0)
blocks = re.findall(r"INGESTION_RESULT_JSON_START\s*(\{.*?\})\s*INGESTION_RESULT_JSON_END", text, flags=re.S)
if not blocks:
    sys.exit(0)
try:
    data = json.loads(blocks[-1])
except Exception:
    sys.exit(0)
value = data.get(field)
if isinstance(value, list):
    print(", ".join(str(item) for item in value[:8]) or "-")
elif isinstance(value, dict) and field == "instagramCircuitSkips":
    count = value.get("count") or 0
    sources = value.get("sources") or []
    if count:
        suffix = ", ..." if count > len(sources) else ""
        print(f"{count}건 ({', '.join(str(item) for item in sources[:8])}{suffix})")
    else:
        print("none")
elif value is not None:
    print(value)
PY
}

run_ingestion_preflight() {
    if [ ! -f "$PROJECT_ROOT/scripts/test-ingestion-standards.mjs" ]; then
        log "--- 수집 기준 테스트 파일 없음: scripts/test-ingestion-standards.mjs ---"
        telegram_notify "댄스 이벤트 수집 실패
수집 기준 테스트 파일이 없습니다.
run: $RUN_ID" failure missing-preflight
        exit 78
    fi

    if ! node "$PROJECT_ROOT/scripts/test-ingestion-standards.mjs" >> "$LOG_FILE" 2>&1; then
        log "--- 수집 기준 테스트 실패 ---"
        telegram_notify "댄스 이벤트 수집 실패
수집 기준 사전검사 실패
run: $RUN_ID" failure preflight
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
    || (!source.discoveryOnly && source.saveEnabled !== true)
    || /batswing\.co\.kr|instagram\.com\/batswing2003\b|instagram\.com\/243_swingbar\b|meroniswing\.com/i.test(url);
});
const runnable = sources.filter((source) => !source.discoveryOnly && source.saveEnabled === true);

if (!sources.length) {
  console.error('swing-daily source list is empty');
  process.exit(1);
}

if (!runnable.length) {
  console.error('swing-daily runnable source list is empty');
  process.exit(1);
}

if (invalid.length) {
  console.error('swing-daily contains invalid sources:', JSON.stringify(invalid, null, 2));
  process.exit(1);
}

console.log(`swing-daily source guard passed: ${runnable.length} runnable / ${sources.length} total sources`);
NODE
        then
            log "--- swing-daily 소스 가드 실패 ---"
            telegram_notify "댄스 이벤트 수집 실패
swing-daily 소스 가드 실패
run: $RUN_ID" failure source-guard
            exit 78
        fi

        log "--- swing-daily 소스 가드 통과 ---"
    fi
}

run_past_cleanup() {
    local cleanup_log
    cleanup_log="$RUN_DIR/${RUN_ID}.cleanup.json"
    export INGESTION_PRE_CLEANUP_COUNT=0
    export INGESTION_PRE_CLEANUP_CANDIDATES=0
    export INGESTION_PRE_CLEANUP_LOG="$cleanup_log"
    echo "cleanup_skipped=true" >> "$RUN_META"
    echo "cleanup_reason=legacy_cleanup_retired" >> "$RUN_META"
    echo "cleanup_log=$cleanup_log" >> "$RUN_META"
    echo "cleanup_candidates=0" >> "$RUN_META"
    echo "cleanup_deleted=0" >> "$RUN_META"
    printf '{"ok":true,"applied":false,"skipped":true,"reason":"legacy cleanup retired","count":0,"deleted":0,"targets":[]}\n' > "$cleanup_log"
    log "--- 과거 완료 데이터 정리 스킵: legacy cleanup retired / log=$cleanup_log ---"
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
    local new_line skip_line cleanup_line block_line circuit_line no_content_line result_skip result_block result_circuit result_no_content result_issues

    result_skip="$(extract_result_field skipCount)"
    result_block="$(extract_result_field accessFailures)"
    result_circuit="$(extract_result_field instagramCircuitSkips)"
    result_no_content="$(extract_result_field noContentSources)"
    result_issues="$(extract_result_field issues)"

    new_line="신규: -"
    if [ -n "$result_skip" ]; then
        skip_line="스킵: ${result_skip}건"
    else
        skip_line="스킵: -"
    fi
    cleanup_line="과거데이터삭제: ${INGESTION_PRE_CLEANUP_COUNT:--}"
    block_line="접근불가: ${result_block:--}"
    circuit_line="인스타회로차단: ${result_circuit:--}"
    no_content_line="수집대상없음: ${result_no_content:--}"

    cat <<EOF
${new_line}
${skip_line}
${cleanup_line}
${block_line}
${circuit_line}
${no_content_line}
이슈: ${issue_line}${result_issues:+ / ${result_issues}}
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
인스타회로차단: none
이슈: smoke test ok
==TELEGRAM_SUMMARY_END==
EOF
}

run_codex_startup_check() {
    if [ "$CODEX_STARTUP_CHECK" != "1" ] || [ "${INGESTION_SMOKE_TEST:-0}" = "1" ]; then
        return 0
    fi

    local check_prompt check_output check_last check_pid check_deadline check_exit
    check_prompt="$RUN_DIR/${RUN_ID}.startup.prompt.md"
    check_output="$RUN_DIR/${RUN_ID}.startup.jsonl"
    check_last="$RUN_DIR/${RUN_ID}.startup.last.txt"

    cat > "$check_prompt" <<'EOF'
Do not edit files. Do not use browser tools. Reply exactly:
INGESTION_STARTUP_OK
EOF

    "$CODEX" exec \
        --cd "$PROJECT_ROOT" \
        --sandbox read-only \
        --json \
        --output-last-message "$check_last" \
        - < "$check_prompt" \
        > "$check_output" 2>&1 &

    check_pid=$!
    check_deadline=$(( $(date +%s) + CODEX_STARTUP_TIMEOUT ))
    check_exit=0

    while kill -0 "$check_pid" 2>/dev/null; do
        if [ "$(date +%s)" -ge "$check_deadline" ]; then
            log "--- Codex startup check timeout: pid=$check_pid / ${CODEX_STARTUP_TIMEOUT}s ---"
            kill_tree "$check_pid" TERM
            sleep 3
            if kill -0 "$check_pid" 2>/dev/null; then
                kill_tree "$check_pid" KILL
            fi
            check_exit=124
            break
        fi
        sleep 2
    done

    if [ "$check_exit" -eq 0 ]; then
        wait "$check_pid" || check_exit=$?
    else
        wait "$check_pid" 2>/dev/null || true
    fi

    if [ "$check_exit" -ne 0 ] || ! grep -q "INGESTION_STARTUP_OK" "$check_last" "$check_output" 2>/dev/null; then
        echo "startup_check_exit=$check_exit" >> "$RUN_META" 2>/dev/null || true
        log "--- Codex startup check 실패: exit=$check_exit / run=$RUN_ID ---"
        perl -pe 's/(SUPABASE_(?:SERVICE_)?KEY[=:]\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(TELEGRAM_BOT_TOKEN[=:]\s*)[A-Za-z0-9:_-]+/${1}[REDACTED]/g; s/(Bearer\s+)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(apikey:\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/gi' "$check_output" >> "$LOG_FILE" 2>/dev/null || true
        telegram_notify "댄스 이벤트 수집 실패
$(date '+%Y-%m-%d %H:%M')
Codex 시작 검증 실패

cleanup은 실행하지 않았습니다.
run: $RUN_ID
log: $check_output" failure startup || true
        exit 78
    fi

    echo "startup_check=ok" >> "$RUN_META" 2>/dev/null || true
    log "--- Codex startup check 통과 ---"
}

log "--- 이벤트 수집 시작: engine=$INGESTION_ENGINE / $(date '+%Y-%m-%d %H:%M:%S') / run=$RUN_ID ---"

acquire_lock || exit $?
cleanup_playwright_mcp TERM

telegram_notify "댄스 이벤트 수집 시작
$(date '+%Y-%m-%d %H:%M')
run: $RUN_ID" start

cleanup_stale_chrome_singleton

# The native worker already opens its persistent browser after selecting work.
# Let it own that lifecycle so an empty retry never opens a blank Chrome window.
if [ "$INGESTION_ENGINE" != "native" ] && ! curl -sS --connect-timeout 2 --max-time 3 "$INGESTION_BROWSER_CDP_URL/json/version" > /dev/null 2>&1; then
    CHROME_BIN="${INGESTION_CHROME_BIN:-}"
    if [ -z "$CHROME_BIN" ]; then
        if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
            CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        else
            CHROME_BIN="$(command -v google-chrome-stable || command -v google-chrome || true)"
        fi
    fi
    if [ ! -x "$CHROME_BIN" ]; then
        log "--- Chrome 실행 파일 없음 ---"
        exit 78
    fi
    log "Chrome CDP 시작 중: port=$INGESTION_BROWSER_PORT"
    chrome_args=("--remote-debugging-address=127.0.0.1" "--remote-debugging-port=$INGESTION_BROWSER_PORT"
        "--user-data-dir=$INGESTION_BROWSER_PROFILE_DIR" --no-first-run --no-default-browser-check)
    [ "$INGESTION_CHROME_HEADLESS" = "1" ] && chrome_args+=(--headless=new)
    "$CHROME_BIN" "${chrome_args[@]}" >> "$RUN_DIR/browser.log" 2>&1 &
    sleep 6
fi

cd "$PROJECT_ROOT" || exit 1
run_ingestion_preflight

CODEX=""
if [ "$INGESTION_ENGINE" != "native" ]; then
    CODEX="$(find_codex || true)"
fi
if [ "$INGESTION_ENGINE" != "native" ] && [ -z "$CODEX" ]; then
    log "--- Codex 실행 파일 없음 ---"
    telegram_notify "댄스 이벤트 수집 실패
Codex CLI를 찾을 수 없습니다." failure missing-cli
    exit 127
fi

echo "run_id=$RUN_ID" > "$RUN_META"
echo "started_at=$(date '+%Y-%m-%d %H:%M:%S')" >> "$RUN_META"
echo "started_at_utc=$RUN_STARTED_AT_UTC" >> "$RUN_META"
echo "engine=$INGESTION_ENGINE" >> "$RUN_META"
echo "codex=${CODEX:-}" >> "$RUN_META"
echo "profile=$INGESTION_PROFILE" >> "$RUN_META"
echo "chrome_headless=$INGESTION_CHROME_HEADLESS" >> "$RUN_META"
echo "browser_profile=$INGESTION_BROWSER_PROFILE_DIR" >> "$RUN_META"
echo "instagram_safe_mode=$INGESTION_INSTAGRAM_SAFE_MODE" >> "$RUN_META"
echo "instagram_source_delay_ms=$INGESTION_INSTAGRAM_SOURCE_DELAY_MS" >> "$RUN_META"
echo "instagram_post_delay_ms=$INGESTION_INSTAGRAM_POST_DELAY_MS" >> "$RUN_META"
echo "native_run_budget_ms=$INGESTION_NATIVE_RUN_BUDGET_MS" >> "$RUN_META"
echo "native_post_request_timeout_ms=$INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS" >> "$RUN_META"
echo "native_image_fetch_timeout_ms=$INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS" >> "$RUN_META"
echo "native_instagram_post_limit=$INGESTION_NATIVE_INSTAGRAM_POST_LIMIT" >> "$RUN_META"
echo "native_source_priority=$INGESTION_NATIVE_SOURCE_PRIORITY" >> "$RUN_META"
echo "prompt=$RUN_DIR/${RUN_ID}.prompt.md" >> "$RUN_META"
echo "output=$RUN_OUTPUT" >> "$RUN_META"
echo "last=$RUN_LAST" >> "$RUN_META"

if [ "$INGESTION_ENGINE" != "native" ]; then
    run_codex_startup_check

    if [ "${INGESTION_SMOKE_TEST:-0}" = "1" ]; then
        build_smoke_prompt > "$RUN_DIR/${RUN_ID}.prompt.md"
    else
        cp "$PROMPT_FILE" "$RUN_DIR/${RUN_ID}.prompt.md"
    fi
else
    echo "Native swing-daily ingestion" > "$RUN_DIR/${RUN_ID}.prompt.md"
fi

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

if [ "$INGESTION_ENGINE" = "native" ]; then
    node "$PROJECT_ROOT/scripts/ingestion/swing-daily-native.mjs" \
        > "$RUN_OUTPUT" 2>&1 &
else
    "$CODEX" --search exec \
        --cd "$PROJECT_ROOT" \
        --sandbox danger-full-access \
        --dangerously-bypass-approvals-and-sandbox \
        -c shell_environment_policy.inherit=all \
        --json \
        --output-last-message "$RUN_LAST" \
        - < "$RUN_DIR/${RUN_ID}.prompt.md" \
        > "$RUN_OUTPUT" 2>&1 &
fi

CODEX_PID=$!
echo "worker_pid=$CODEX_PID" >> "$RUN_META"
if [ "$INGESTION_ENGINE" != "native" ]; then
    echo "codex_pid=$CODEX_PID" >> "$RUN_META"
fi

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

        log "--- 이벤트 수집 타임아웃: pid=$CODEX_PID / ${TIMEOUT_SECONDS}s ---"
        kill_tree "$CODEX_PID" TERM
        cleanup_playwright_mcp TERM
        sleep 10

        if kill -0 "$CODEX_PID" 2>/dev/null; then
            log "--- 이벤트 수집 강제 종료: pid=$CODEX_PID ---"
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

if [ "$INGESTION_ENGINE" = "native" ] && [ ! -f "$RUN_LAST" ]; then
    cp "$RUN_OUTPUT" "$RUN_LAST" 2>/dev/null || true
fi

perl -pe 's/(SUPABASE_(?:SERVICE_)?KEY[=:]\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(TELEGRAM_BOT_TOKEN[=:]\s*)[A-Za-z0-9:_-]+/${1}[REDACTED]/g; s/(Bearer\s+)[A-Za-z0-9._-]+/${1}[REDACTED]/g; s/(apikey:\s*)[A-Za-z0-9._-]+/${1}[REDACTED]/gi' "$RUN_OUTPUT" >> "$LOG_FILE"
log "--- 이벤트 수집 종료: engine=$INGESTION_ENGINE / $(date '+%Y-%m-%d %H:%M:%S') / exit=$EXIT_CODE / run=$RUN_ID ---"

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

MAP_AUDIT_BLOCK=""
if [ "$INGESTION_PROFILE" = "swing-daily" ] && [ -f "$PROJECT_ROOT/scripts/ingestion/audit-swing-social-map.mjs" ]; then
    MAP_AUDIT_LOG="$RUN_DIR/${RUN_ID}.social-map-audit.txt"
    if node "$PROJECT_ROOT/scripts/ingestion/audit-swing-social-map.mjs" --run "$RUN_LAST" > "$MAP_AUDIT_LOG" 2>> "$LOG_FILE"; then
        echo "social_map_audit=$MAP_AUDIT_LOG" >> "$RUN_META"
        MAP_AUDIT_BLOCK="$(awk '
            /==SWING_SOCIAL_MAP_SUMMARY_START==/ { found=1; block=""; next }
            /==SWING_SOCIAL_MAP_SUMMARY_END==/ { if(found) last=block; found=0; next }
            found { block = block "\n" $0 }
            END { print last }
        ' "$MAP_AUDIT_LOG" 2>/dev/null)"
        log "--- 스윙 소셜 지도 감사 완료: $MAP_AUDIT_LOG ---"
    else
        log "--- 스윙 소셜 지도 감사 실패: $MAP_AUDIT_LOG ---"
    fi
fi

PARSED_NEW=$(echo "$SUMMARY_BLOCK" | grep "^신규:" | tail -1)
PARSED_SKIP=$(echo "$SUMMARY_BLOCK" | grep "^스킵:" | tail -1)
PARSED_CLEANUP=$(echo "$SUMMARY_BLOCK" | grep "^과거데이터삭제:" | tail -1)
PARSED_BLOCK=$(echo "$SUMMARY_BLOCK" | grep "^접근불가:" | tail -1)
PARSED_CIRCUIT=$(echo "$SUMMARY_BLOCK" | grep "^인스타회로차단:" | tail -1)
PARSED_NO_CONTENT=$(echo "$SUMMARY_BLOCK" | grep "^수집대상없음:" | tail -1)
PARSED_ISSUE=$(echo "$SUMMARY_BLOCK" | grep "^이슈:" | tail -1)
PARSED_REMAINING_COUNT="$(extract_result_field remainingSourceCount)"

PARTIAL_RUN=0
case "$PARSED_REMAINING_COUNT" in
    ''|*[!0-9]*)
        ;;
    *)
        if [ "$PARSED_REMAINING_COUNT" -gt 0 ]; then
            PARTIAL_RUN=1
        fi
        ;;
esac
if echo "$PARSED_ISSUE" | grep -q "run budget reached; remaining sources"; then
    PARTIAL_RUN=1
fi

SUCCESS_LINES=""
append_success_line() {
    local line="$1"
    if [ -n "$line" ]; then
        SUCCESS_LINES="${SUCCESS_LINES}${line}
"
    fi
}

SUCCESS_NEW_LINE=""
if [ -n "$PARSED_NEW" ] && ! echo "$PARSED_NEW" | grep -Eq '^신규:[[:space:]]*0건'; then
    SUCCESS_NEW_LINE="$PARSED_NEW"
fi

SUCCESS_BLOCK_LINE=""
if [ -n "$PARSED_BLOCK" ]; then
    BLOCK_VALUE="${PARSED_BLOCK#접근불가:}"
    if ! echo "$BLOCK_VALUE" | grep -Eiq '^[[:space:]]*(none|없음|-)?[[:space:]]*$'; then
        SUCCESS_BLOCK_LINE="접근불가(개별 소스): $(echo "$BLOCK_VALUE" | sed 's/^[[:space:]]*//')"
    fi
fi

SUCCESS_NO_CONTENT_LINE=""
if [ -n "$PARSED_NO_CONTENT" ]; then
    NO_CONTENT_VALUE="${PARSED_NO_CONTENT#수집대상없음:}"
    if ! echo "$NO_CONTENT_VALUE" | grep -Eiq '^[[:space:]]*(none|없음|-)?[[:space:]]*$'; then
        SUCCESS_NO_CONTENT_LINE="수집대상없음(포스트/글 없음): $(echo "$NO_CONTENT_VALUE" | sed 's/^[[:space:]]*//')"
    fi
fi

SUCCESS_CIRCUIT_LINE=""
if [ -n "$PARSED_CIRCUIT" ]; then
    CIRCUIT_VALUE="${PARSED_CIRCUIT#인스타회로차단:}"
    if ! echo "$CIRCUIT_VALUE" | grep -Eiq '^[[:space:]]*(none|없음|-)?[[:space:]]*$'; then
        SUCCESS_CIRCUIT_LINE="인스타 전역차단(후속 접근 중단): $(echo "$CIRCUIT_VALUE" | sed 's/^[[:space:]]*//')"
    fi
fi

append_success_line "$SUCCESS_NEW_LINE"
append_success_line "${PARSED_SKIP:-스킵: -}"
append_success_line "${PARSED_CLEANUP:-과거데이터삭제: -}"
append_success_line "$SUCCESS_BLOCK_LINE"
append_success_line "$SUCCESS_CIRCUIT_LINE"
append_success_line "$SUCCESS_NO_CONTENT_LINE"
append_success_line "${PARSED_ISSUE:-이슈: 없음}"
if [ -n "$MAP_AUDIT_BLOCK" ]; then
    append_success_line ""
    append_success_line "씬지도 감사:"
    append_success_line "$(echo "$MAP_AUDIT_BLOCK" | grep -v '^run:' | sed '/^[[:space:]]*$/d')"
fi

if [ $EXIT_CODE -eq 0 ]; then
    telegram_notify "댄스 이벤트 수집 완료
$(date '+%Y-%m-%d %H:%M')

${SUCCESS_LINES%$'\n'}

run: $RUN_ID
https://swingenjoy.com/admin/v2/ingestor" result
elif [ $EXIT_CODE -eq 75 ] && [ "$PARTIAL_RUN" -eq 1 ]; then
    telegram_notify "댄스 이벤트 수집 부분 완료
$(date '+%Y-%m-%d %H:%M')
완료하지 못한 ${PARSED_REMAINING_COUNT:-일부}개 소스는 다음 회차에서 우선 재개합니다.

${PARSED_NEW:-}
${PARSED_BLOCK:-}
${PARSED_CIRCUIT:-}
${PARSED_ISSUE:-}

run: $RUN_ID
log: $RUN_OUTPUT" result
else
    if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ]; then
        FAIL_REASON="타임아웃/강제종료"
    elif [ $EXIT_CODE -eq 75 ]; then
        FAIL_REASON="중복 실행 차단"
    else
        FAIL_REASON="Exit: $EXIT_CODE"
    fi

    telegram_notify "댄스 이벤트 수집 실패
$(date '+%Y-%m-%d %H:%M')
${FAIL_REASON}

${PARSED_NEW:-}
${PARSED_BLOCK:-}
${PARSED_CIRCUIT:-}
${PARSED_ISSUE:-}

run: $RUN_ID
log: $RUN_OUTPUT" result
fi

exit $EXIT_CODE
