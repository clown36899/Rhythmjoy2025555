# Mini PC Kiosk Backup

This folder is a snapshot of the kiosk configuration currently installed on the mini PC.

## Included

- Chrome kiosk systemd user service
- Legacy external URL guard systemd user service and Python script
- Display setup systemd user service and script
- Legacy Kiosk Chrome extension files
- Chrome managed policy for update UI, popups, and external protocol blocking
- Status logs captured at backup time
- Restore script

## Current Kiosk URL

The mini PC should open the site-owned kiosk route:

```text
https://swingenjoy.com/kiosk
```

That route enables kiosk mode in the web app, then redirects to `/`.
Kiosk CSS, QR external-link guidance, and carousel controls now live in the site code.
The old mini PC URL guard and Chrome extension files are kept only as a legacy fallback.

Latest verified production deploy:

- Checked at `2026-06-15 13:52 KST`
- `version.json` buildTime: `1781499072842`
- Main bundle: `assets/index-B3LKFnlq.js`
- Main CSS: `assets/index-B_uTh6zM.css`
- Mini PC menu expands upward from `150px` to about `375px`; no internal menu scroll.
- Genre tabs start below the enlarged kiosk header.

## Repository Path Names

The remote mini PC paths `.local` and `.config` are stored here as `dot-local`
and `dot-config` so the main project `.gitignore` cannot accidentally hide them.
The restore script maps them back to `.local` and `.config` on the mini PC.

## Not Included

- SSH private keys
- Chrome browsing profile, cookies, cache, or saved login sessions
- Site project source code

## Restore

From this folder:

```bash
SSH_KEY=/path/to/ssh/key ./restore-mini-pc-kiosk.sh kiosk-j@172.30.1.13
```

If `SSH_KEY` is omitted, the script uses normal SSH authentication.
The script may ask for the kiosk user's sudo password when installing the Chrome policy.

## Quick Check After Restore

```bash
ssh kiosk-j@172.30.1.13 'systemctl --user is-active kiosk-chrome.service kiosk-display.service; systemctl --user is-enabled kiosk-url-guard.service || true'
```

`kiosk-chrome.service` and `kiosk-display.service` should print `active`.
`kiosk-url-guard.service` should be disabled unless intentionally using the legacy fallback.
