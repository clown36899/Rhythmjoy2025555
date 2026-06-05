#!/bin/sh
set -eu

export DISPLAY=:0
export XAUTHORITY=/run/user/1000/gdm/Xauthority

OUTPUT=HDMI-1
MODE=1920x1080
ROTATION=right

tries=0
while [ "$tries" -lt 40 ]; do
  if /usr/bin/xrandr --query | grep -q "^${OUTPUT} connected"; then
    /usr/bin/xrandr --output "$OUTPUT" --primary --mode "$MODE" --rotate "$ROTATION"
    exit 0
  fi
  tries=$((tries + 1))
  sleep 1
done

exit 1
