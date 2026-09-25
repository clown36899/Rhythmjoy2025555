# Mini PC ingestion runtime

The collection worker runs on `kiosk-j@kiosk-host.local` independently of the Mac.
The kiosk remains a separate service and browser. Source rules and collection logic
are still owned by `scripts/ingestion/`; do not implement another collector here.

As of the user's later decision on 2026-09-25, social/closure collection and automatic
registration are enabled again (`automaticSocialCollectionEnabled=true`). Official
notice links complement collected schedules. Existing full-scan hours each permit
one discovery of new/changed evidence; intermediate ticks retry unresolved socials
occurring today. Completed items and unchanged future failures remain protected.
A delayed start catches the current discovery window once, without replaying missed
windows. Existing six timers, progress files, and source directory remain owners.
See `docs/decisions/2026-09-25-social-discovery-windows.md`.

## Installed locations

- Code: `~/.local/share/rhythmjoy-ingestion/runtime`
- Codex: `~/.local/share/rhythmjoy-ingestion/tools/node_modules/.bin/codex`
- Runtime/profile settings: `~/.config/rhythmjoy-ingestion/*.env`
- Ingestion credentials: `~/.config/rhythmjoy-ingestion/secrets.env` (600)
- Codex credentials: `~/.codex/auth.json` (600, never in source control)
- Collector Chrome profile: `~/.local/share/rhythmjoy-ingestion/browser`
- Collector CDP: loopback port 9224; kiosk uses 9222 and must not be reused
- Progress and run records: `~/ingestion-runs/`, including existing `state/*.json`
- Run gate: `~/.config/rhythmjoy-ingestion/enabled`

The existing six plist schedules are the schedule source. `render-units.py` converts
them to systemd timers without enabling anything. All profiles share the existing
`/tmp/rhythmjoy-ingestion.lock`. `Linger=yes` and enabled user timers allow runs
without a logged-in Mac or an SSH connection. The service uses Nice=10, one CPU
equivalent maximum, and a 3 GiB memory cap. No browser is opened for an empty
same-day retry. There is no systemd restart loop; the existing date-aware policy
and timer own the next attempt.

## Update and validate

1. Run the relevant repository tests and `node scripts/test-ingestion-standards.mjs`.
2. Use `node ops/ingestion/mini-pc/stage-runtime.mjs /private/staging/runtime`.
   It copies the existing dependency closure and derives the three browser package
   versions from the repository lockfile. It does not copy credentials or the web app.
3. Stop the six ingestion timers, wait for running ingestion services to finish,
   back up the installed runtime, then synchronize the staged code over authenticated SSH.
   Never alter kiosk, reservation automation, or another Chrome profile.
4. If dependencies changed, run `npm install --no-audit --no-fund` in the runtime.
   Validate the standards check on the Mini PC too. Replacing source files alone
   does not require reinstalling dependencies.
5. Keep `TELEGRAM_DRY_RUN=1` during explicit tests. Use the existing
   `INGESTION_NATIVE_DRY_RUN=1` and bounded source/run limits for source reading.
   A successful empty scan is not evidence of AI or persistence success; test these separately.
6. Verify the existing progress files, actual public events, and per-run `.meta`/
   `.last.txt` results. Resume timers only after validating the new runtime.
   For retry changes, include `ingestion-progress.test.js` and
   `telegram-notification-policy.test.mjs`: failure on today's occurrence must retry
   on the next tick, then stop after public registration. The observed
   `pipeline.reconciliation.sameDayRetry` distinguishes today's pending sources from
   unrelated document errors. `verified: false` means the baseline is unknown, not zero.

The Mac's installed `/Users/inteyeo/scripts/run-ingestion.sh` delegates to the tracked
`scripts/run-ingestion.sh`. The six Mac launchd jobs are disabled and unloaded.
Do not bootstrap them while the Mini PC is active. Local repository edits are not
automatically synchronized to the Mini PC; apply the runtime update above.

## Rollback and checks

To pause, stop all `rhythmjoy-ingestion-*.timer` units and remove the run gate.
Let an active worker finish; do not kill the kiosk. To return to the Mac, first
stop Mini PC schedules and finish workers, then copy its latest six progress files
and recent notification `.meta` records back before enabling the Mac jobs. Never
restore stale progress over a worker that is still running. Mac pre-migration
backups are in `/Users/inteyeo/ingestion-runs/migration-20260923/mac-backup`.

Check `systemctl --user list-timers 'rhythmjoy-ingestion-*'`, per-instance service
`Result`/`ExecMainStatus`, and `~/ingestion-runs/*.last.txt`. Exit 75 means an
explicitly recorded partial run; it must not be described as successful collection.
Check `kiosk-chrome.service` and `kiosk-display.service` separately.
An absent notification is not an absent run: the existing alert policy suppresses
the same problem for 24 hours without changing timer or retry selection. Match the
run ID, source URL, occurrence date and public event before diagnosing a stopped retry.
Never use blanket Chrome/Playwright process kills on this shared host; the ingestion
wrapper and the relevant service control group own their children.

Instagram's normal Chrome login and the collection profile are separate. Copying
Mac Chrome's encrypted profile directory is not a portable authentication migration.
First read a known successful source URL and the current occurrence in the actual
collection profile; an absent session cookie alone does not establish a login need.
If the source requires authentication, import a user-authorized Instagram session
through the browser's supported storage state APIs while the collection profile is
idle, then verify those URLs again. Do not remove login/verification protections.
Codex authentication was transferred over SSH using the documented
[headless authentication method](https://learn.chatgpt.com/docs/auth#fallback-authenticate-locally-and-copy-your-auth-cache).
