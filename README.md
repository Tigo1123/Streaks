# Streaks

A minimal, offline challenge tracker that stores your challenges in this browser.

## Run

Use Node.js 22 or newer, then run `npm install` and `npm run dev`. The Vite development server does not register the production Service Worker.

## Deploy on Render

Create a **Static Site** using this repository with these settings:

- Build Command: `npm run build`
- Publish Directory: `dist`

Add a Rewrite rule so client-side navigation paths return the SPA entry point:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | `Rewrite` (HTTP `200`) |

Your data stays in localStorage on each device and browser.

## Time zones and date trust

Each account stores an IANA time zone. When the account service is reachable, the app uses the server's current time converted to that zone; without an account or while offline, it converts the device clock to the selected zone. Local-only completion data is not protected against someone changing the device clock. When syncing, the server rejects newly submitted completions later than tomorrow in the account's time zone; existing completions are not rejected solely because their date is now in the future.

## Accounts and local data

Streaks has an optional account interface for registration, email/password login, Google sign-in, session checks, and logout. Google sign-in uses the public `VITE_GOOGLE_CLIENT_ID` frontend build variable; copy `.env.example` to `.env.local` for local builds. The account API uses the independent Express/PostgreSQL backend in [`server/`](server/README.md). Challenge data, notes, completions, reminders, language, Import/Export, and offline operation remain local to this browser. Logging out only clears the account session; it does not alter local Streaks data.

### Configure the API URL

The frontend uses one API base URL setting: the `streaks-api-base-url` meta tag in `index.html`. Leave its content empty for local development: a page served from `localhost` or `127.0.0.1` uses `http://<same-host>:10000`, and a frontend served on port `8080` also targets port `10000` on the same host. The Express backend defaults to port `10000` (`PORT` can override it). Serve the page over HTTP for account requests (for example, `python3 -m http.server 8080` from the project root); browsers restrict API calls from a `file://` page. On a production static deployment where the API is a separate service, set the tag's content to the API's public HTTPS origin, for example `https://your-streaks-api.onrender.com` (origin only, with no `/api` suffix), before deploying the static site. The API origin is public configuration, not a secret.

Set the backend `CORS_ORIGIN` to the exact local frontend origin during development and the exact Render Static Site origin in production. Google sign-in additionally requires `GOOGLE_CLIENT_ID` on the backend and `VITE_GOOGLE_CLIENT_ID` during the frontend build. See [`server/README.md`](server/README.md) for backend configuration and routes.

The access token, rotating refresh token, and minimal account identity are stored in a dedicated `localStorage` entry, separate from the `streaks-data` local challenge record. Access tokens expire after 30 minutes; refresh tokens rotate and expire after 30 days of inactivity. A confirmed invalid/expired refresh token or explicit logout clears the local account session. Network errors, timeouts, and server errors retain it for retry. Browser JavaScript storage cannot provide the protection of a backend-set HttpOnly cookie, so a same-origin script injection could access these tokens; keep the page's scripts trusted and the deployment HTTPS-only. The API stores only hashes of refresh tokens and revokes a token family on logout or detected token reuse.

The API schema includes the `auth_refresh_sessions` table. Apply pending database migrations with `cd server && npm run migrate` before deploying backend changes. Local Streaks data and its schema are unchanged.

### Manual cloud backup

An authenticated account can explicitly choose **Back up to Cloud** from its account panel. Streaks validates the local dataset and displays challenge, completion, and note counts before requiring confirmation. The backup includes challenge title, duration, start date, completed dates, notes, language, and the reminder enabled setting. Local challenge IDs and created timestamps have no cloud equivalent; challenge IDs are mapped in separate retry metadata, and local created timestamps and reminder dates remain on this device.

#### Local → cloud field mapping

| Local field | Cloud field/handling |
| --- | --- |
| `challenges[].id` | Stored only in the local retry map alongside its cloud challenge UUID; never sent as cloud ownership |
| `challenges[].name` | `challenges.title` |
| `challenges[].durationDays` | `challenges.duration` |
| `challenges[].startDate` | `challenges.startDate` |
| `challenges[].completedDays[]` | Each 1-based day offset becomes `completions.completionDate = startDate + offset - 1` |
| `challenges[].note` | `notes.content`, preserving its text |
| `challenges[].createdAt` | No cloud equivalent; remains local. Cloud creation timestamps are generated by the server. |
| `language` | `preferences.language` |
| `reminders.enabled` | `preferences.remindersEnabled` |
| `reminders.lastReminderDate` | No cloud equivalent; remains local. |
| `version`, local IDs, other local metadata | Not uploaded; remain in `streaks-data`. |

The upload is one-way and manual. It never clears or modifies `streaks-data`, replaces local IDs, loads cloud challenges into the app, or enables synchronization. A separate `streaks-cloud-migration-v1` localStorage key stores account-scoped retry metadata (migration keys, cloud ID mappings, and attempt/completion timestamps; no credentials). Stable server-enforced migration keys reuse the same cloud challenge on retries. Completion duplicates are treated as already uploaded, and notes/preferences are safely upserted. A failed or interrupted backup can be retried from the account panel; partial results are reported and local data remains intact.

If there are no local challenges, Streaks reports that there is nothing to migrate and makes no cloud request. A backup completion means only that the explicit upload finished; it does not mean data is continuously synchronized. No automatic upload, cloud loading, conflict handling, or offline sync queue exists.

### Cloud synchronization (Phase 3C)

Streaks includes manual two-way cloud synchronization for authenticated accounts:

- **Manual trigger:** Cloud sync is initiated on demand from the Account panel. It remains explicit, predictable, and fully operable offline.
- **Sync Model:**
  - Local-only challenge → uploaded to cloud.
  - Cloud-only challenge → downloaded to local device.
  - Local + cloud unchanged → no redundant network writes.
  - Local edits → uploaded using conditional timestamps (`If-Match`).
  - Cloud edits → merged and downloaded to local storage.
  - Two-way conflict → explicit modal prompt displaying local and cloud values, allowing the user to choose "Keep Local" or "Keep Cloud".
  - Cloud challenge deleted while local unchanged → deleted locally.
  - Local challenge deleted while cloud unchanged → deleted in cloud.
  - Deletions are tracked via user-scoped durable tombstones (`sync_tombstones`) to prevent stale resurrection.
  - Completion additions and removals are synchronized across devices.
  - Notes and user preferences (language, reminders enabled) are synchronized. The account's time zone remains server-authoritative.
- **Account-scoped metadata:** Stored under a separate `streaks-cloud-sync-v1` `localStorage` key. The core `streaks-data` schema remains untouched.
- **Safety & Idempotency:** Re-reads `streaks-data` before applying cloud changes to detect concurrent local edits. Running sync multiple times with no modifications produces no writes. Partial network failures preserve successful operations and allow safe retry.


## Install on a phone

Streaks can be added to your phone's Home Screen and works offline after it has loaded once.
On Android/Chrome, use the browser's **Add to Home screen** or **Install app** option.
No app store installation is required.

### Test offline behavior manually

1. Serve a production build over HTTPS (or localhost) and open the app while online.
2. In browser DevTools, open **Application → Service Workers** and confirm the worker is activated and controlling the page.
3. Open **Network**, enable **Offline**, then reload. The app shell and its hashed Vite JavaScript/CSS assets should still load.
4. While offline, confirm the browser reports API requests as unavailable; API requests are deliberately never cached.
5. Disable **Offline**, deploy a new build, reload, and check that the new worker activates and the previous `streaks-shell-*` cache is removed.
