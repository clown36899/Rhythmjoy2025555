#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_TARGET_FILE="${CAFE24_DEPLOY_TARGET_FILE:-${ROOT_DIR}/deploy/cafe24/production-target.env}"

if [[ -f "${DEPLOY_TARGET_FILE}" ]]; then
  set -a
  # shellcheck source=../deploy/cafe24/production-target.env
  . "${DEPLOY_TARGET_FILE}"
  set +a
fi

TARGET="${CAFE24_SSH_TARGET:-root@1.234.23.64}"
APP_DIR="${CAFE24_APP_DIR:-${CAFE24_SWINGENJOY_APP_DIR:-/opt/swingenjoy}}"
SSH_KEY="${CAFE24_SSH_KEY:-$HOME/.ssh/swingenjoy_cafe24_ed25519}"
LOCAL_MYSQL_PORT="${LOCAL_MYSQL_PORT:-33306}"
LOCAL_APP_PORT="${PORT:-8888}"
EXPECTED_HOSTNAME="${CAFE24_SERVER_HOSTNAME:-clown313python.cafe24.com}"

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=no)
if [[ -n "${SSH_KEY}" && -f "${SSH_KEY}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
fi

REMOTE_HOSTNAME="$(ssh "${SSH_ARGS[@]}" "${TARGET}" "hostname")"
if [[ "${REMOTE_HOSTNAME}" != "${EXPECTED_HOSTNAME}" ]]; then
  echo "Refusing to connect to unexpected Cafe24 host '${REMOTE_HOSTNAME}'." >&2
  echo "Expected host: '${EXPECTED_HOSTNAME}'." >&2
  exit 2
fi

if (echo >"/dev/tcp/127.0.0.1/${LOCAL_MYSQL_PORT}") >/dev/null 2>&1; then
  echo "Local MySQL tunnel port ${LOCAL_MYSQL_PORT} is already in use." >&2
  echo "Set LOCAL_MYSQL_PORT to another value and retry." >&2
  exit 2
fi

remote_env="$(
  ssh "${SSH_ARGS[@]}" "${TARGET}" "set -e
    set -a
    [ -f '${APP_DIR}/.env' ] && . '${APP_DIR}/.env'
    [ -f '${APP_DIR}/.env.local' ] && . '${APP_DIR}/.env.local'
    set +a
    for key in MYSQL_HOST MYSQL_PORT MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD MYSQL_EVENTS_TABLE; do
      if [ \"\${!key+x}\" = x ]; then
        printf '%s=%q\n' \"\$key\" \"\${!key}\"
      fi
    done"
)"

if [[ -z "${remote_env}" ]]; then
  echo "Failed to read remote MySQL environment from ${APP_DIR}/.env." >&2
  exit 2
fi

set -a
eval "${remote_env}"
set +a

: "${MYSQL_USER:?Missing MYSQL_USER from remote env}"
: "${MYSQL_PASSWORD:?Missing MYSQL_PASSWORD from remote env}"

REMOTE_MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
REMOTE_MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-swingenjoy_app}"

ssh "${SSH_ARGS[@]}" \
  -N \
  -L "127.0.0.1:${LOCAL_MYSQL_PORT}:${REMOTE_MYSQL_HOST}:${REMOTE_MYSQL_PORT}" \
  "${TARGET}" &
tunnel_pid=$!

cleanup() {
  kill "${tunnel_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in {1..30}; do
  if (echo >"/dev/tcp/127.0.0.1/${LOCAL_MYSQL_PORT}") >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if ! (echo >"/dev/tcp/127.0.0.1/${LOCAL_MYSQL_PORT}") >/dev/null 2>&1; then
  echo "MySQL SSH tunnel did not become ready on 127.0.0.1:${LOCAL_MYSQL_PORT}." >&2
  exit 1
fi

cd "${ROOT_DIR}"
export MYSQL_HOST="127.0.0.1"
export MYSQL_PORT="${LOCAL_MYSQL_PORT}"
export MYSQL_DATABASE
export MYSQL_USER
export MYSQL_PASSWORD
export MYSQL_EVENTS_TABLE="${MYSQL_EVENTS_TABLE:-events}"
export CAFE24_HOST="${CAFE24_HOST:-127.0.0.1}"
export PORT="${LOCAL_APP_PORT}"
export CAFE24_PORT="${LOCAL_APP_PORT}"
export CAFE24_UPLOADS_FALLBACK_ORIGIN="${CAFE24_UPLOADS_FALLBACK_ORIGIN:-https://swingenjoy.com}"

echo "Serving local Swing Enjoy on http://${CAFE24_HOST}:${LOCAL_APP_PORT}"
echo "Using Cafe24 production DB through SSH tunnel 127.0.0.1:${LOCAL_MYSQL_PORT}"
echo "Using production uploads fallback ${CAFE24_UPLOADS_FALLBACK_ORIGIN}/uploads"
node server/cafe24/start.js
