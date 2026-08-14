# Publish the frontend version marker after server health

- Date: 2026-08-14
- Status: Accepted

## Context

The production host runs a single Node process behind Apache. A server-side deployment stops that process for roughly three to four seconds. The previous deploy order copied the new `version.json` and service worker into the live directory before restarting Node. Always-on clients could therefore detect the new build, schedule a page reload, and navigate during the restart gap. A kiosk that received Apache's `503 Service Unavailable` document then remained on that browser page because the application JavaScript was no longer running.

## Decision

Use a version-last frontend release contract:

1. Upload immutable hashed assets first and retain old assets.
2. Copy ordinary public files while keeping the live `index.html`, `service-worker.js`, and `version.json` unchanged.
3. Stage those three entry files outside the live `dist` directory.
4. Deploy server files, restart the Node service when required, and wait for the internal health check.
5. Prepare all three entry files in the live filesystem, then atomically rename `index.html`, `service-worker.js`, and finally `version.json` into place.

Publishing `version.json` last means clients cannot observe the new build until the backend and all frontend entry files are ready. The kiosk page watchdog remains a secondary recovery layer for unrelated browser or network failures.

Server functions, server source files, and package manifests are compared with rsync checksums before deciding whether a restart is required. A clean deployment worktree can have different checkout timestamps even when file contents are identical; timestamp-only drift must not restart the single Node process.

## Consequences

- Existing clients keep rendering the old application during the short single-process restart instead of intentionally navigating into it.
- Frontend-only deployments do not restart Node merely because checkout timestamps differ.
- A deployment that fails before server health leaves the old frontend version marker live.
- This removes the observed update/reload race but does not make API requests zero-downtime. Full API zero-downtime would require a dual-process or blue-green server topology.
