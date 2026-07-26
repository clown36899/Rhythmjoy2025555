#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPOSITORY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
USER_HOME="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
NODE_PATH="$(command -v node)"
LABEL="com.rhythmjoy.social-reel-publish"
SOURCE_PLIST="$REPOSITORY_ROOT/ops/macos/$LABEL.plist"
TARGET_PLIST="$USER_HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIRECTORY="$USER_HOME/social-reel-runs"
TEMP_PLIST="$(mktemp "${TMPDIR:-/tmp}/rhythmjoy-social-reel.XXXXXX.plist")"

cleanup() {
  rm -f "$TEMP_PLIST"
}
trap cleanup EXIT

mkdir -p "$USER_HOME/Library/LaunchAgents" "$LOG_DIRECTORY"
sed \
  -e "s|__REPOSITORY_ROOT__|$REPOSITORY_ROOT|g" \
  -e "s|__USER_HOME__|$USER_HOME|g" \
  -e "s|__NODE_PATH__|$NODE_PATH|g" \
  "$SOURCE_PLIST" > "$TEMP_PLIST"
plutil -lint "$TEMP_PLIST"
cp "$TEMP_PLIST" "$TARGET_PLIST"
chmod 644 "$TARGET_PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET_PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl print "gui/$(id -u)/$LABEL"
