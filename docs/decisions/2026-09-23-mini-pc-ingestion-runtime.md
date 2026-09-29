# Move automatic collection to the Mini PC

- Date: 2026-09-23
- Status: adopted; six Mini PC timers enabled and six Mac jobs disabled/unloaded after live validation

## Responsibility and existing behavior

Mac launchd scheduled six copies of an external wrapper. That wrapper owns the
existing global run lock, timeout, preflight, and notification policy. The native
collector owns source selection, date-aware retry, evidence parsing, persistence,
and progress. The Cafe24 registration API owns public event mutation and conflict
protection. The Mini PC already owns an independent kiosk and reservation worker.

The portability implementation was partial: the worker accepts browser and progress
paths, but the launcher hardcoded a Mac home and Chrome executable. The existing
launcher is moved into `scripts/run-ingestion.sh`; the former external entrypoint
becomes a compatibility shim. No second collector, database schema, queue, or
completion status is introduced.

## Decision

Run the same collector from a minimal source/dependency bundle on the Ubuntu Mini PC.
Translate the existing six schedules into systemd user timers rather than maintain
two hand-written schedule tables. Keep a separate headless Chrome profile on 9224,
the existing shared local lock, date-aware checkpoints, and server publication guards.
Native collection opens the browser itself after deciding whether there is work;
the wrapper must not create a blank window before a no-op retry.

Disable and unload all Mac ingestion jobs only when idle. Copy the six progress
files byte-for-byte and recent notification receipts before starting the Mini PC.
Preserve its existing kiosk/reservation automation. Limit worker resources and retain
the normal bounded run timeout. An enabled-file condition permits a quick pause.

## Validation and rollback

Validate network/source access, Codex authentication and an actual AI request,
candidate API persistence, the no-work retry, progress continuity, and kiosk health
separately. AI approval, candidate storage, and public registration are distinct;
a login wall or a conflicting source must remain an unresolved/review result.

Rollback stops Mini PC timers and finishes workers before copying the latest progress
back and re-enabling Mac launchd. There is no always-on Mac tunnel dependency. The
operational update and rollback procedure is in `ops/ingestion/mini-pc/README.md`.

## Observed cutover result

- 2026-09-23: Mini PC Celeron J4005, 2 cores, 7.5 GiB RAM, 89 GiB free disk,
  KST/NTP synchronized. Kiosk PID 1365388 stayed unchanged throughout testing.
- Browser and dependencies, standards check, and Codex 0.153.4 actual model call passed.
- Six checkpoint SHA-256 hashes matched after transfer; 300 recent metadata receipts copied.
- `20260923_155330_2757798`: bounded Everlatin cafe dry-run passed; one document read.
- `20260923_160700_2761324`: swing priority2 selected zero unresolved sources and opened no browser.
- `20260923_160943_2761882`: Mini PC collected the public Instagram source and registered
  9/23 Social Club / DJ 쓴귤 as event `640a956a-5a0d-43fb-a771-4913ff7799a6`.
  A separate monthly timetable still produced an extraction review issue; that is not
  a missing daily occurrence. Public GET confirmed exactly one real event and no generated placeholder.
- `20260923_161229_2763676`: repeating priority1 selected zero and opened no browser.
- Six timers enabled with next runs visible; no active Mac ingestion launchd job remains.
  The follow-up review verified natural timer run `20260923_163000_2765591`:
  today's registered occurrence was excluded, with zero sources and no browser opened.
- 35 evidence/progress tests + 11 registration-conflict tests + 3 run-lock tests passed;
  standards passed locally and on the Mini PC. Syntax, unit validation, and source checksum comparison passed.
  Web UI build/deploy and physical reboot were excluded: no site code was changed for this migration,
  and reboot would interrupt an otherwise healthy kiosk/reservation worker. Linger and enabled timer
  configuration were checked instead.
- Normal Chrome and collector Instagram sessions remain separate. A fresh Mini PC profile read the
  verified current public post without login. Some Mac reads had login walls; no authentication
  protection was weakened, and universal access to all sources is not implied by the sample test.
