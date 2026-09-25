# Existing Telegram transport, now tracked beside its notification policy.
# The launcher holds the collection lock for this entire decision/send/receipt.
telegram_notify() {
    local original_text="$1" kind="${2:-failure}" error_key="${3:-runtime}"
    local policy="$PROJECT_ROOT/scripts/ingestion/telegram-notification-policy.mjs"
    local plan_file="$RUN_DIR/${RUN_ID}.notification-plan.json" message message_status
    if [ "$kind" = "start" ] && [ "${INGESTION_TELEGRAM_MODE:-problems}" != "all" ]; then
        log "--- Telegram 안내 생략: start / run=$RUN_ID ---"
        return 0
    fi
    if ! printf '%s' "$original_text" | node "$policy" plan "$kind" \
        "${INGESTION_PROFILE:-swing-daily}:${INGESTION_NATIVE_SOURCE_PRIORITY:-unknown}" \
        "${EXIT_CODE:-0}" "${INGESTION_ENGINE:-native}" "${RUN_OUTPUT:-}" "$RUN_DIR" "$error_key" \
        > "$plan_file" 2>> "$LOG_FILE"; then
        log "--- Telegram 알림 판정 실패: run=$RUN_ID ---"
        _telegram_deliver "댄스 이벤트 수집 알림 판정 오류. 실행 기록을 확인해주세요."
        return $?
    fi
    message=$(node "$policy" message "$plan_file" 2>> "$LOG_FILE")
    message_status=$?
    if [ "$message_status" -eq 10 ]; then
        log "--- Telegram 안내 생략: 정상 또는 24시간 내 동일 문제 / run=$RUN_ID ---"
        return 0
    elif [ "$message_status" -ne 0 ]; then
        log "--- Telegram 알림 계획 읽기 실패: run=$RUN_ID ---"
        return 1
    fi
    if [ "${TELEGRAM_DRY_RUN:-0}" = "1" ]; then
        log "--- Telegram dry-run: run=$RUN_ID ---"
        log "$message"
        return 0
    fi
    if _telegram_deliver "$message"; then
        node "$policy" record "$plan_file" "$RUN_META" 2>> "$LOG_FILE" || log "--- Telegram 전송 기록 저장 실패: run=$RUN_ID ---"
        return 0
    fi
    return 1
}

_telegram_deliver() {
    local text="$1"
    local http_code response_file

    if [ "${TELEGRAM_DRY_RUN:-0}" = "1" ]; then
        log "--- Telegram dry-run ---"
        log "$text"
        return 0
    fi

    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        log "--- Telegram 전송 스킵: TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 없음 ---"
        log "$text"
        return 2
    fi

    response_file="/tmp/rhythmjoy_telegram_${RUN_ID}.json"
    http_code=$(TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" TELEGRAM_SEND_TIMEOUT="$TELEGRAM_SEND_TIMEOUT" TELEGRAM_TEXT="$text" RESPONSE_FILE="$response_file" python3 <<'PY' 2>> "$LOG_FILE" || echo "000"
import json
import os
import signal
import sys
import urllib.error
import urllib.request

timeout = int(os.environ.get("TELEGRAM_SEND_TIMEOUT", "12"))
token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
text = os.environ.get("TELEGRAM_TEXT", "")
response_file = os.environ.get("RESPONSE_FILE", "")

def alarm_handler(signum, frame):
    raise TimeoutError(f"telegram send timed out after {timeout}s")

signal.signal(signal.SIGALRM, alarm_handler)
signal.alarm(timeout)

try:
    payload = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read()
        if response_file:
            open(response_file, "wb").write(body)
        print(res.status)
except urllib.error.HTTPError as exc:
    body = exc.read()
    if response_file:
        open(response_file, "wb").write(body)
    print(exc.code)
    sys.exit(1)
except Exception as exc:
    if response_file:
        open(response_file, "w", encoding="utf-8").write(str(exc))
    print("000")
    sys.exit(1)
finally:
    signal.alarm(0)
PY
)

    if [ "$http_code" = "200" ]; then
        log "--- Telegram 전송 성공: http=$http_code ---"
        rm -f "$response_file"
        return 0
    fi

    log "--- Telegram 전송 실패: http=$http_code / response=$(cat "$response_file" 2>/dev/null) ---"
    rm -f "$response_file"
    return 1
}
