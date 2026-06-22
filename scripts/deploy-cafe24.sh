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
APACHE_CONF_DIR="${CAFE24_APACHE_CONF_DIR:-/etc/httpd/conf.d}"
SERVICE="${CAFE24_SWINGENJOY_SERVICE:-swingenjoy}"
HEALTH_URL="${CAFE24_SWINGENJOY_HEALTH_URL:-http://127.0.0.1:3001/__health}"
EXPECTED_HOSTNAME="${CAFE24_SERVER_HOSTNAME:-clown313python.cafe24.com}"
SWINGENJOY_APP_DIR="${CAFE24_SWINGENJOY_APP_DIR:-/opt/swingenjoy}"
RHYTHMJOY_APP_DIR="${CAFE24_RHYTHMJOY_APP_DIR:-/home/clown313python/myapp}"

if [[ "${APP_DIR}" != "${SWINGENJOY_APP_DIR}" ]]; then
  echo "Refusing to deploy Swing Enjoy to '${APP_DIR}'." >&2
  echo "Expected Swing Enjoy app dir: '${SWINGENJOY_APP_DIR}'." >&2
  echo "Rhythmjoy calendar app dir is '${RHYTHMJOY_APP_DIR}' and must not be used by this script." >&2
  exit 2
fi

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=no)
RSYNC_SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=no"
if [[ -n "${SSH_KEY}" && -f "${SSH_KEY}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
  RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=no"
fi

cd "${ROOT_DIR}"

REMOTE_HOSTNAME="$(ssh "${SSH_ARGS[@]}" "${TARGET}" "hostname")"
if [[ "${REMOTE_HOSTNAME}" != "${EXPECTED_HOSTNAME}" ]]; then
  echo "Refusing to deploy to unexpected Cafe24 host '${REMOTE_HOSTNAME}'." >&2
  echo "Expected host: '${EXPECTED_HOSTNAME}'." >&2
  exit 2
fi

npm run build:cafe24

ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${APP_DIR}/dist' '${APP_DIR}/dist-cafe24' '${APP_DIR}/server/cafe24' '${APP_DIR}/scripts'"

RSYNC_LOG_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${RSYNC_LOG_DIR}"
}
trap cleanup EXIT

dist_log="${RSYNC_LOG_DIR}/dist.log"
functions_log="${RSYNC_LOG_DIR}/dist-cafe24.log"
server_log="${RSYNC_LOG_DIR}/server.log"
scripts_log="${RSYNC_LOG_DIR}/scripts.log"
package_log="${RSYNC_LOG_DIR}/package.log"
apache_log="${RSYNC_LOG_DIR}/apache.log"

rsync -azi --delete --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist/ "${TARGET}:${APP_DIR}/dist/" | tee "${dist_log}"
rsync -azi --delete --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist-cafe24/ "${TARGET}:${APP_DIR}/dist-cafe24/" | tee "${functions_log}"
rsync -azi --delete --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" server/cafe24/ "${TARGET}:${APP_DIR}/server/cafe24/" | tee "${server_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/audit-analytics-admin-devices.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/backfill-analytics-identities.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/backfill-event-image-variants.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/exclude-analytics-kiosk-network.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/repair-session-log-duplicates.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" package.json package-lock.json "${TARGET}:${APP_DIR}/" | tee "${package_log}"
rsync -azi --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" deploy/cafe24/apache/ "${TARGET}:${APACHE_CONF_DIR}/" | tee "${apache_log}"

has_transfer_changes() {
  grep -Eq '^([<>ch]|\*deleting)' "$1"
}

restart_required=false
if has_transfer_changes "${functions_log}" || has_transfer_changes "${server_log}" || has_transfer_changes "${package_log}"; then
  restart_required=true
fi

ssh "${SSH_ARGS[@]}" "${TARGET}" "set -e
cd '${APP_DIR}'
httpd -t
if [ '${restart_required}' = 'true' ]; then
  echo 'Restarting ${SERVICE}: server-side files changed.'
  systemctl restart '${SERVICE}'
  i=0
  until curl -fsS '${HEALTH_URL}' >/dev/null; do
    i=\$((i + 1))
    if [ \"\$i\" -ge 30 ]; then
      echo 'Cafe24 app did not become healthy after restart' >&2
      systemctl status '${SERVICE}' --no-pager >&2 || true
      exit 1
    fi
    sleep 1
  done
else
  echo 'Skipping ${SERVICE} restart: only static/admin script files changed.'
  if ! curl -fsS '${HEALTH_URL}' >/dev/null; then
    echo '${SERVICE} is unhealthy even though restart was not required; restarting as recovery.' >&2
    systemctl restart '${SERVICE}'
    i=0
    until curl -fsS '${HEALTH_URL}' >/dev/null; do
      i=\$((i + 1))
      if [ \"\$i\" -ge 30 ]; then
        echo 'Cafe24 app did not become healthy after recovery restart' >&2
        systemctl status '${SERVICE}' --no-pager >&2 || true
        exit 1
      fi
      sleep 1
    done
  fi
fi
systemctl reload httpd || true
systemctl is-active '${SERVICE}'
cat dist/version.json"
