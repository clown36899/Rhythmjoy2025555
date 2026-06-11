# Cafe24 Full Migration

Swing Enjoy Cafe24 deployment is a separate production target from the existing Netlify/Supabase site.

## Principle

- The existing Netlify/Supabase site remains untouched during migration.
- Supabase is used only as a read-only import source until cutover.
- Cafe24 owns the new application database: `swingenjoy_app`.
- Cafe24 owns event CRUD, Kakao login session storage, analytics logs, and uploaded event files.
- The RHythmjoy calendar project and database are separate and must not be modified by this app.

## Runtime

- App directory: `/opt/swingenjoy`
- Node service: `swingenjoy`
- Web entry: Apache proxy to the Node app
- Event API: `/api/events`
- Auth API: `/api/auth/me`, `/api/kakao-login`, `/api/auth/logout`
- Analytics API: `/api/analytics/session`
- Uploads: `/uploads/...`

## Storage

User-uploaded and migrated event images are stored outside the built frontend bundle:

```text
/opt/swingenjoy/uploads
```

The Node app serves this directory at `/uploads`. This keeps uploaded files safe when a new frontend build replaces `dist`.

## Data Import

Events are copied into Cafe24 MySQL with:

```bash
npm run sync:cafe24:events
```

Existing Supabase Storage image URLs are copied to Cafe24 storage and rewritten in the Cafe24 database with:

```bash
npm run migrate:cafe24:event-images
```

Neither script deletes or updates the original Supabase database or storage.

## Cutover Checks

- `/__health` returns `ok: true`.
- `/api/events` returns `backend: cafe24-mysql`.
- `/api/stats/events` and `/api/stats/site` return data from Cafe24.
- `/admin/cafe24-events` can create, update, and delete events after admin login.
- Event image fields in Cafe24 DB no longer point to Supabase Storage.
