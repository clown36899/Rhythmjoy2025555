# Kiosk page-level watchdog

- Date: 2026-08-14
- Status: Accepted

## Context

The Mini PC kiosk can remain on a `502`, `503`, or browser network-error page after the public site recovers. The Chrome process remains alive in this state, so the existing systemd `Restart=always` process policy does not recover the visible page.

## Decision

Run a systemd user timer once per minute to inspect Chrome's local DevTools page list. Restart only `kiosk-chrome.service` when both conditions hold:

1. The visible browser target is an error page or has left the Swing Enjoy domain.
2. `https://swingenjoy.com/kiosk` currently returns a successful HTTP response.

The watchdog does not restart the Mini PC, the web server, the database, or any ingestion service. If the public site is still unavailable, it records the state and leaves Chrome running so it cannot create a restart loop during a real server outage.

The legacy external URL guard remains installed only as a fallback and is disabled by default.

## Consequences

- A kiosk stranded on a temporary upstream error page should recover within roughly one minute after the public site becomes healthy.
- Page-level failures are recorded in the user journal under `kiosk-page-watchdog.service`.
- The operational snapshot and restore script must install and enable the watchdog timer together with the Chrome and display services.
