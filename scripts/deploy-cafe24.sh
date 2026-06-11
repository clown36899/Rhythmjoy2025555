#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${CAFE24_SSH_TARGET:-root@swingenjoy.com}"
APP_DIR="${CAFE24_APP_DIR:-/opt/swingenjoy}"
SSH_KEY="${CAFE24_SSH_KEY:-$HOME/.ssh/swingenjoy_cafe24_ed25519}"

SSH_ARGS=(-o BatchMode=yes -o StrictHostKeyChecking=no)
RSYNC_SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=no"
if [[ -n "${SSH_KEY}" && -f "${SSH_KEY}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
  RSYNC_SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=no"
fi

cd "${ROOT_DIR}"

npm run build:cafe24

ssh "${SSH_ARGS[@]}" "${TARGET}" "mkdir -p '${APP_DIR}/dist' '${APP_DIR}/dist-cafe24' '${APP_DIR}/server/cafe24'"

rsync -az --delete --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist/ "${TARGET}:${APP_DIR}/dist/"
rsync -az --delete --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" dist-cafe24/ "${TARGET}:${APP_DIR}/dist-cafe24/"
rsync -az --delete --exclude '.DS_Store' --exclude '._*' -e "${RSYNC_SSH}" server/cafe24/ "${TARGET}:${APP_DIR}/server/cafe24/"
rsync -az -e "${RSYNC_SSH}" package.json package-lock.json "${TARGET}:${APP_DIR}/"

ssh "${SSH_ARGS[@]}" "${TARGET}" "cd '${APP_DIR}' && systemctl restart swingenjoy && systemctl is-active swingenjoy && cat dist/version.json"
