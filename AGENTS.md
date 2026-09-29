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

어떤 경우에도 사이트에 별도의 시간 정보 입력란이나 시간 섹션을 만들지 않는다. 등록·수정·상세·미리보기 등 모든 화면에 적용하며, 시작/종료 시간 입력, 시간 전용 행·카드, “시간 미정” 표시도 금지한다. 날짜 입력·표시는 허용한다. 시간 안내는 자유 형식 설명에 추가하거나 원본 포스터/이미지 안에 포함할 수 있다. 설명·포스터의 시간을 추출해 별도 시간 필드나 섹션으로 만들지 않는다. 기존 저장된 레거시 시간 필드는 호환성을 위해 보존하되 UI에 다시 노출하지 않는다.

Under no circumstances add a separate time-information input or time section anywhere on the site, including registration, editing, details, and previews. This includes start/end time inputs, dedicated time rows/cards, and “time undecided” placeholders. Dates remain allowed. Time announcements may be added to free-text descriptions or remain verbatim in source posters/images. Never extract these into standalone time fields or sections. Preserve stored legacy time fields for compatibility without exposing them in the UI.

## Social Ingestion Conflict Review

If automatic ingestion would publish a second social at the same venue on the same date, hold the candidate in the existing pending review state and record the conflict in auto_registration.reasons. A different or missing extracted DJ is not sufficient evidence to create another public event. Preserve strict confirmed-duplicate detection, same-event updates, administrator-reviewed manual registration, and replacement of generated regular-social placeholders. Recheck conflicts under the existing event mutation lock immediately before writing. Do not merge or delete events merely because their date and venue match; review original evidence first.

## Ingestion Incident Diagnosis

For ingestion failures or missing retries, follow the existing [ingestion skill](.agents/skills/web-search-ingestion/SKILL.md#장애와-재시도-진단). Compare the affected occurrence with a previous successful candidate and its public event before changing source links, authentication, or retry policy. A latest-run error, saved candidate, source-level incomplete count, and missing notification are not interchangeable evidence of a missing public event. Report observed facts separately from unverified causes. Preserve item/date completion and the existing public-registration, closure, and administrator-deletion protections. See the [2026-09-23 review](docs/decisions/2026-09-23-ingestion-incident-review.md) for the demonstrated failure modes and selected regression boundaries.
