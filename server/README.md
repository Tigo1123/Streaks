# Streaks API foundation

This is a separate Express/PostgreSQL API. The static PWA uses its account routes and authenticated challenge, completion, note, preference, backup, and synchronization routes. The app remains local-first, and its offline workflows continue to use browser storage.

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
| `POST /api/auth/register` | No | `{ "email":"user@example.com", "password":"at-least-8-characters", "displayName":"Optional name" }` | `201 {"user":{"id":"…","email":"…","displayName":null,"timezone":null,"createdAt":"…"},"time":{…}}` |
| `POST /api/auth/login` | No | Same fields as registration | `200 {"token":"…","refreshToken":"…","user":{…},"time":{…}}`; 30-minute JWT contains only subject and standard time claims |
| `POST /api/auth/google` | No | `{ "credential":"Google ID token", "password":"optional for linking an existing email account" }` | Same token/user/time shape as password login; `409 GOOGLE_PASSWORD_CONFIRMATION_REQUIRED` asks for the existing account password before linking |
| `POST /api/auth/refresh` | No | `{ "refreshToken":"…" }` | `200 {"token":"…","refreshToken":"…","user":{…},"time":{…}}`; consumes the presented token and rotates it, with a 30-day sliding expiry |
| `POST /api/auth/logout` | No | `{ "refreshToken":"…" }` | `204`; revokes the refresh-token family |
| `GET /api/auth/me` | Yes | — | `200 {"user":{"id":"…","email":"…","displayName":null,"timezone":null,"createdAt":"…"},"time":{…}}` |
| `PATCH /api/auth/profile` | Yes | `{ "displayName":"A name from 1 to 50 characters" }` | `200 {"user":{…}}`; trims whitespace and rejects control characters |

The `time` object includes `today`, `serverNow`, and `nextMidnightAt`, with dates calculated using the user's IANA time zone. A null stored time zone uses UTC until the client sets its browser-detected zone.

The frontend stores its access token, refresh token, and minimal user identity in a dedicated `localStorage` entry so the account survives tab closure and browser restarts. On `/me` returning 401, the frontend attempts one refresh and retries `/me`; only a rejected refresh clears the local session. Requests time out after 90 seconds to allow a sleeping Render service to wake. Network failures, timeouts, and 5xx responses preserve the saved session and trigger a retry with exponential backoff (up to 30 seconds), with a manual retry available in the account panel. The server stores only SHA-256 hashes of refresh tokens; each successful refresh invalidates its predecessor, token reuse revokes the family, and logout revokes the family. Refresh is serialized across same-origin tabs when the browser supports the Web Locks API. Browser storage is readable by page scripts, unlike a backend-set HttpOnly cookie; use HTTPS and protect the static frontend against script injection. Logout never clears the PWA's `streaks-data` localStorage value.

Migrations `005_auth_refresh_sessions.sql` and `006_google_auth.sql` create refresh sessions and add Google identity and nullable `display_name` support; both are applied by `npm run migrate`. Run `cd server && npm run migrate` before deploying the corresponding API versions; profile updates reuse the `display_name` column, so this change adds no migration.

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

Completion dates must be real dates within the challenge's configured date range and cannot be later than tomorrow in the user's time zone. This one-day allowance supports syncing around midnight; stored completions are not rejected merely because their date is now in the future. The database unique constraint prevents duplicate completion dates even under concurrent requests.

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

`language` (`en` or `ar`) and `timezone` (a valid IANA name or `null`) are accepted. The time zone is stored on the user row; the GET route creates the default preferences row if it is missing. Both routes return the current server `time` object.

| Method and path | Request | Success | Common errors |
| --- | --- | --- | --- |
| `GET /api/preferences` | — | `200 {"preferences":{"language":"en","timezone":null},"time":{…}}` | `401` |
| `PATCH /api/preferences` | `{ "timezone":"Africa/Khartoum" }`, language, or both | `200 {"preferences":{"language":"en","timezone":"Africa/Khartoum"},"time":{…}}` | `400` invalid/unknown fields, `401` |

`GET /api/sync` also includes `preferences.timezone` and the same `time` object, so clients can use one server-authoritative date for validation and display.

Other relevant statuses are `201 Created`, `204 No Content`, and `409 Conflict`. Server/database details are not included in API error responses.

The frontend API base URL is configured once using the `streaks-api-base-url` meta tag in the root `index.html`. An empty value uses `http://localhost:10000` on local hosts and the current origin otherwise. For a separately hosted Render API, set this meta tag to the API's public HTTPS origin (without `/api`) before publishing the static site, and include the static site's exact origin in backend `CORS_ORIGIN`. The URL is public configuration and must not contain credentials or secrets.

Authentication rate limits are 20 failed login attempts per IP per 15 minutes (successful logins do not count) and 5 registration attempts per IP per hour. The API sets Express `trust proxy` to `1` for Render's single reverse-proxy hop; keep this aligned with the production proxy topology.

The one-way **Back up to Cloud** action includes supported local challenge fields, completion dates, notes, and language. It validates the raw local dataset, shows counts before confirmation, scopes retry metadata to the authenticated account in a separate browser-storage key, and reports partial failures. Challenges use server-enforced per-user `migrationKey` values; duplicate completions return `409` and are treated by the client as already present. Notes and preferences use the existing upsert/patch behavior. The local dataset is never deleted or replaced.

Cloud synchronization is available from the account panel. The server remains authoritative for the account time zone; the client's detected zone is submitted before the first sync when no server value exists.

## Database and migrations

`npm run migrate` applies numbered SQL files once, recording successful migrations in `schema_migrations`. Each migration and its record are committed in one transaction. Migration `004` adds nullable `users.timezone` without changing existing user data. The schema uses UUIDs, cascading ownership, unique completion dates, one note per challenge, normalized unique emails, `updated_at` triggers, and a partial unique index for per-user challenge migration keys.

Keep `DATABASE_URL` secret. For a Render-hosted API in the same region as its database, use Render's internal database URL. For Supabase, obtain the CA certificate from its official SSL configuration guidance. The API enforces TLS and certificate/hostname verification. It first uses the optional `DATABASE_CA_CERT` environment variable, then `server/certs/supabase-ca.crt` if present; with neither configured, Node's default trusted CA store is used. The connection pool ignores URL `ssl`/`sslmode` overrides. Never disable certificate verification to work around certificate errors.

## Tests

```bash
npm test
```

The health and timezone helper tests do not require a database. Auth, schema, and two-account data API integration tests require `TEST_DATABASE_URL` pointing to a dedicated PostgreSQL database with `test` in its database name, such as `streaks_test`. The tests migrate and clear that database's `users` table (with cascading deletes), so never point it at a development or production database. Without `TEST_DATABASE_URL`, those integration checks are reported as skipped.

## Render preparation

The backend is ready to be configured later as a Render Web Service without changing the current frontend Static Site:

```text
Service Type: Web Service
Root Directory: server
Build Command: npm install
Start Command: npm start
```

Set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, and `NODE_ENV=production` as service environment variables. For Google sign-in, also set `GOOGLE_CLIENT_ID` to the public OAuth web client ID; it is optional, and Google sign-in returns `503` while it is unset without preventing the API from starting. Configure the same client ID as `VITE_GOOGLE_CLIENT_ID` in the frontend build environment. Add the exact static-site origin (including `https://streaks-p6f7.onrender.com`) to the comma-separated `CORS_ORIGIN` allow-list. Migration `006_google_auth.sql` adds Google identity support while preserving existing password accounts. Use a persistent PostgreSQL plan appropriate for the expected retention; this repository does not assume a particular pricing tier. No deployment or database resource is created by this phase.
