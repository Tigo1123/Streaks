# Streaks API foundation

This is a separate Express/PostgreSQL API. The static PWA calls only the account routes for registration, login, and session validation. Its challenge, completion, note, preference, reminder, import/export, and offline workflows continue to use their existing localStorage behavior; the frontend does not call the cloud data routes yet.

## Requirements

- Node.js 22 or newer
- PostgreSQL 13 or newer

## Run locally

Create a PostgreSQL database named `streaks`, then:

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` with the local `DATABASE_URL` and generate a unique JWT secret with at least 32 random bytes. Do not commit `.env`.

Run the database migrations and start the API:

```bash
npm run migrate
npm run dev
```

The API listens at `http://localhost:10000` by default (`PORT` overrides this). `GET /api/health` returns `{"status":"ok"}`. For local frontend development, serve the static app from an origin listed in `CORS_ORIGIN`; the example allows ports 8080 and 5500 on localhost and 127.0.0.1. With the API URL meta tag left empty, the frontend routes requests made from port 8080 to the same host on port 10000. Opening `index.html` directly is not a CORS-enabled HTTP origin.

## API routes

The API returns JSON and uses `{"error":"..."}` for errors. All routes below the data API require:

```http
Authorization: Bearer <JWT>
```

Ownership is always derived from the verified JWT; clients must not send a user ID. A missing or invalid token returns `401`. Data owned by another account is indistinguishable from a missing resource and returns `404`.

### Public and authentication routes

| Method and path | Authentication | Request | Success |
| --- | --- | --- | --- |
| `GET /api/health` | No | — | `200 {"status":"ok"}` |
| `POST /api/auth/register` | No | `{ "email":"user@example.com", "password":"at-least-8-characters" }` | `201 {"user":{"id":"…","email":"…","createdAt":"…"}}` |
| `POST /api/auth/login` | No | Same fields as registration | `200 {"token":"…","user":{…}}`; one-hour JWT contains only subject and standard time claims |
| `GET /api/auth/me` | Yes | — | `200 {"user":{"id":"…","email":"…","createdAt":"…"}}` |

The frontend keeps the one-hour JWT in a dedicated `sessionStorage` entry so a page refresh in the same tab can restore the account with `/api/auth/me`. The token is removed on logout or when `/me` confirms it is invalid. If `/me` cannot reach the server, the token is retained for retry while local Streaks stays usable. Browser storage is readable by page scripts, unlike a backend-set HttpOnly cookie; use HTTPS and protect the static frontend against script injection. Logout never clears the PWA's `streaks-data` localStorage value.

### Challenges

Challenge `title` is trimmed and limited to 160 characters, `description` is optional/null and limited to 2,000 characters, `duration` is an integer from 1–365, and `startDate` is a real `YYYY-MM-DD` date. PATCH accepts any non-empty subset of mutable fields. It rejects ownership/ID fields. Changing the date range is rejected with `409` if it would make stored completions invalid.

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `GET /api/challenges` | — | `200 {"challenges":[{"id":"…","title":"…","description":null,"duration":30,"startDate":"2026-10-02","createdAt":"…","updatedAt":"…"}]}` | `401` |
| `POST /api/challenges` | `{ "title":"Workout", "description":"Exercise daily", "duration":30, "startDate":"2026-10-02" }` | `201 {"challenge":{…}}` | `400` invalid fields, `401` |

The challenge create endpoint also accepts an optional UUID `migrationKey` for explicit local-data backup. It is unique per authenticated user. The first request creates a challenge and returns `201`; retries with the same key return the existing challenge as `200`, without changing it or creating a duplicate. The key is not an ownership field, and user ownership continues to come only from the JWT. Normal challenge creation can omit this field.
| `GET /api/challenges/:id` | — | `200 {"challenge":{…}}` | `404` missing/other owner, `401` |
| `PATCH /api/challenges/:id` | e.g. `{ "title":"Morning workout" }` | `200 {"challenge":{…}}` | `400` invalid fields, `404` missing/other owner, `409` existing completions conflict |
| `DELETE /api/challenges/:id` | — | `204` | `404` missing/other owner, `401` |

### Completions

Completion dates must be real dates within the challenge's configured date range and cannot be later than the API server's current UTC date. The database unique constraint prevents duplicate completion dates even under concurrent requests.

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `GET /api/challenges/:id/completions` | — | `200 {"completions":[{"id":"…","completionDate":"2026-10-02","completedAt":"…","createdAt":"…","updatedAt":"…"}]}` (ascending date) | `404` missing/other owner, `401` |
| `POST /api/challenges/:id/completions` | `{ "completionDate":"2026-10-02" }` | `201 {"completion":{…}}` | `400` invalid/out-of-range/future date, `404` missing/other owner, `409` duplicate |
| `DELETE /api/challenges/:id/completions/:date` | — | `204` | `400` invalid date, `404` missing/other owner/completion, `401` |

### Notes

There is at most one note per challenge. Content is limited to 1,000 characters to match the current app UI; `PUT` creates or replaces the existing note.

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `GET /api/challenges/:id/notes` | — | `200 {"note":null}` or `200 {"note":{"id":"…","content":"…","createdAt":"…","updatedAt":"…"}}` | `404` missing/other owner, `401` |
| `PUT /api/challenges/:id/notes` | `{ "content":"My progress is improving." }` | `200 {"note":{…}}` | `400` invalid content, `404` missing/other owner, `401` |
| `DELETE /api/challenges/:id/notes` | — | `204` (idempotent for an existing owned challenge) | `404` missing/other owner, `401` |

### Preferences

Only `language` (`en` or `ar`) and `remindersEnabled` (boolean) are accepted. The GET route creates the default row if it is missing.

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `GET /api/preferences` | — | `200 {"preferences":{"language":"en","remindersEnabled":false}}` | `401` |
| `PATCH /api/preferences` | `{ "language":"ar" }`, `{ "remindersEnabled":true }`, or both | `200 {"preferences":{"language":"ar","remindersEnabled":true}}` | `400` invalid/unknown fields, `401` |

Other relevant statuses are `201 Created`, `204 No Content`, and `409 Conflict`. Server/database details are not included in API error responses.

The frontend API base URL is configured once using the `streaks-api-base-url` meta tag in the root `index.html`. An empty value uses `http://localhost:10000` on local hosts and the current origin otherwise. For a separately hosted Render API, set this meta tag to the API's public HTTPS origin (without `/api`) before publishing the static site, and include the static site's exact origin in backend `CORS_ORIGIN`. The URL is public configuration and must not contain credentials or secrets.

The frontend uses the auth routes and the existing challenge, completion, note, and preference routes only after the user explicitly confirms **Back up to Cloud**. The one-way backup includes supported local challenge fields, completion dates, notes, language, and reminders enabled. Local challenge IDs/created timestamps and reminder last-fire dates have no equivalent cloud field and remain local. It validates the raw local dataset, shows counts before confirmation, scopes retry metadata to the authenticated account in a separate browser-storage key, and reports partial failures. Challenges use server-enforced per-user `migrationKey` values; duplicate completions return `409` and are treated by the client as already present. Notes and preferences use the existing upsert/patch behavior. The local dataset is never deleted or replaced.

This backup does not load cloud data into the app and does not enable ongoing synchronization, conflict resolution, or an offline sync queue. **Phase 3C — Synchronization** remains future work.

## Database and migrations

`npm run migrate` applies numbered SQL files once, recording successful migrations in `schema_migrations`. Each migration and its record are committed in one transaction. The schema uses UUIDs, cascading ownership, unique completion dates, one note per challenge, normalized unique emails, `updated_at` triggers, and a partial unique index for per-user challenge migration keys.

Keep `DATABASE_URL` secret. For a Render-hosted API in the same region as its database, use Render's internal database URL. For external PostgreSQL connections, use the provider's TLS-enabled URL (Render external URLs require TLS, commonly expressed with `sslmode=require`). The `pg` driver reads connection/TLS options from that URL; this project does not disable certificate checks globally.

## Tests

```bash
npm test
```

The health route test does not require a database. Auth, schema, and two-account data API integration tests require `TEST_DATABASE_URL` pointing to a dedicated PostgreSQL database with `test` in its database name, such as `streaks_test`. The tests migrate and clear that database's `users` table (with cascading deletes), so never point it at a development or production database. Without `TEST_DATABASE_URL`, those integration checks are reported as skipped. No request rate limiter is included yet; add one to registration and login before exposing authentication to unrestricted public traffic.

## Render preparation

The backend is ready to be configured later as a Render Web Service without changing the current frontend Static Site:

```text
Service Type: Web Service
Root Directory: server
Build Command: npm install
Start Command: npm start
```

Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `NODE_ENV=production` as service environment variables. Use a persistent PostgreSQL plan appropriate for the expected retention; this repository does not assume a particular pricing tier. No deployment or database resource is created by this phase.
