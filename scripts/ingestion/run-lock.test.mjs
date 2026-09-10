import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(setup, attempts = 20) {
  const directory = mkdtempSync(path.join(tmpdir(), 'ingestion-lock-test-'));
  try {
    return spawnSync('/bin/bash', ['-c', `
      source scripts/ingestion/run-lock.sh
      log() { :; }
      write_duplicate_run_artifacts() { :; }
      cleanup_lock() { rm -rf "$LOCK_DIR"; }
      handle_termination() { exit 130; }
      ${setup}
      acquire_lock
      status=$?
      if [ "$status" -eq 0 ]; then
        [ "$(cat "$LOCK_DIR/pid")" = "$$" ] || exit 99
      fi
      exit "$status"
    `], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, LOCK_DIR: path.join(directory, 'lock'), INGESTION_LOCK_WAIT_ATTEMPTS: String(attempts), INGESTION_LOCK_WAIT_SECONDS: '0.02' },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('acquires a free lock and recovers a dead owner', () => {
  assert.equal(run('').status, 0);
  assert.equal(run('mkdir "$LOCK_DIR"; echo 99999999 > "$LOCK_DIR/pid"; echo 0 > "$LOCK_DIR/started_at"').status, 0);
});
test('waits for a live owner then acquires the same lock', () => {
  assert.equal(run('mkdir "$LOCK_DIR"; echo $$ > "$LOCK_DIR/pid"; echo 0 > "$LOCK_DIR/started_at"; (sleep 0.08; rm -rf "$LOCK_DIR") &').status, 0);
});
test('expires without stealing a live or not-yet-published lock', () => {
  assert.equal(run('mkdir "$LOCK_DIR"; echo $$ > "$LOCK_DIR/pid"; echo 0 > "$LOCK_DIR/started_at"', 1).status, 75);
  assert.equal(run('mkdir "$LOCK_DIR"', 1).status, 75);
});
