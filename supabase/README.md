# Community features

For the incremental feature release, follow [COMMUNITY_SETUP.md](COMMUNITY_SETUP.md). Apply its new migration before deploying the updated API.

# Supabase setup

The Vue app now calls Supabase Auth, a `pacemate` Edge Function, and Supabase Storage. Netlify is optional static hosting only. The Netlify migration files are retained as historical source; do not run them against Supabase separately.

## 1. Frontend

`.env.local` already contains the project URL and publishable key supplied for this project. Restart Vite after changing environment variables:

```sh
npm ci
npm run dev
```

Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the optional `VITE_API_URL` belong in the browser. Never put a service-role key or database password in a `VITE_` variable.

## 2. Database

In project `hgnxappuulufvdymodad`, open **SQL Editor** and execute the entire file:

`supabase/migrations/20261107000000_pacemate.sql`

Run this once on an empty app database. It creates tables, worldwide weekly events, RLS, Auth deletion triggers, and the `photos` bucket in a transaction. It does not import existing Netlify users, passwords, photos, or application data. The `profiles` table uses Supabase Auth IDs; old Identity accounts are not automatically transferable.

All app tables deny direct reads/writes by `anon` and `authenticated`. The Edge Function validates users and enforces ownership before using a server-only database connection. There are intentionally no browser-facing policies exposing private profiles or wellness records. Do not disable RLS to resolve client errors.

## 3. Backend secrets

Under **Connect**, copy the transaction pooler Postgres URI, insert the database password using the URI's required percent encoding, and set it as an Edge Function secret named:

`PACEMATE_DATABASE_URL`

The connection must use a trusted database role able to access the app tables. The default Supabase `postgres` connection is suitable for initial setup. The API uses a maximum of one pooled connection per worker, TLS, and disables prepared statements.

Hosted Supabase functions automatically receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is used only inside the backend for verified Auth lookups, photo storage, and account deletion. Do not paste it into this repository or the browser.

Optionally set `PACEMATE_ALLOWED_ORIGINS` to comma-separated exact origins. Defaults allow `http://localhost:5173`, `http://127.0.0.1:5173`, and `https://pacematess.netlify.app`. If Vite selects another port, either free 5173 or explicitly add that origin.

## 4. Deploy the API

From the project directory:

```sh
npm run backend:build
npx --yes supabase@2.39.2 login
npx --yes supabase@2.39.2 functions deploy pacemate --project-ref hgnxappuulufvdymodad --use-api
```

The function deploys the generated `_bundle/index.js`, which tree-shakes Drizzle locally to reduce runtime module initialization. Re-run `npm run backend:build` after changing backend source and before redeploying. Version 2.39.2 is used here because the current CLI binary does not run on this project owner's macOS Big Sur machine.

The checked-in function configuration disables the gateway's blanket JWT check so public stats/events and preflight requests can work. Every private handler independently validates the bearer token through Supabase Auth; browser-supplied user IDs are never trusted.

The frontend defaults to:

`https://hgnxappuulufvdymodad.supabase.co/functions/v1/pacemate/api/...`

## 5. Auth settings

In **Authentication → URL Configuration**, add:

- `http://localhost:5173/`
- `http://localhost:5173/reset-password`
- Equivalent production URLs before deploying the frontend.

Set the Site URL to the current testing or production origin. Email/password signup must be enabled. Email confirmation is supported; use a real test inbox. Configure SMTP and sender identity for launch; `trypacemate@gmail.com` is the app's support contact, not an automatically configured mail transport.

Google and GitHub buttons appear only when those providers are enabled in Supabase. Configure their credentials in the Supabase dashboard. Supabase email confirmation/recovery links must redirect back to the app with the standard Auth callback tokens; do not replace templates with links that omit the callback flow.

## Runtime diagnosis

Open `/functions/v1/pacemate/api/health` on the Supabase project domain. The current bundle returns `status: "ok"`, `version: "stats-3"`, and `databaseConfigured: true` when the secret exists. This endpoint does not connect to the database and does not prove the credentials are valid.

Open `/functions/v1/pacemate/api/health?database=1` to run a bounded `SELECT 1` connection probe, then `/functions/v1/pacemate/api/stats` to query application tables. The probe reports only connection type/port and sanitized error codes, never credentials. Stats uses one fixed, schema-qualified SQL query rather than parallel ORM queries. Stats and probe operations have a 12-second deadline; a stalled pool is closed and recreated on the next request. The driver disables automatic custom-type catalog discovery; Drizzle maps the app's schema types explicitly. In the function logs, `handler loading`, `handler loaded`, and `handler finished` locate the failing stage. For `WORKER_RESOURCE_LIMIT`, inspect the shutdown log to distinguish CPU from memory exhaustion. The bundle is a mitigation for avoidable startup overhead; deployment must be retested to establish whether it resolves a specific resource failure.

## 6. Smoke test

1. Open the frontend and verify events load. A successful empty response differs from a deployment/connection error; check the Network tab if needed.
2. Create a test account, confirm its email, and finish onboarding.
3. Upload/reorder/save photos, reload, and verify the profile persists.
4. Log a workout and check-in; refresh and verify private data persists.
5. Use a second test account to exercise discovery, mutual likes, chat, blocking, and session RSVPs.
6. Verify another member cannot read messages from an unrelated match or delete someone else's workout/photo.
7. Delete a disposable account; verify the Auth user, profile and cascaded records are removed. Reports intentionally remain. Cached public photos cannot be revoked retroactively.

The prior QA report still applies except where explicitly addressed by migration changes. This migration is not a sign-off for production, a moderation implementation, or an import of existing data.

## Optional: entirely local Supabase

Requires Docker and the Supabase CLI:

```sh
npx supabase start
npx supabase db reset
```

Use the local URL and public key printed by `supabase status` in `.env.local`, set `VITE_API_URL=http://127.0.0.1:54321/functions/v1/pacemate`, and configure local Edge Function secrets. The current Postgres adapter requires TLS for the hosted pooler; for local database testing use the adapter's explicit local mode described below.

Create an ignored `supabase/.env.local` containing:

```env
PACEMATE_DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres
PACEMATE_LOCAL_DATABASE=true
PACEMATE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Then:

```sh
npx supabase functions serve pacemate --env-file supabase/.env.local
```

Local CLI startup supplies the local Auth and service-role settings. Only enable `PACEMATE_LOCAL_DATABASE` for the Docker development database; never set it for a hosted function.

## Verification commands

```sh
npm test
npm run build
npm run backend:check  # requires Deno installed
```

Tests cover Auth HTTP requests, token refresh concurrency, callbacks, error handling, API route matching, and CORS. Live email delivery, deployed functions and actual Supabase service integration require the dashboard setup above.

## Phase 1 Foundation draft

`migrations/20261107040000_phase1_foundation.sql` is an incremental, rerunnable draft after the base and community migrations. It has not been executed as part of the Phase 1 rework. It guards columns, constraints and triggers, seeds sports with conflict handling, and preserves existing selections on reruns. New sports tables deny browser roles all access and have RLS enabled with no browser policies. Profile validation and legacy sports synchronization use private trigger functions; there are no Foundation RPCs.

The existing `pacemate` Edge Function handles these authenticated routes:

- `GET /api/foundation/sports`: sport catalog.
- `GET /api/foundation`: owner's Foundation profile, including their birthdate.
- `PUT /api/foundation`: validated, adult-only owner save, including multiple connection modes and sport experience/intensity.
- `GET /api/foundation/members/:id`: eligible member's public Foundation profile, with age and no birthdate or contact fields.

Discovery and likes share one eligibility predicate. Members must share a connection mode. When both enable dating, reciprocal gender, interested-in and age preferences also apply, including when they share other modes. For pairs without shared dating, these preferences do not filter friendship or training connections. Blocking, suspension and target pause restrictions remain enforced. Discovery returns `compatibility` with score, reasons and factor breakdown computed server-side using the unchanged compatibility module and real profile data. Scores are never stored. Optional discovery search filters and prior-swipe exclusion narrow the discovery list; they are not additional like authorization requirements. Changes to availability, preferences or blocking after discovery can make a formerly shown profile unavailable.

The historical `PHASE1_REVIEW.md` describes the original draft, before this rework. No hosted validation or SQL execution is implied by local JavaScript tests. Regenerate the backend bundle through the existing build workflow before any later, separately authorized deployment.


## Optional onboarding location permission

`POST /api/location` requires a verified bearer token, including for a member who has not completed onboarding. It accepts finite latitude/longitude values, applies a per-user rate limit, and returns the nearest known city within 100 km or `city: null`. It reads the existing community migration's `city_coordinates` table. No coordinate storage, browser table grants, new migration or external reverse-geocoding provider is introduced. Onboarding and Discover filters request browser permission only after **Use my location**, send rounded coordinates, and keep city entry editable. Discover does not automatically run a search or update the profile. Deploying the updated handler is a separate activation step; it was not deployed during this work.
