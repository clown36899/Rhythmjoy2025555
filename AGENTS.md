# Codex Project Instructions

## Deployment Workflow

When the user asks to deploy this project, treat the request as including the full publish workflow:

1. Inspect the working tree and identify the deployment target.
2. Build and deploy using the repository's configured deployment command.
3. Verify the deployed site or service with the available health/version checks.
4. Commit all relevant tracked and untracked project changes with a clear message.
5. Push the commit to the active upstream branch.
6. Report the deployment result, commit hash, push target, and verification outcome.

Do not require the user to separately say "commit" or "push" after asking for a deployment. If there is a risky ambiguity, such as unrelated secrets, destructive changes, or an unclear branch target, pause and ask before committing or pushing.

## Project Record Keeping

For non-trivial work, leave a concise project record in Git-tracked documentation:

1. Update `docs/ISSUE_LOG.md` when the work involved a bug, incident, operational problem, investigation, rollback, or meaningful follow-up.
2. Add a decision note under `docs/decisions/` when the work changes architecture, deployment policy, data ownership, automation boundaries, or long-term operating rules.
3. Keep records factual: date, status, context, root cause if known, resolution, verification, and related files or commits.
4. Do not record secrets, passwords, private keys, cookies, or production tokens. Refer to secret storage locations only at a high level.
5. `CHANGELOG.md` remains for user-facing version changes; detailed troubleshooting and rationale belong in `docs/ISSUE_LOG.md` or `docs/decisions/`.

## Notification Time Information Policy

The site notification channels do not provide time information. Do not show or include event start times, notification sent times, or notification received times in the in-app notification inbox, Web Push title/body, or notification preview data. Dates and locations may still be shown. Timestamps may be retained internally only for sorting, expiry, delivery, and read-state processing.
## Calendar Event Visibility Policy

The month calendar must render every event for each date directly in its date cell. Do not cap the number of visible events and do not add a `+N more` or equivalent collapsed-event control.

## Event Time Information Policy

Event registration, editing, and details must not expose separate start/end time inputs, time rows, or “time undecided” placeholders. Dates remain allowed. Time announcements may appear verbatim in free-text descriptions and source posters/images; never strip or rewrite these times. Preserve stored legacy time fields for compatibility, and do not extract standalone time information from descriptions.

## Social Ingestion Conflict Review

If automatic ingestion would publish a second social at the same venue on the same date, hold the candidate in the existing pending review state and record the conflict in auto_registration.reasons. A different or missing extracted DJ is not sufficient evidence to create another public event. Preserve strict confirmed-duplicate detection, same-event updates, administrator-reviewed manual registration, and replacement of generated regular-social placeholders. Recheck conflicts under the existing event mutation lock immediately before writing. Do not merge or delete events merely because their date and venue match; review original evidence first.
