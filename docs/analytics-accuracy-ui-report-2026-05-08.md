# Analytics Accuracy and UI Report - 2026-05-08

## Applied changes

- Centralized analytics tracking eligibility in `src/utils/analyticsEngine.ts`.
- Blocked local/dev traffic and likely bot traffic before analytics writes.
- Kept admin traffic excluded at write time.
- Added session finalization through `/.netlify/functions/analytics-session` using `sendBeacon` first, with `fetch(... keepalive)` fallback.
- Added registration/success activity tracking for social schedules, shops, venues, board posts, and board memos.
- Added HTML sanitization around board editor output and rendered HTML.
- Improved `SiteAnalyticsModal` layout density, responsive grids, mobile header/date controls, list truncation, and card spacing.
- Split bot detection runtime signals from historical UA analysis:
  - live tracking still checks `navigator.webdriver` and prerender state.
  - stats screen historical filtering only checks stored `user_agent`.
- Since `session_logs` currently has no `user_agent` column, session stats now also exclude sessions whose `session_id` or `fingerprint` appeared in a bot UA click log.
- Added `user_agent` and `platform` columns to `session_logs` and started writing them at session start.
- Updated session stats to directly exclude bot sessions by stored `session_logs.user_agent` when available.

## DB spot check

Recent 7 days checked on 2026-05-08:

- `site_analytics_logs`
  - fetched rows: 306
  - valid rows after admin/excluded/bot filter: 306
  - anonymous rows: 136
  - anonymous unique 6-hour visitors: 36
  - bot rows excluded by UA: 0
  - anonymous rows without fingerprint: 0

- `session_logs`
  - fetched rows: 221
  - valid rows after admin/excluded filter: 189
  - anonymous rows: 114
  - anonymous unique 6-hour visitors: 105
  - rows with end/duration data: 127
  - anonymous rows without identifier: 0

## Accuracy notes

- Non-login click analytics currently have usable identifiers: no recent anonymous click rows were missing `fingerprint`.
- Non-login session analytics also have usable identifiers: no recent anonymous session rows were missing both `fingerprint` and `session_id`.
- Historical bot filtering is stronger for new `session_logs` rows after 2026-05-08, because new sessions now store `user_agent`.
- Older `session_logs` rows created before the schema change still do not have `user_agent`; they are filtered through linked bot click logs by `session_id/fingerprint`.
- New traffic is filtered before write, so bot noise should decrease going forward.
- `session_logs.user_agent/platform` schema was applied to the remote DB and verified through Supabase REST insert/select/delete.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run build:only`: passed.
- Remote `session_logs` insert/select/delete with `user_agent/platform`: passed.
- `/.netlify/functions/analytics-session` local POST smoke test: passed.
- `npm test -- --run`: blocked before app tests by existing test environment issue: `indexedDB is not defined` from `notificationStore.ts`.
