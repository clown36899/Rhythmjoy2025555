#!/bin/sh
set -eu

export DISPLAY=:0
export XAUTHORITY=/run/user/1000/gdm/Xauthority

OUTPUT=HDMI-1
MODE=1920x1080
ROTATION=right
LOGICAL_MODE=1080x1920
WATCH_INTERVAL_SECONDS=10

reconcile_display() {
  tries=0
  while [ "$tries" -lt 40 ]; do
    if ! state=$(/usr/bin/xrandr --query); then
      tries=$((tries + 1))
      sleep 1
      continue
    fi
    if printf '%s\n' "$state" | grep -q "^${OUTPUT} connected"; then
      if printf '%s\n' "$state" | grep -Eq "^${OUTPUT} connected primary ${LOGICAL_MODE}\\+0\\+0 ${ROTATION}( |$)"; then
        return 0
      fi

      if ! /usr/bin/xrandr --output "$OUTPUT" --primary --mode "$MODE" --rotate "$ROTATION"; then
        return 1
      fi
      /usr/bin/xrandr --query \
        | grep -Eq "^${OUTPUT} connected primary ${LOGICAL_MODE}\\+0\\+0 ${ROTATION}( |$)"
      return
    fi
    tries=$((tries + 1))
    sleep 1
  done

  return 1
}

if [ "${1:-}" = "--watch" ]; then
  while :; do
    reconcile_display || true
    sleep "$WATCH_INTERVAL_SECONDS"
  done
fi

reconcile_display
