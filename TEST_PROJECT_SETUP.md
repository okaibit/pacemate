# Phase 1 test project setup

Use a separate, disposable Supabase project to validate branch `phase1-draft`. This is a manual runbook, not a record of completed setup. Writing this document does not apply SQL, create a project, upload secrets, deploy functions or authorize those actions. The rework passed 116 local tests and a frontend build; PostgreSQL and hosted behavior remain unverified.

## 1. Choose the test scope

The app uses Supabase Auth, Storage and one `pacemate` Edge Function with server-side database access. Foundation profiles and sports have no browser table privileges or RPCs. Chat has a separate, review-only browser-access proposal.

| Scope | Database files | What can be verified |
|---|---|---|
| Foundation only | Base, community, then Foundation migration | Onboarding, profile editing, sports, modes, discovery, compatibility and likes. Current matches/chat screens require additional schema. |
| Current app including chat | Base, community, direct-chat proposal, chat-push table proposal, then Foundation migration | Foundation plus matches, chat and mute settings. Push delivery still requires separate configuration. |

The chat-push table proposal supplies `conversation_members`, which the current chat client reads even without push delivery. Applying its table proposal does not require enabling delivery. The separate webhook proposal is unnecessary for Foundation testing.

Do not describe Foundation-only setup as a full-app pass. See [DIRECT_CHAT.md](supabase/DIRECT_CHAT.md) and [PUSH_NOTIFICATIONS.md](supabase/PUSH_NOTIFICATIONS.md) before choosing the chat scope. Do not use an indiscriminate migration push: the chat proposals live outside the migrations directory and have their own review requirements.

## 2. Record the isolated project

Create or choose an empty test project using the provider dashboard when separately authorized. Record its project reference and URL, the branch commit being tested, chosen scope, migration history and test date. Use test accounts and test photos only.

Every `TEST_PROJECT_REF` and `TEST_PROJECT_URL` below is a placeholder for that new project. Older repository documents contain an existing project's reference; do not copy that reference into these steps.

Use Node.js 22.12 or later, the repository's locked dependencies, and a working Supabase CLI for later deployment. The existing repository deployment instructions use CLI version 2.39.2 for this Mac. Do not change tooling or install packages as part of merely reading this runbook.

## 3. Apply the reviewed SQL manually, after authorization

For an empty test database, execute each complete file in SQL Editor in this order:

1. `supabase/migrations/20261107000000_pacemate.sql`
2. `supabase/migrations/20261107010000_community_features.sql`
3. For chat scope only: `supabase/review/20261107020000_direct_chat.sql`
4. For chat scope only: `supabase/review/20261107030000_chat_push.sql`
5. `supabase/migrations/20261107040000_phase1_foundation.sql`

Record success or failure for each file. Stop at an error and resolve it before continuing. For an existing test database, inspect its applied history first and skip already-applied base, community and chat scripts. Those scripts must not be assumed rerunnable.

The rewritten Foundation file is intended to be idempotent. Validate this in the disposable project after the first successful application:

1. Create adult test profiles and save multiple connection modes and detailed sport preferences.
2. Record profile values, selected sports, catalog count and existing match IDs.
3. Run the complete Foundation file again.
4. Confirm it succeeds without duplicate columns, constraints, triggers, catalog entries or user-sport rows. Confirm saved modes, sport details, profile data and existing matches remain intact.

Inspect privileges as well as RLS. `profiles`, `sports` and `user_sports` must deny direct `anon` and `authenticated` access. New sports tables have RLS enabled and no browser policies. No Foundation read/save/catalog/visibility RPC should exist. Only private Foundation trigger functions are defined, with execution revoked from browser roles and PUBLIC. The chat proposals must not add profile or Foundation table access.

## 4. Configure test Auth and backend

Enable email/password signup and configure confirmation/recovery for test inboxes. Set the test project's Auth Site URL to `http://localhost:5173` and allow `http://localhost:5173/` and `http://localhost:5173/reset-password` as redirects. Configure any later test hosting origin separately. OAuth is unnecessary for this test scope.

Set these secrets on the test project's `pacemate` function through the dashboard:

| Secret | Test value |
|---|---|
| `PACEMATE_DATABASE_URL` | Test project's transaction-pooler Postgres URI, with its password correctly percent-encoded |
| `PACEMATE_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |
| `PACEMATE_APP_URL` | `http://localhost:5173` |
| `BILLING_ENABLED` | `false` |

The database role must support the existing server-only access model. Do not use an `anon` or `authenticated` connection. Keep `PACEMATE_LOCAL_DATABASE` unset for a hosted test project. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions; do not place the service key or database URI in frontend variables.

Leave optional external integrations unconfigured: geocoding provider, link previews, Stripe, Resend, VAPID keys, push webhook and notification dispatch schedule. Do not copy production integration credentials. Do not run `supabase/schedule-notifications.sql`, the push-secret setup script or `20261107030100_chat_push_webhook.sql` for Foundation-only verification. Use a clean browser profile with no previous project's push subscription.

When separately authorized to deploy the test function, build from the selected commit and target the explicit test reference:

```sh
npm run backend:build
npx --yes supabase@2.39.2 functions deploy pacemate --project-ref TEST_PROJECT_REF --use-api
```

These are network-capable setup instructions for later manual execution. The checked-in function configuration points to `_bundle/index.js`, so regenerating the bundle before deployment is required. Keep `verify_jwt = false` as configured: private handlers verify bearer tokens themselves, while public routes and preflight remain supported.

## 5. Point the frontend at the test project

Manually create or update the ignored `.env.local` with the test project's public configuration:

```dotenv
VITE_SUPABASE_URL=TEST_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=TEST_PROJECT_PUBLISHABLE_KEY
VITE_API_URL=TEST_PROJECT_URL/functions/v1/pacemate
VITE_VAPID_PUBLIC_KEY=
```

Replace the placeholders with actual test values; `TEST_PROJECT_URL` includes `https://`. Never put database credentials, service-role keys or private integration secrets here. Restart Vite after changing these variables:

```sh
npm run dev
```

Open `http://localhost:5173` in a clean browser profile. In Network, confirm Auth, API, Storage and any Realtime requests target only the test project. Stop if any request points at the existing project. Use two separate browser profiles for members A and B to avoid shared sessions and browser storage.

The health endpoint is `TEST_PROJECT_URL/functions/v1/pacemate/api/health`. Its current `chat-5` version string is not a unique Foundation release identifier. Basic health confirms neither database connectivity nor applied schema; the separately available `?database=1` probe contacts the database and must only be used as part of authorized test execution.

## 6. Verify Foundation and authorization

Create and confirm two disposable adult accounts, A and B, and complete onboarding. Test in the browser and inspect actual API responses. Keep tokens, passwords and private profile values out of shared test reports.

| Check | Expected result |
|---|---|
| A opens Edit full profile | `GET /api/foundation` returns A's profile; `GET /api/foundation/sports` returns the catalog through the Edge Function. No Foundation request uses `/rest/v1/rpc/`. |
| A saves several connection modes and one to eight sports with experience/intensity | `PUT /api/foundation` succeeds; reload preserves selections. Legacy profile sports remain synchronized. |
| Submit an under-18 birthdate with friendship or training only | Foundation save returns 422. Repeat through `PUT /api/me`; it also returns 422. Disabling the UI checkbox is not the enforcement mechanism. |
| Submit invalid modes, no modes, duplicate sports, invalid experience/intensity or another member's photo key | Save fails without a partial profile/sport update. |
| A submits B's ID or verification status in a save body | Caller identity remains A; B is unchanged and verification cannot be self-granted. |
| A reads own Foundation profile | Owner may receive their birthdate. |
| A reads eligible B through `/api/foundation/members/B_ID` and Discover | Responses contain derived age and no birthdate, email, phone or exact-address fields. Also inspect the reciprocal-like match response. Free-text/photos may contain information members entered themselves. |
| Request Foundation endpoints without a token or with an invalid token | 401. A valid account without a completed profile is denied profile-required access. |
| Request Foundation tables directly through REST as A or anonymously | Access denied. A successful empty response is not proof of privilege denial; inspect role privileges too. |
| A blocks B | B disappears from discovery; member read returns no profile; a direct like request cannot create a swipe/match. Repeat in reverse. |
| B pauses or is suspended | B is not shown or likeable. Suspension checks remain enforced on Foundation saves. Moderation setup, if needed, follows `supabase/COMMUNITY_SETUP.md` using only a test administrator. |

Privacy checks must examine response JSON, not only what Vue renders. Knowing an existing member ID must not bypass the member endpoint's eligibility rule.

## 7. Verify discovery and likes agree

Configure both accounts as adults, restore blocks/pause/suspension, and set reciprocal gender and age preferences through the legacy profile editor. Keep search filters broad. Discovery excludes previously swiped pairs, so use fresh disposable accounts for independent rows or deliberately manage test fixtures in the disposable project; do not mistake prior-swipe exclusion for mode filtering.

| Pair configuration | Expected eligibility |
|---|---|
| Shared training mode, gender or age preferences incompatible | Shown and likeable |
| Shared friendship mode, gender or age preferences incompatible | Shown and likeable |
| No shared mode | Not shown; direct like rejected |
| Both enable dating, reciprocal gender and age preferences satisfied | Shown and likeable |
| Both enable dating, either gender preference incompatible | Not shown; direct like rejected |
| Both enable dating, either age range excludes the other | Not shown; direct like rejected |
| Both share friendship and dating, dating preferences incompatible | Not shown; direct like rejected because shared dating activates those filters |
| Only one enables dating, both share friendship | Shown and likeable without dating preference filters |

For an eligible pair, A's like alone creates no match; B's reciprocal like creates one match. Repeating a like must not duplicate it. Inspect `/api/swipes` responses. A profile shown by discovery must not fail a like due to a different eligibility implementation, though changes to preferences, blocking, pause or suspension between requests can legitimately make it unavailable.

## 8. Verify compatibility

Set both accounts to the same city/country, sports, experience, overall intensity, availability, lifestyle interests and connection modes. Discover should return `compatibility` with `eligible: true`, score 100, reasons derived from those values and a factor breakdown. Repeat an unchanged request; the result should be identical. Missing factors earn no invented points. Changing real preferences should affect the relevant factors.

Weights are shared sports 25, availability 20, intensity 15, location 15, experience 10, lifestyle 10 and intentions 5. Scores are calculated from profile data and are never stored. A score is not evidence of a mutual like or a match. The member profile uses the same unchanged compatibility module for display; discovery/like authorization additionally enforces the shared eligibility predicate.

## 9. Record results and remaining scope

Record commit, project reference, scope, applied files, test account identifiers, endpoint/status, expected result and observed result. Redact tokens, credentials and private response values. Keep failed checks open instead of replacing them with a local unit-test pass.

Local checks for a later verification run are `npm test` and `npm run build`. They do not establish SQL idempotence, real role privileges, trigger behavior, Auth delivery or hosted Edge execution. For chat scope, separately run the manual checks in `supabase/DIRECT_CHAT.md`, including its role-based SQL check file only when SQL testing is authorized. Push delivery, billing and other providers remain outside this Foundation test pass.
