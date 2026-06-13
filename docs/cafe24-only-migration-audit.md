# Cafe24-Only Audit

Updated: 2026-06-13

## Policy

- Production runtime must use Cafe24 only.
- Legacy external platform dependencies are retired.
- Active runtime config, SDK imports, deployment assumptions, and ingestion rules must stay Cafe24-only.

## Current State

- Frontend data access routes through `src/lib/cafe24DataCompat.ts`.
- `src/lib/cafe24Client.ts` exports the active Cafe24 compat client.
- Cafe24 server endpoints are active under `server/cafe24/*`.

## Changes Applied

- Removed retired platform environment keys from local env files.
- Retired `scripts/ingestion/cleanup-past-collected.mjs` into a Cafe24-only no-op stub.
- Retired legacy cleanup usage in `/Users/inteyeo/scripts/run-ingestion.sh`.
- Added `scripts/audit-cafe24-only.mjs` to detect banned legacy runtime references.

## Remaining Work

- Continue semantic cleanup of old compatibility wording where it does not add value.
- Audit image upload, auth, realtime, and RPC compatibility coverage in `src/lib/cafe24DataCompat.ts`.
- Keep the Cafe24-only audit in regular verification so legacy references do not re-enter active runtime code.
