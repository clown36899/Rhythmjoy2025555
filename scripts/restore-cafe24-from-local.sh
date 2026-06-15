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
EXPECTED_HOSTNAME="${CAFE24_RESTORE_EXPECTED_HOSTNAME:-}"
MYSQL_ROOT_ARGS="${CAFE24_RESTORE_MYSQL_ROOT_ARGS:--uroot}"

APPLY=0
RESTORE_CONFIG=1
RESTORE_SECRETS=1
RESTORE_DB=1
RESTORE_UPLOADS=1
RESTORE_RUNTIME=1
RESTORE_RHYTHMJOY=1
BACKUP_DIR=""

usage() {
  cat <<USAGE
Usage: $0 BACKUP_DIR [--apply] [options]

Options:
  --apply              Actually restore. Without this, only prints planned work.
  --skip-config        Do not restore systemd/httpd config snapshots.
  --skip-secrets       Do not restore .env secret files.
  --skip-db            Do not import MySQL dump.
  --skip-uploads       Do not restore /opt/swingenjoy/uploads.
  --skip-runtime       Do not restore /opt/swingenjoy runtime extras.
  --skip-rhythmjoy     Do not restore Rhythmjoy calendar static app/ops dirs.

Environment:
  CAFE24_SSH_TARGET, CAFE24_SSH_KEY, CAFE24_SWINGENJOY_APP_DIR
  CAFE24_RESTORE_EXPECTED_HOSTNAME   Optional hostname safety check.
  CAFE24_RESTORE_MYSQL_ROOT_ARGS     Default: -uroot
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --skip-config) RESTORE_CONFIG=0 ;;
    --skip-secrets) RESTORE_SECRETS=0 ;;
    --skip-db) RESTORE_DB=0 ;;
    --skip-uploads) RESTORE_UPLOADS=0 ;;
    --skip-runtime) RESTORE_RUNTIME=0 ;;
    --skip-rhythmjoy) RESTORE_RHYTHMJOY=0 ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "${BACKUP_DIR}" ]]; then
        echo "Only one BACKUP_DIR is allowed." >&2
        exit 2
      fi
      BACKUP_DIR="$1"
      ;;
  esac
  shift
done

if [[ -z "${BACKUP_DIR}" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Backup directory not found: ${BACKUP_DIR}" >&2
  exit 2
fi

if [[ -f "${BACKUP_DIR}/FAILED" ]]; then
  echo "Refusing to restore from a failed backup: ${BACKUP_DIR}/FAILED" >&2
  exit 2
fi

dump_file="${BACKUP_DIR}/swingenjoy_app.sql.gz"
if [[ "${RESTORE_DB}" -eq 1 && ! -f "${dump_file}" ]]; then
  echo "Missing DB dump: ${dump_file}" >&2
  exit 2
fi

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=no)
RSYNC_SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=no"
if [[ -n "${SSH_KEY}" && -f "${SSH_KEY}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
  RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=no"
fi

remote_host="$(ssh "${SSH_ARGS[@]}" "${TARGET}" "hostname")"
if [[ -n "${EXPECTED_HOSTNAME}" && "${remote_host}" != "${EXPECTED_HOSTNAME}" ]]; then
  echo "Refusing to restore to unexpected host '${remote_host}'." >&2
  echo "Expected host: '${EXPECTED_HOSTNAME}'." >&2
  exit 2
fi

echo "Restore target: ${TARGET} (${remote_host})"
echo "Backup dir: ${BACKUP_DIR}"
if [[ "${APPLY}" -ne 1 ]]; then
  echo "Dry run only. Re-run with --apply to restore."
fi

run_or_show() {
  if [[ "${APPLY}" -eq 1 ]]; then
    "$@"
  else
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  fi
}

remote_restore_tmp="/tmp/swingenjoy-restore-$(date +%Y%m%d-%H%M%S)-$$"

if [[ "${RESTORE_CONFIG}" -eq 1 && -d "${BACKUP_DIR}/server-config" ]]; then
  run_or_show rsync -az -e "${RSYNC_SSH}" "${BACKUP_DIR}/server-config/etc/systemd/system/" "${TARGET}:/etc/systemd/system/"
  run_or_show rsync -az -e "${RSYNC_SSH}" "${BACKUP_DIR}/server-config/etc/httpd/conf.d/" "${TARGET}:/etc/httpd/conf.d/"
  run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "systemctl daemon-reload"
fi

if [[ "${RESTORE_RUNTIME}" -eq 1 && -d "${BACKUP_DIR}/server-runtime/opt-swingenjoy" ]]; then
  run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${APP_DIR}'"
  run_or_show rsync -az --delete -e "${RSYNC_SSH}" "${BACKUP_DIR}/server-runtime/opt-swingenjoy/" "${TARGET}:${APP_DIR}/"
fi

if [[ "${RESTORE_SECRETS}" -eq 1 && -d "${BACKUP_DIR}/secrets" ]]; then
  run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${APP_DIR}' '${RHYTHMJOY_APP_DIR}'"
  if [[ -f "${BACKUP_DIR}/secrets/opt-swingenjoy.env" ]]; then
    run_or_show rsync -az -e "${RSYNC_SSH}" "${BACKUP_DIR}/secrets/opt-swingenjoy.env" "${TARGET}:${APP_DIR}/.env"
  fi
  if [[ -f "${BACKUP_DIR}/secrets/opt-swingenjoy.env.local" ]]; then
    run_or_show rsync -az -e "${RSYNC_SSH}" "${BACKUP_DIR}/secrets/opt-swingenjoy.env.local" "${TARGET}:${APP_DIR}/.env.local"
  fi
  if [[ -f "${BACKUP_DIR}/secrets/rhythmjoy-myapp.env" ]]; then
    run_or_show rsync -az -e "${RSYNC_SSH}" "${BACKUP_DIR}/secrets/rhythmjoy-myapp.env" "${TARGET}:${RHYTHMJOY_APP_DIR}/.env"
  fi
  run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "chmod 600 '${APP_DIR}/.env' '${APP_DIR}/.env.local' '${RHYTHMJOY_APP_DIR}/.env' 2>/dev/null || true"
fi

if [[ "${RESTORE_DB}" -eq 1 ]]; then
  if [[ "${APPLY}" -eq 1 ]]; then
    ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${remote_restore_tmp}'"
    rsync -az -e "${RSYNC_SSH}" "${dump_file}" "${TARGET}:${remote_restore_tmp}/swingenjoy_app.sql.gz"
    ssh "${SSH_ARGS[@]}" "${TARGET}" "APP_DIR='${APP_DIR}' MYSQL_ROOT_ARGS='${MYSQL_ROOT_ARGS}' DUMP='${remote_restore_tmp}/swingenjoy_app.sql.gz' bash -s" <<'REMOTE_DB_RESTORE'
set -euo pipefail
set -a
# shellcheck disable=SC1091
. "${APP_DIR}/.env"
set +a

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-swingenjoy_app}"

sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

quoted_db="$(sql_quote "${MYSQL_DATABASE}")"
quoted_user="$(sql_quote "${MYSQL_USER}")"
quoted_password="$(sql_quote "${MYSQL_PASSWORD}")"

mysql ${MYSQL_ROOT_ARGS} <<SQL
CREATE DATABASE IF NOT EXISTS \`${quoted_db}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${quoted_user}'@'localhost' IDENTIFIED BY '${quoted_password}';
CREATE USER IF NOT EXISTS '${quoted_user}'@'127.0.0.1' IDENTIFIED BY '${quoted_password}';
GRANT ALL PRIVILEGES ON \`${quoted_db}\`.* TO '${quoted_user}'@'localhost';
GRANT ALL PRIVILEGES ON \`${quoted_db}\`.* TO '${quoted_user}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

gunzip -c "${DUMP}" | MYSQL_PWD="${MYSQL_PASSWORD}" mysql -h "${MYSQL_HOST}" -P "${MYSQL_PORT}" -u "${MYSQL_USER}"
REMOTE_DB_RESTORE
    ssh "${SSH_ARGS[@]}" "${TARGET}" "rm -rf '${remote_restore_tmp}'"
  else
    echo "+ copy ${dump_file} to ${TARGET}:${remote_restore_tmp}/ and import with MySQL"
  fi
fi

if [[ "${RESTORE_UPLOADS}" -eq 1 && -d "${BACKUP_DIR}/uploads" ]]; then
  run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${APP_DIR}/uploads'"
  run_or_show rsync -az --delete -e "${RSYNC_SSH}" "${BACKUP_DIR}/uploads/" "${TARGET}:${APP_DIR}/uploads/"
fi

if [[ "${RESTORE_RHYTHMJOY}" -eq 1 && -d "${BACKUP_DIR}/rhythmjoy-calendar" ]]; then
  if [[ -d "${BACKUP_DIR}/rhythmjoy-calendar/myapp" ]]; then
    run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${RHYTHMJOY_APP_DIR}'"
    run_or_show rsync -az --delete -e "${RSYNC_SSH}" "${BACKUP_DIR}/rhythmjoy-calendar/myapp/" "${TARGET}:${RHYTHMJOY_APP_DIR}/"
  fi
  if [[ -d "${BACKUP_DIR}/rhythmjoy-calendar/rhythmjoy_ops" ]]; then
    run_or_show ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${RHYTHMJOY_OPS_DIR}'"
    run_or_show rsync -az --delete -e "${RSYNC_SSH}" "${BACKUP_DIR}/rhythmjoy-calendar/rhythmjoy_ops/" "${TARGET}:${RHYTHMJOY_OPS_DIR}/"
  fi
fi

if [[ "${APPLY}" -eq 1 ]]; then
  ssh "${SSH_ARGS[@]}" "${TARGET}" "systemctl daemon-reload; systemctl restart swingenjoy 2>/dev/null || true; systemctl reload httpd 2>/dev/null || systemctl restart httpd 2>/dev/null || true"
  echo "Restore finished. Check services and domains before accepting traffic."
fi
