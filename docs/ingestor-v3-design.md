# Ingestor V3 Design

## Purpose

Ingestor V3 is a reliability rebuild for the collection and review system. Its job is to make collected candidates trustworthy before a human registers anything to the live site.

This document uses these terms strictly:

- Live event data: rows in `events`. These are the events/classes shown on the actual site.
- Ingestor data: candidate, duplicate, review, and source-health records used by the admin ingestor.
- Automation: scheduled collection, candidate validation, duplicate detection, source-health checks, and audit scripts.

## Non-Negotiable Boundary

Automation must never write to `events`.

Allowed:

- Read `events` for duplicate detection.
- Read `events` for consistency audit reports.
- Write ingestor-only tables such as `ingestion_runs`, `ingestion_candidates`, and `ingestion_source_health`.

Not allowed:

- Automatic insert/update/delete on `events`.
- Automatic image repair on existing `events`.
- Automatic "register" after candidate confidence passes.
- Background reconciliation that mutates live event data.

The only path that may change `events` is an explicit human admin action that registers or edits a live event. That action must be visually distinct from automatic collection.

## Current Problems

The current ingestor stores candidate state inside `generic_records.data_json` under `scraped_events`. That makes state transitions fragile because a same-id candidate save can overwrite the whole JSON document.

Current weak points:

- Candidate status is not protected by a state machine.
- A collected candidate is not durably linked to the live event it became.
- Duplicate detection reads live events but stores only ad hoc `_duplicate` metadata.
- The UI can POST an entire candidate object back to the API for small edits.
- Source access failures are mixed into run logs instead of being tracked as source health.
- Classification is pass/fail-heavy and does not store enough evidence for fast review.

## Target Data Model

### `ingestion_runs`

One row per collection run.

Tracks:

- run profile, such as `swing-daily` or `expanded-ingestion`
- start/end timestamps
- status
- source counts
- candidate counts
- summary JSON

### `ingestion_sources`

One row per source from the collection registry.

Tracks:

- source id
- source type
- scope/genre
- priority
- save policy
- active flag

This table is an operational mirror of the source registry, not the registry's source of truth.

### `ingestion_source_health`

One row per source per run, or the latest health snapshot per source.

Tracks:

- access status
- failure reason
- HTTP/browser/session category
- last successful collection time
- circuit-break status

This separates "Instagram blocked today" from "no events found".

### `ingestion_candidates`

The canonical V3 candidate table.

Tracks:

- deterministic candidate id
- source url
- normalized source url
- event date
- title
- venue fields
- poster fields
- extracted text
- activity and genre classification
- confidence score
- classification reason
- validation errors/warnings
- review status
- duplicate status
- immutable terminal status

This table replaces `scraped_events` as the future ingestor source of truth.

### `ingestion_candidate_event_links`

Links a candidate to a live `events.id` when a human registers it or when duplicate detection finds a likely existing event.

Important: this table stores references to `events`, but does not mutate `events`.

Link types:

- `duplicate_of`: candidate appears to match an existing live event.
- `registered_as`: human registered this candidate as a live event.
- `manual_match`: admin manually linked the candidate to an event.

## Candidate State Machine

Allowed statuses:

- `new`: validated candidate, not reviewed.
- `needs_review`: candidate is plausible but requires human attention.
- `duplicate`: candidate matches live event data or another candidate.
- `excluded`: candidate rejected from ingestor.
- `registered`: human registered candidate to live event data.
- `archived`: old candidate retained for audit.

Blocked transitions:

- `registered -> new`
- `registered -> duplicate`
- `duplicate -> new` without explicit human restore reason
- `excluded -> new` without explicit human restore reason

Automation may move:

- `new -> duplicate`
- `new -> needs_review`
- `new -> excluded` only for deterministic policy violations

Automation may not move:

- anything into `registered`
- anything out of `registered`

## Duplicate Detection

Duplicate detection reads live `events` and candidate tables.

Detection levels:

- exact source URL plus event date
- normalized URL plus event date
- same date plus same venue plus high title similarity
- same date plus near-identical title

The result is stored in `ingestion_candidate_event_links` and candidate review metadata. It does not update `events`.

## Classification

Every candidate stores:

- `activity_type`: `class`, `social`, `event`, or `recruit`
- `dance_scope`: `swing`, `salsa`, `bachata`, `tango`, or `street`
- `dance_genre`
- `confidence_score`
- `classification_reason`
- `needs_review_reason`
- `evidence_json`

Low-confidence candidates should be staged as `needs_review`, not silently discarded unless they violate hard rules.

Examples that should require review:

- broad schedule notices
- membership/pass products
- posts where date context may be payment or application deadline
- extracted title looks like board chrome
- source is session-sensitive and content extraction is partial

## API Shape

Automation endpoints:

- `POST /api/ingestion/runs`
- `POST /api/ingestion/candidates`
- `POST /api/ingestion/source-health`

These endpoints must not contain any code path that writes to `events`.

Admin review endpoints:

- `GET /api/ingestor-v3/candidates`
- `PATCH /api/ingestor-v3/candidates/:id/review`
- `POST /api/ingestor-v3/candidates/:id/link-duplicate`
- `POST /api/ingestor-v3/candidates/:id/register`

Only the explicit `register` endpoint may create or update a live event, and only from an authenticated admin request initiated by the UI.

## UI Requirements

Tabs:

- New
- Needs Review
- Duplicate
- Registered
- Excluded
- Source Failures

Each candidate card must show:

- source
- source health warning if relevant
- event date
- title and venue
- poster
- activity/genre classification
- confidence score
- validation warnings
- duplicate match reason
- linked live event id if any

The UI must distinguish these actions:

- "Mark reviewed"
- "Exclude candidate"
- "Restore candidate"
- "Link as duplicate"
- "Register to live site"

"Register to live site" is the only action that can affect `events`.

## Migration Plan

Phase 1: Audit only

- Add read-only audit script.
- Create SQL migration file for review only.
- Do not apply DB changes automatically.

Phase 2: Candidate-only V3 storage

- Create V3 ingestor tables.
- Write new candidates to V3 tables.
- Continue leaving `events` untouched by automation.

Phase 3: Parallel review

- Show V3 candidate data beside legacy `scraped_events`.
- Compare counts and duplicate decisions.
- Keep legacy ingestor available as fallback.

Phase 4: Manual registration path

- Move admin registration to V3.
- Registration remains an explicit human action.
- Store `registered_as` link after successful manual registration.

Phase 5: Legacy retirement

- Make legacy `scraped_events` read-only.
- Keep old records for audit until confidence is high.

## Acceptance Criteria

Ingestor V3 is acceptable only when:

- automation cannot write to `events`
- every registered candidate has a durable candidate-to-event link
- duplicate candidates explain the matched live event and reason
- source failures are visible without inspecting terminal logs
- low-confidence candidates are isolated in `needs_review`
- no same-id collection can erase a terminal candidate state
- audit reports can prove candidate/live-event consistency without mutating data
