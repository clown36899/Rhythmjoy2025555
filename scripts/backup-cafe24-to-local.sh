#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_FILE="${CAFE24_DEPLOY_TARGET_FILE:-${ROOT_DIR}/deploy/cafe24/production-target.env}"

if [[ -f "${TARGET_FILE}" ]]; then
  set -a
  # shellcheck source=../deploy/cafe24/production-target.env
  . "${TARGET_FILE}"
  set +a
fi

TARGET="${CAFE24_SSH_TARGET:-root@1.234.23.64}"
SSH_KEY="${CAFE24_SSH_KEY:-$HOME/.ssh/swingenjoy_cafe24_ed25519}"
APP_DIR="${CAFE24_SWINGENJOY_APP_DIR:-/opt/swingenjoy}"
RHYTHMJOY_APP_DIR="${CAFE24_RHYTHMJOY_APP_DIR:-/home/clown313python/myapp}"
RHYTHMJOY_OPS_DIR="${CAFE24_RHYTHMJOY_OPS_DIR:-/home/clown313python/rhythmjoy_ops}"
EXPECTED_HOSTNAME="${CAFE24_SERVER_HOSTNAME:-clown313python.cafe24.com}"
BACKUP_ROOT="${CAFE24_LOCAL_BACKUP_ROOT:-$HOME/RhythmjoyBackups/swingenjoy-cafe24}"
KEEP_LOCAL_BACKUPS="${CAFE24_LOCAL_BACKUP_KEEP:-30}"
INCLUDE_UPLOADS="${CAFE24_BACKUP_INCLUDE_UPLOADS:-1}"
INCLUDE_SECRETS="${CAFE24_BACKUP_INCLUDE_SECRETS:-1}"
INCLUDE_SERVER_CONFIG="${CAFE24_BACKUP_INCLUDE_SERVER_CONFIG:-1}"
INCLUDE_RUNTIME_EXTRAS="${CAFE24_BACKUP_INCLUDE_RUNTIME_EXTRAS:-1}"
INCLUDE_RHYTHMJOY_CALENDAR="${CAFE24_BACKUP_INCLUDE_RHYTHMJOY_CALENDAR:-1}"

iso_now() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

case "${KEEP_LOCAL_BACKUPS}" in
  ''|*[!0-9]*)
    echo "CAFE24_LOCAL_BACKUP_KEEP must be a non-negative integer." >&2
    exit 2
    ;;
esac

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=no)
RSYNC_SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=no"
if [[ -n "${SSH_KEY}" && -f "${SSH_KEY}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
  RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=no"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
local_dir="${BACKUP_ROOT}/${timestamp}"
remote_tmp="/tmp/swingenjoy-local-backup-${timestamp}-$$"

mkdir -p "${BACKUP_ROOT}"
chmod 700 "${BACKUP_ROOT}" 2>/dev/null || true

lock_dir="${BACKUP_ROOT}/.backup.lock"
if ! mkdir "${lock_dir}" 2>/dev/null; then
  existing_pid="$(cat "${lock_dir}/pid" 2>/dev/null || true)"
  if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
    echo "Another backup appears to be running: ${lock_dir}" >&2
    exit 0
  fi
  rm -rf "${lock_dir}"
  mkdir "${lock_dir}"
fi
echo "$$" > "${lock_dir}/pid"

previous_backup="$(
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '20??????-??????' 2>/dev/null \
    | sort \
    | tail -1
)"
previous_uploads=""
if [[ -n "${previous_backup}" && -d "${previous_backup}/uploads" ]]; then
  previous_uploads="${previous_backup}/uploads"
fi
previous_runtime_swingenjoy=""
if [[ -n "${previous_backup}" && -d "${previous_backup}/server-runtime/opt-swingenjoy" ]]; then
  previous_runtime_swingenjoy="${previous_backup}/server-runtime/opt-swingenjoy"
fi
previous_rhythmjoy_myapp=""
if [[ -n "${previous_backup}" && -d "${previous_backup}/rhythmjoy-calendar/myapp" ]]; then
  previous_rhythmjoy_myapp="${previous_backup}/rhythmjoy-calendar/myapp"
fi
previous_rhythmjoy_ops=""
if [[ -n "${previous_backup}" && -d "${previous_backup}/rhythmjoy-calendar/rhythmjoy_ops" ]]; then
  previous_rhythmjoy_ops="${previous_backup}/rhythmjoy-calendar/rhythmjoy_ops"
fi

mkdir -p "${local_dir}"

cleanup_remote() {
  ssh "${SSH_ARGS[@]}" "${TARGET}" "rm -rf '${remote_tmp}'" >/dev/null 2>&1 || true
}

cleanup_lock() {
  rm -rf "${lock_dir}" >/dev/null 2>&1 || true
}

mark_failed() {
  local exit_code=$?
  if [[ "${exit_code}" -ne 0 ]]; then
    {
      echo "failed_at=$(iso_now)"
      echo "exit_code=${exit_code}"
    } > "${local_dir}/FAILED"
  fi
  cleanup_remote
  cleanup_lock
  exit "${exit_code}"
}
trap mark_failed EXIT

remote_host="$(ssh "${SSH_ARGS[@]}" "${TARGET}" "hostname")"
if [[ "${remote_host}" != "${EXPECTED_HOSTNAME}" ]]; then
  echo "Refusing to back up unexpected Cafe24 host '${remote_host}'." >&2
  echo "Expected host: '${EXPECTED_HOSTNAME}'." >&2
  exit 2
fi

ssh "${SSH_ARGS[@]}" "${TARGET}" \
  "APP_DIR='${APP_DIR}' RHYTHMJOY_APP_DIR='${RHYTHMJOY_APP_DIR}' RHYTHMJOY_OPS_DIR='${RHYTHMJOY_OPS_DIR}' REMOTE_TMP='${remote_tmp}' INCLUDE_UPLOADS='${INCLUDE_UPLOADS}' INCLUDE_SECRETS='${INCLUDE_SECRETS}' INCLUDE_SERVER_CONFIG='${INCLUDE_SERVER_CONFIG}' INCLUDE_RHYTHMJOY_CALENDAR='${INCLUDE_RHYTHMJOY_CALENDAR}' bash -s" <<'REMOTE_BACKUP'
set -euo pipefail

mkdir -p "${REMOTE_TMP}"
cd "${APP_DIR}"

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "Missing ${APP_DIR}/.env" >&2
  exit 2
fi

{
  echo "created_at=$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "hostname=$(hostname)"
  echo "app_dir=${APP_DIR}"
  echo "service_swingenjoy=$(systemctl is-active swingenjoy 2>/dev/null || true)"
  echo "service_mariadb=$(systemctl is-active mariadb 2>/dev/null || true)"
  echo "uploads_size=$(du -sh "${APP_DIR}/uploads" 2>/dev/null | awk '{print $1}' || true)"
  echo "uploads_file_count=$(find "${APP_DIR}/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"
  echo "rhythmjoy_app_dir=${RHYTHMJOY_APP_DIR}"
  echo "rhythmjoy_app_size=$(du -sh "${RHYTHMJOY_APP_DIR}" 2>/dev/null | awk '{print $1}' || true)"
  echo "rhythmjoy_ops_dir=${RHYTHMJOY_OPS_DIR}"
  echo "rhythmjoy_ops_size=$(du -sh "${RHYTHMJOY_OPS_DIR}" 2>/dev/null | awk '{print $1}' || true)"
  echo "dist_version=$(cat "${APP_DIR}/dist/version.json" 2>/dev/null | tr '\n' ' ' || true)"
  echo
  echo "[env keys]"
  sed -n 's/^\([A-Za-z0-9_]*\)=.*/\1/p' "${APP_DIR}/.env" 2>/dev/null | sort
} > "${REMOTE_TMP}/manifest.txt"

if [[ "${INCLUDE_SERVER_CONFIG}" != "0" ]]; then
  config_dir="${REMOTE_TMP}/server-config"
  mkdir -p \
    "${config_dir}/etc/systemd/system" \
    "${config_dir}/etc/httpd/conf.d" \
    "${config_dir}/etc/cron.d" \
    "${config_dir}/etc/letsencrypt/renewal" \
    "${config_dir}/diagnostics"

  cp -p /etc/systemd/system/swingenjoy.service "${config_dir}/etc/systemd/system/" 2>/dev/null || true
  cp -p /etc/systemd/system/rhythmjoy-calendar-cache.service "${config_dir}/etc/systemd/system/" 2>/dev/null || true
  find /etc/httpd/conf.d -maxdepth 1 -type f \
    \( -iname '*swingenjoy*' -o -iname '*rhythmjoy*' -o -iname 'ssl.conf' -o -iname '22ssl' \) \
    -exec cp -p {} "${config_dir}/etc/httpd/conf.d/" \; 2>/dev/null || true
  cp -p /etc/cron.d/rhythmjoy-certbot "${config_dir}/etc/cron.d/" 2>/dev/null || true
  find /etc/letsencrypt/renewal -maxdepth 1 -type f -name '*.conf' \
    -exec cp -p {} "${config_dir}/etc/letsencrypt/renewal/" \; 2>/dev/null || true

  {
    echo "[hostname]"
    hostname || true
    echo
    echo "[date]"
    date '+%Y-%m-%dT%H:%M:%S%z' || true
    echo
    echo "[os-release]"
    cat /etc/os-release 2>/dev/null || true
    echo
    echo "[kernel]"
    uname -a || true
    echo
    echo "[versions]"
    httpd -v 2>/dev/null || true
    mysql --version 2>/dev/null || true
    mysqldump --version 2>/dev/null || true
    node --version 2>/dev/null || true
    npm --version 2>/dev/null || true
    echo
    echo "[services]"
    systemctl is-active httpd mariadb swingenjoy rhythmjoy-calendar-cache 2>/dev/null || true
    echo
    echo "[enabled-units]"
    systemctl list-unit-files --no-pager 2>/dev/null | grep -E 'httpd|mariadb|swingenjoy|rhythmjoy|certbot' || true
    echo
    echo "[httpd-S]"
    httpd -S 2>&1 || true
    echo
    echo "[crontab-root]"
    crontab -l 2>/dev/null || true
    echo
    echo "[disk]"
    df -h || true
  } > "${config_dir}/diagnostics/server-inventory.txt"

  rpm -qa 2>/dev/null | sort > "${config_dir}/diagnostics/rpm-packages.txt" || true
fi

if [[ "${INCLUDE_SECRETS}" != "0" ]]; then
  secrets_dir="${REMOTE_TMP}/secrets"
  mkdir -p "${secrets_dir}"
  cp -p "${APP_DIR}/.env" "${secrets_dir}/opt-swingenjoy.env" 2>/dev/null || true
  cp -p "${APP_DIR}/.env.local" "${secrets_dir}/opt-swingenjoy.env.local" 2>/dev/null || true
  if [[ "${INCLUDE_RHYTHMJOY_CALENDAR}" != "0" ]]; then
    cp -p "${RHYTHMJOY_APP_DIR}/.env" "${secrets_dir}/rhythmjoy-myapp.env" 2>/dev/null || true
  fi
  chmod 600 "${secrets_dir}"/* 2>/dev/null || true
fi

set -a
# shellcheck disable=SC1091
. "${APP_DIR}/.env"
set +a

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-swingenjoy_app}"

: "${MYSQL_USER:?Missing MYSQL_USER in remote .env}"
: "${MYSQL_PASSWORD:?Missing MYSQL_PASSWORD in remote .env}"

MYSQL_PWD="${MYSQL_PASSWORD}" mysql \
  -h "${MYSQL_HOST}" \
  -P "${MYSQL_PORT}" \
  -u "${MYSQL_USER}" \
  -NBe "SELECT table_name, table_rows, ROUND((data_length+index_length)/1024/1024,2) AS mb FROM information_schema.tables WHERE table_schema='${MYSQL_DATABASE}' ORDER BY (data_length+index_length) DESC;" \
  > "${REMOTE_TMP}/mysql-table-sizes.tsv"

MYSQL_PWD="${MYSQL_PASSWORD}" mysql \
  -h "${MYSQL_HOST}" \
  -P "${MYSQL_PORT}" \
  -u "${MYSQL_USER}" \
  -NBe "SHOW GRANTS FOR CURRENT_USER();" \
  > "${REMOTE_TMP}/mysql-current-user-grants.sql" 2>/dev/null || true

MYSQL_PWD="${MYSQL_PASSWORD}" mysqldump \
  -h "${MYSQL_HOST}" \
  -P "${MYSQL_PORT}" \
  -u "${MYSQL_USER}" \
  --single-transaction \
  --quick \
  --skip-lock-tables \
  --default-character-set=utf8mb4 \
  --routines \
  --events \
  --triggers \
  --databases \
  "${MYSQL_DATABASE}" \
  | gzip -9 > "${REMOTE_TMP}/${MYSQL_DATABASE}.sql.gz"

(
  cd "${REMOTE_TMP}"
  find . -type f ! -name SHA256SUMS ! -name SHA256SUMS.tmp -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS.tmp
  mv SHA256SUMS.tmp SHA256SUMS
)
REMOTE_BACKUP

rsync -az -e "${RSYNC_SSH}" "${TARGET}:${remote_tmp}/" "${local_dir}/"
if [[ -d "${local_dir}/secrets" ]]; then
  chmod 700 "${local_dir}/secrets"
  chmod 600 "${local_dir}/secrets"/* 2>/dev/null || true
fi

if [[ "${INCLUDE_UPLOADS}" != "0" ]]; then
  rsync_upload_args=(-az --checksum --delete --stats -e "${RSYNC_SSH}")
  if [[ -n "${previous_uploads}" ]]; then
    rsync_upload_args+=(--link-dest="${previous_uploads}")
  fi

  mkdir -p "${local_dir}/uploads"
  rsync "${rsync_upload_args[@]}" "${TARGET}:${APP_DIR}/uploads/" "${local_dir}/uploads/"

  {
    echo
    echo "[upload snapshot]"
    if [[ -n "${previous_uploads}" ]]; then
      echo "mode=incremental-hardlink-snapshot"
      echo "link_dest=${previous_uploads}"
    else
      echo "mode=initial-full-snapshot"
    fi
    echo "local_uploads_size=$(du -sh "${local_dir}/uploads" 2>/dev/null | awk '{print $1}' || true)"
    echo "local_uploads_file_count=$(find "${local_dir}/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')"
  } >> "${local_dir}/manifest.txt"
fi

if [[ "${INCLUDE_RUNTIME_EXTRAS}" != "0" ]]; then
  runtime_args=(-az --delete --delete-excluded
    --exclude 'node_modules/'
    --exclude 'dist/'
    --exclude 'dist-cafe24/'
    --exclude 'uploads/'
    --exclude 'backups/'
    --exclude '.env'
    --exclude '.env.*'
    --exclude '._*'
    --exclude '.DS_Store'
    -e "${RSYNC_SSH}")
  if [[ -n "${previous_runtime_swingenjoy}" ]]; then
    runtime_args+=(--link-dest="${previous_runtime_swingenjoy}")
  fi
  mkdir -p "${local_dir}/server-runtime/opt-swingenjoy"
  rsync "${runtime_args[@]}" "${TARGET}:${APP_DIR}/" "${local_dir}/server-runtime/opt-swingenjoy/"

  {
    echo
    echo "[server runtime snapshot]"
    if [[ -n "${previous_runtime_swingenjoy}" ]]; then
      echo "opt_swingenjoy_mode=incremental-hardlink-snapshot"
      echo "opt_swingenjoy_link_dest=${previous_runtime_swingenjoy}"
    else
      echo "opt_swingenjoy_mode=initial-full-snapshot"
    fi
    echo "opt_swingenjoy_runtime_size=$(du -sh "${local_dir}/server-runtime/opt-swingenjoy" 2>/dev/null | awk '{print $1}' || true)"
  } >> "${local_dir}/manifest.txt"
fi

if [[ "${INCLUDE_RHYTHMJOY_CALENDAR}" != "0" ]]; then
  calendar_args=(-az --delete --delete-excluded
    --exclude '.env'
    --exclude '.env.*'
    --exclude '._*'
    --exclude '.DS_Store'
    -e "${RSYNC_SSH}")
  if [[ -n "${previous_rhythmjoy_myapp}" ]]; then
    calendar_args+=(--link-dest="${previous_rhythmjoy_myapp}")
  fi
  mkdir -p "${local_dir}/rhythmjoy-calendar/myapp"
  rsync "${calendar_args[@]}" "${TARGET}:${RHYTHMJOY_APP_DIR}/" "${local_dir}/rhythmjoy-calendar/myapp/"

  ops_args=(-az --delete --delete-excluded
    --exclude '.env'
    --exclude '.env.*'
    --exclude '._*'
    --exclude '.DS_Store'
    -e "${RSYNC_SSH}")
  if [[ -n "${previous_rhythmjoy_ops}" ]]; then
    ops_args+=(--link-dest="${previous_rhythmjoy_ops}")
  fi
  mkdir -p "${local_dir}/rhythmjoy-calendar/rhythmjoy_ops"
  rsync "${ops_args[@]}" "${TARGET}:${RHYTHMJOY_OPS_DIR}/" "${local_dir}/rhythmjoy-calendar/rhythmjoy_ops/"

  {
    echo
    echo "[rhythmjoy calendar snapshot]"
    if [[ -n "${previous_rhythmjoy_myapp}" ]]; then
      echo "myapp_mode=incremental-hardlink-snapshot"
      echo "myapp_link_dest=${previous_rhythmjoy_myapp}"
    else
      echo "myapp_mode=initial-full-snapshot"
    fi
    if [[ -n "${previous_rhythmjoy_ops}" ]]; then
      echo "ops_mode=incremental-hardlink-snapshot"
      echo "ops_link_dest=${previous_rhythmjoy_ops}"
    else
      echo "ops_mode=initial-full-snapshot"
    fi
    echo "myapp_size=$(du -sh "${local_dir}/rhythmjoy-calendar/myapp" 2>/dev/null | awk '{print $1}' || true)"
    echo "ops_size=$(du -sh "${local_dir}/rhythmjoy-calendar/rhythmjoy_ops" 2>/dev/null | awk '{print $1}' || true)"
  } >> "${local_dir}/manifest.txt"
fi

{
  echo "downloaded_at=$(iso_now)"
  echo "local_dir=${local_dir}"
  echo "remote_tmp=${remote_tmp}"
} >> "${local_dir}/manifest.txt"

if [[ "${KEEP_LOCAL_BACKUPS}" -gt 0 ]]; then
  find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -name '20??????-??????' \
    | sort -r \
    | awk "NR>${KEEP_LOCAL_BACKUPS}" \
    | while IFS= read -r old_backup; do
        rm -rf "${old_backup}"
      done
fi

trap - EXIT
cleanup_remote
cleanup_lock

echo "Backup completed: ${local_dir}"
