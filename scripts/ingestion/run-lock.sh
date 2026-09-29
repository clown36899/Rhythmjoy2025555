# Shared by the installed launcher; the lock remains the only concurrency owner.
acquire_lock() {
    local attempt old_pid started_at now age
    local max_wait="${INGESTION_LOCK_WAIT_ATTEMPTS:-240}"
    local wait_seconds="${INGESTION_LOCK_WAIT_SECONDS:-30}"
    for ((attempt=0; attempt<=max_wait; attempt++)); do
        if mkdir "$LOCK_DIR" 2>/dev/null; then
            echo "$$" > "$LOCK_DIR/pid"
            date +%s > "$LOCK_DIR/started_at"
            trap cleanup_lock EXIT
            trap 'handle_termination INT' INT
            trap 'handle_termination TERM' TERM
            return 0
        fi
        old_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
        started_at=$(cat "$LOCK_DIR/started_at" 2>/dev/null || echo 0)
        now=$(date +%s)
        age=$((now - started_at))
        # Never steal a live owner's lock, even after a long system sleep.
        if [[ "$old_pid" =~ ^[0-9]+$ ]] && ! kill -0 "$old_pid" 2>/dev/null; then
            log "--- stale lock 정리: PID=$old_pid / age=${age}s ---"
            if mkdir "$LOCK_DIR.recovery" 2>/dev/null; then
                if [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$old_pid" ]; then
                    rm -rf "$LOCK_DIR"
                fi
                rmdir "$LOCK_DIR.recovery"
            fi
            continue
        fi
        # An empty PID can mean the winning process is still publishing metadata.
        if [ "$attempt" -eq "$max_wait" ]; then
            log "--- 수집 잠금 대기 만료: PID=${old_pid:-unknown} ---"
            write_duplicate_run_artifacts "${old_pid:-unknown}" "$age"
            return 75
        fi
        if [ "$attempt" -eq 0 ]; then
            log "--- 기존 수집 완료 대기: PID=${old_pid:-unknown} ---"
        fi
        sleep "$wait_seconds"
    done
    return 75
}
