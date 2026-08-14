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
NODE_BIN_DIR="${CAFE24_NODE_BIN_DIR:-/opt/node-v20.11.1-linux-x64-glibc-217/bin}"
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

# A production deploy must come from a clean, pushed branch that includes the
# latest main line. This prevents an older parallel branch from silently
# replacing fixes that were already deployed from main.
git fetch origin main --quiet
deploy_base_ref="${CAFE24_DEPLOY_BASE_REF:-origin/main}"
if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Refusing to deploy with uncommitted or untracked project changes." >&2
  exit 2
fi
if ! git merge-base --is-ancestor "${deploy_base_ref}" HEAD; then
  echo "Refusing to deploy a branch that does not include '${deploy_base_ref}'." >&2
  echo "Integrate the latest main branch before deploying." >&2
  exit 2
fi
deploy_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [[ -z "${deploy_upstream}" ]]; then
  echo "Refusing to deploy a branch without an upstream remote." >&2
  exit 2
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "${deploy_upstream}")" ]]; then
  echo "Refusing to deploy before HEAD is pushed to '${deploy_upstream}'." >&2
  exit 2
fi

REMOTE_HOSTNAME="$(ssh "${SSH_ARGS[@]}" "${TARGET}" "hostname")"
if [[ "${REMOTE_HOSTNAME}" != "${EXPECTED_HOSTNAME}" ]]; then
  echo "Refusing to deploy to unexpected Cafe24 host '${REMOTE_HOSTNAME}'." >&2
  echo "Expected host: '${EXPECTED_HOSTNAME}'." >&2
  exit 2
fi

npm run build:cafe24

ENTRY_STAGE_FILES=(dist/index.html dist/service-worker.js dist/version.json)
for entry_file in "${ENTRY_STAGE_FILES[@]}"; do
  if [[ ! -s "${entry_file}" ]]; then
    echo "Missing required frontend entry file: ${entry_file}" >&2
    exit 2
  fi
done

DEPLOY_BUILD_ID="$(node -e '
  const fs = require("node:fs");
  const version = JSON.parse(fs.readFileSync("dist/version.json", "utf8"));
  if (!version.buildTime) process.exit(1);
  process.stdout.write(String(version.buildTime));
')"
if [[ ! "${DEPLOY_BUILD_ID}" =~ ^[0-9A-Za-z._-]+$ ]]; then
  echo "Invalid deploy build ID: ${DEPLOY_BUILD_ID}" >&2
  exit 2
fi
REMOTE_ENTRY_DIR="${APP_DIR}/.deploy-entry-${DEPLOY_BUILD_ID}"

ssh "${SSH_ARGS[@]}" "${TARGET}" "set -e
mkdir -p '${APP_DIR}/dist/assets' '${APP_DIR}/dist-cafe24' '${APP_DIR}/server/cafe24' '${APP_DIR}/scripts' '${APP_DIR}/deploy/cafe24/cron' /etc/cron.d '${REMOTE_ENTRY_DIR}'
rm -f '${REMOTE_ENTRY_DIR}/index.html' '${REMOTE_ENTRY_DIR}/service-worker.js' '${REMOTE_ENTRY_DIR}/version.json'"

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
cron_log="${RSYNC_LOG_DIR}/cron.log"

# 새 해시 자산은 먼저 올리되, 자동 새로고침을 유발하는 진입 파일은 별도
# 디렉터리에 staging한다. 서버가 정상화되기 전에는 기존 index, service worker,
# version.json을 유지해 상시 실행 클라이언트가 재시작 공백을 밟지 않게 한다.
rsync -azi --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist/assets/ "${TARGET}:${APP_DIR}/dist/assets/" | tee "${dist_log}"
rsync -azi --delay-updates --exclude 'assets/' --exclude 'index.html' --exclude 'service-worker.js' --exclude 'version.json' --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist/ "${TARGET}:${APP_DIR}/dist/" | tee -a "${dist_log}"
rsync -azi --delay-updates -e "${RSYNC_SSH}" "${ENTRY_STAGE_FILES[@]}" "${TARGET}:${REMOTE_ENTRY_DIR}/" | tee -a "${dist_log}"
rsync -azi --delete --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist-cafe24/ "${TARGET}:${APP_DIR}/dist-cafe24/" | tee "${functions_log}"
rsync -azi --delete --delay-updates --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" server/cafe24/ "${TARGET}:${APP_DIR}/server/cafe24/" | tee "${server_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/audit-analytics-admin-devices.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/backfill-analytics-identities.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/backfill-event-image-variants.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/baseline-notification-queue.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/backfill-notification-preferences.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/exclude-analytics-kiosk-network.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/import-lindycollection-routines.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/migrate-push-subscription-record-keys.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/reconcile-daily-notification-occurrences.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/reconcile-notification-inbox-preferences.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/reconcile-2026-08-12-swingtime-duplicate.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/repair-2026-08-13-prefix-and-benefit.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/repair-session-log-duplicates.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/run-cafe24-cron-notifications.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" scripts/seed-notification-reset-notice.mjs "${TARGET}:${APP_DIR}/scripts/" | tee -a "${scripts_log}"
rsync -azi -e "${RSYNC_SSH}" package.json package-lock.json "${TARGET}:${APP_DIR}/" | tee "${package_log}"
rsync -azi --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" deploy/cafe24/apache/ "${TARGET}:${APACHE_CONF_DIR}/" | tee "${apache_log}"
rsync -azi -e "${RSYNC_SSH}" deploy/cafe24/cron/swingenjoy-notifications "${TARGET}:${APP_DIR}/deploy/cafe24/cron/" | tee "${cron_log}"

has_transfer_changes() {
  grep -Eq '^([<>ch]|\*deleting)' "$1"
}

restart_required=false
package_changed=false
if has_transfer_changes "${functions_log}" || has_transfer_changes "${server_log}" || has_transfer_changes "${package_log}"; then
  restart_required=true
fi
package_lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"

ssh "${SSH_ARGS[@]}" "${TARGET}" "set -e
rm -f /etc/cron.d/swingenjoy-notifications
systemctl reload crond || systemctl restart crond
/usr/bin/flock -w 65 /run/swingenjoy-notifications.lock /bin/true
cd '${APP_DIR}'
set -a
. '${APP_DIR}/.env'
set +a
: \"\${MYSQL_HOST:?Missing MYSQL_HOST}\"
: \"\${MYSQL_DATABASE:?Missing MYSQL_DATABASE}\"
: \"\${MYSQL_USER:?Missing MYSQL_USER}\"
: \"\${MYSQL_PASSWORD:?Missing MYSQL_PASSWORD}\"
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \
  -h \"\${MYSQL_HOST}\" \
  -P \"\${MYSQL_PORT:-3306}\" \
  -u \"\${MYSQL_USER}\" \
  \"\${MYSQL_DATABASE}\" \
  < '${APP_DIR}/server/cafe24/migrations/2026-07-26-external-api-admin-audit.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \
  -h \"\${MYSQL_HOST}\" \
  -P \"\${MYSQL_PORT:-3306}\" \
  -u \"\${MYSQL_USER}\" \
  \"\${MYSQL_DATABASE}\" \
  < '${APP_DIR}/server/cafe24/migrations/2026-07-26-external-api-permissions-and-environment.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \
  -h \"\${MYSQL_HOST}\" \
  -P \"\${MYSQL_PORT:-3306}\" \
  -u \"\${MYSQL_USER}\" \
  \"\${MYSQL_DATABASE}\" \
  < '${APP_DIR}/server/cafe24/migrations/2026-07-26-external-regular-socials-api.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \
  -h \"\${MYSQL_HOST}\" \
  -P \"\${MYSQL_PORT:-3306}\" \
  -u \"\${MYSQL_USER}\" \
  \"\${MYSQL_DATABASE}\" \
  < '${APP_DIR}/server/cafe24/migrations/2026-07-26-user-notifications.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \\
  -h \"\${MYSQL_HOST}\" \\
  -P \"\${MYSQL_PORT:-3306}\" \\
  -u \"\${MYSQL_USER}\" \\
  \"\${MYSQL_DATABASE}\" \\
  < '${APP_DIR}/server/cafe24/migrations/2026-08-03-notification-delivery-standard.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \\
  -h \"\${MYSQL_HOST}\" \\
  -P \"\${MYSQL_PORT:-3306}\" \\
  -u \"\${MYSQL_USER}\" \\
  \"\${MYSQL_DATABASE}\" \\
  < '${APP_DIR}/server/cafe24/migrations/2026-08-11-notification-route-boundaries.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \\
  -h \"\${MYSQL_HOST}\" \\
  -P \"\${MYSQL_PORT:-3306}\" \\
  -u \"\${MYSQL_USER}\" \\
  \"\${MYSQL_DATABASE}\" \\
  < '${APP_DIR}/server/cafe24/migrations/2026-08-03-user-board-post-reads.sql'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \\
  -h \"\${MYSQL_HOST}\" \\
  -P \"\${MYSQL_PORT:-3306}\" \\
  -u \"\${MYSQL_USER}\" \\
  \"\${MYSQL_DATABASE}\" \\
  < '${APP_DIR}/server/cafe24/migrations/2026-08-11-push-subscription-record-keys.sql'
'${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/migrate-push-subscription-record-keys.mjs'
MYSQL_PWD=\"\${MYSQL_PASSWORD}\" mysql \\
  -h \"\${MYSQL_HOST}\" \\
  -P \"\${MYSQL_PORT:-3306}\" \\
  -u \"\${MYSQL_USER}\" \\
  \"\${MYSQL_DATABASE}\" \\
  < '${APP_DIR}/server/cafe24/migrations/2026-08-11-notification-explicit-read-recovery.sql'
export PATH='${NODE_BIN_DIR}':\"\$PATH\"
if [ ! -f '${APP_DIR}/.notification-subscriptions-reset-20260803' ]; then
  RESET_EXISTING_NOTIFICATION_SUBSCRIPTIONS=1 \
    '${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/backfill-notification-preferences.mjs'
  '${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/seed-notification-reset-notice.mjs'
  touch '${APP_DIR}/.notification-subscriptions-reset-20260803'
else
  '${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/backfill-notification-preferences.mjs'
fi
'${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/reconcile-notification-inbox-preferences.mjs'
'${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/reconcile-daily-notification-occurrences.mjs'
if [ ! -f '${APP_DIR}/.notification-delivery-baselined' ]; then
  '${NODE_BIN_DIR}/node' '${APP_DIR}/scripts/baseline-notification-queue.mjs'
  touch '${APP_DIR}/.notification-delivery-baselined'
fi
if [ -f '${APACHE_CONF_DIR}/swingenjoy-modsecurity-exceptions.conf' ] && [ -f '${APACHE_CONF_DIR}/00-swingenjoy-modsecurity-exceptions.conf' ]; then
  mv '${APACHE_CONF_DIR}/swingenjoy-modsecurity-exceptions.conf' '${APACHE_CONF_DIR}/swingenjoy-modsecurity-exceptions.conf.disabled'
fi
httpd -t
installed_package_lock_hash=\$(cat .installed-package-lock.sha256 2>/dev/null || true)
if [ \"\$installed_package_lock_hash\" != '${package_lock_hash}' ]; then
  echo 'Installing production dependencies: package files changed.'
  export PATH='${NODE_BIN_DIR}':\"\$PATH\"
  npm install --omit=dev --no-audit --no-fund
  printf '%s\n' '${package_lock_hash}' > .installed-package-lock.sha256
  package_changed=true
fi
if [ '${restart_required}' = 'true' ] || [ \"\${package_changed:-false}\" = 'true' ]; then
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
install -m 0644 '${APP_DIR}/deploy/cafe24/cron/swingenjoy-notifications' /etc/cron.d/swingenjoy-notifications
chown root:root /etc/cron.d/swingenjoy-notifications
systemctl reload crond || systemctl restart crond
systemctl reload httpd || true
systemctl is-active '${SERVICE}'"

# 서버 헬스 확인이 끝난 뒤에만 새 frontend entry를 공개한다. index와 service
# worker를 먼저 준비하고 version.json을 마지막 atomic rename으로 전환해야
# 기존 클라이언트의 버전 감지 새로고침이 서버 재시작 구간과 겹치지 않는다.
ssh "${SSH_ARGS[@]}" "${TARGET}" "set -e
ENTRY_DIR='${REMOTE_ENTRY_DIR}'
DIST_DIR='${APP_DIR}/dist'

prepare_entry() {
  entry_name=\"\$1\"
  entry_source=\"\$ENTRY_DIR/\$entry_name\"
  entry_temp=\"\$DIST_DIR/.\$entry_name.deploy-${DEPLOY_BUILD_ID}\"
  test -s \"\$entry_source\"
  install -m 0644 \"\$entry_source\" \"\$entry_temp\"
}

publish_entry() {
  entry_name=\"\$1\"
  entry_temp=\"\$DIST_DIR/.\$entry_name.deploy-${DEPLOY_BUILD_ID}\"
  mv -f \"\$entry_temp\" \"\$DIST_DIR/\$entry_name\"
}

prepare_entry index.html
prepare_entry service-worker.js
prepare_entry version.json
publish_entry index.html
publish_entry service-worker.js
publish_entry version.json

rm -f \"\$ENTRY_DIR/index.html\" \"\$ENTRY_DIR/service-worker.js\" \"\$ENTRY_DIR/version.json\"
rmdir \"\$ENTRY_DIR\" || true
curl -fsS '${HEALTH_URL}' >/dev/null
systemctl is-active '${SERVICE}'
cat \"\$DIST_DIR/version.json\""
