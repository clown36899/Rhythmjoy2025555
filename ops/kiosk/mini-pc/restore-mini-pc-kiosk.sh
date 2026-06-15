#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-kiosk-j@172.30.1.13}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_DIR="${SCRIPT_DIR}/snapshot"

SSH_ARGS=(-o StrictHostKeyChecking=no)
SCP_ARGS=(-o StrictHostKeyChecking=no)

if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_ARGS=(-i "${SSH_KEY}" "${SSH_ARGS[@]}")
  SCP_ARGS=(-i "${SSH_KEY}" "${SCP_ARGS[@]}")
fi

need_file() {
  if [[ ! -e "$1" ]]; then
    printf 'Missing backup file: %s\n' "$1" >&2
    exit 1
  fi
}

need_file "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-chrome.service"
need_file "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-url-guard.service"
need_file "${SNAPSHOT_DIR}/home/kiosk-j/dot-local/bin/kiosk-display-setup.sh"
need_file "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-display.service"
need_file "${SNAPSHOT_DIR}/etc/opt/chrome/policies/managed/kiosk-suppress-update-ui.json"

ssh "${SSH_ARGS[@]}" "${HOST}" 'mkdir -p ~/.local/bin ~/.local/share/kiosk-domain-guard ~/.config/systemd/user /tmp/kiosk-restore-policy'

scp "${SCP_ARGS[@]}" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-local/bin/kiosk-url-guard.py" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-local/bin/kiosk-display-setup.sh" \
  "${HOST}:/home/kiosk-j/.local/bin/"

scp "${SCP_ARGS[@]}" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-chrome.service" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-url-guard.service" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-config/systemd/user/kiosk-display.service" \
  "${HOST}:/home/kiosk-j/.config/systemd/user/"

scp "${SCP_ARGS[@]}" \
  "${SNAPSHOT_DIR}/home/kiosk-j/dot-local/share/kiosk-domain-guard/"* \
  "${HOST}:/home/kiosk-j/.local/share/kiosk-domain-guard/"

scp "${SCP_ARGS[@]}" \
  "${SNAPSHOT_DIR}/etc/opt/chrome/policies/managed/kiosk-suppress-update-ui.json" \
  "${HOST}:/tmp/kiosk-restore-policy/kiosk-suppress-update-ui.json"

ssh "${SSH_ARGS[@]}" "${HOST}" '
  chmod 700 ~/.local/bin
  chmod 755 ~/.local/bin/kiosk-url-guard.py ~/.local/bin/kiosk-display-setup.sh
  systemctl --user daemon-reload
  systemctl --user enable --now kiosk-display.service kiosk-chrome.service
  systemctl --user disable --now kiosk-url-guard.service || true
  printf "Installing Chrome policy with sudo. Enter the kiosk sudo password if prompted.\n"
  sudo install -d -m 755 /etc/opt/chrome/policies/managed
  sudo install -m 644 /tmp/kiosk-restore-policy/kiosk-suppress-update-ui.json /etc/opt/chrome/policies/managed/kiosk-suppress-update-ui.json
  systemctl --user restart kiosk-display.service kiosk-chrome.service
'

printf 'Mini PC kiosk restore complete for %s\n' "${HOST}"
