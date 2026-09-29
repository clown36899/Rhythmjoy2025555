# Kiosk display reconciliation

- Date: 2026-08-19
- Status: Accepted

## Context

The portrait Mini PC kiosk previously applied `1920x1080/right` once at graphical-session startup. The systemd oneshot remained `active (exited)`, so it did not notice a later HDMI EDID refresh. GNOME then restored its older saved `1280x720/normal` configuration and the physically portrait screen showed the entire kiosk sideways.

## Decision

Store the correct GNOME monitor profile for the identified `HDMI-1` display and run `kiosk-display.service` as a long-lived reconciler. Every 10 seconds it reads the live X11 output state and applies `1920x1080/right` only when the resulting logical geometry is not `1080x1920/right`.

The reconciler owns only the Mini PC's kiosk display output. It does not restart the computer, change the website, modify Chrome state, or act on disconnected outputs beyond waiting for the expected connector to return.

The operational snapshot and restore script must install both the reconciler service/script and the GNOME `monitors.xml` profile.

## Consequences

- Monitor power cycles, input switching, and HDMI renegotiation should self-recover within roughly 10 seconds.
- A healthy portrait output is not repeatedly mode-set, avoiding periodic visible flicker.
- `kiosk-display.service` is expected to remain `active (running)`, not `active (exited)`.
- The pre-change files remain recoverable on the Mini PC under their `.bak-20260819` names.
