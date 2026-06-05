# Mini PC Kiosk Backup

This folder is a snapshot of the kiosk configuration currently installed on the mini PC.

## Included

- Chrome kiosk systemd user service
- External URL guard systemd user service and Python script
- Display setup systemd user service and script
- Kiosk Chrome extension files
- Chrome managed policy for update UI, popups, and external protocol blocking
- Status logs captured at backup time
- Restore script

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
ssh kiosk-j@172.30.1.13 'systemctl --user is-active kiosk-chrome.service kiosk-url-guard.service kiosk-display.service'
```

All three services should print `active`.
