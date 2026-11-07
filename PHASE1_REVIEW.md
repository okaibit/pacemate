# Phase 1 draft review

7 November 2026. Reviewed on `phase1-draft`, commit `1bc1a24`. **Overall verdict: rework; do not apply this draft as written.** It introduces a second browser-facing backend for profiles, contrary to the required handler model. The documented direct-chat exception does not authorize this profile exception.

Only this report was created. No SQL, migrations, deployment, hosted requests, dependency installation, or application build was run. `npm test` ran locally with existing dependencies and test fixtures: **108 passed, 0 failed**, including the 11 new Foundation tests. These tests do not execute PostgreSQL or establish database authorization. References are repository-relative paths with line numbers; `draft` below means `supabase/migrations/20261107040000_phase1_foundation.sql`.

## Findings

### High: profile access conflicts with the backend architecture

`supabase/README.md:28,36,54` requires denied browser table access and verified Edge handlers with server-only DB access. The existing migrations enforce this (`supabase/migrations/20261107000000_pacemate.sql:324-335`; `supabase/migrations/20261107010000_community_features.sql:90-96`). `supabase/DIRECT_CHAT.md:17-25,38` describes a separate review-only chat proposal, explicitly preserving profile restrictions.

The draft keeps `profiles` denied to browser roles, but grants authenticated table access to `sports` and `user_sports`, enables RLS, creates five policies, and grants four callable SQL functions (`draft:49-70,198-199`). `src/foundation/client.js:9` calls PostgREST `/rest/v1/rpc/` directly. Its bearer checks do not route through the existing Edge Function. Profile reads and saves therefore bypass the handler architecture even though their SQL contains identity checks.

Direct `user_sports` writes also bypass `foundation_save`'s one-to-eight sports requirement and nonempty experience/intensity validation (`draft:147-155`). Table checks allow empty experience/intensity and impose no eight-sport limit (`draft:38-43`); an owner can delete all their sports through REST (`draft:56,70`). RLS enforces row ownership, not equivalent save validation.

### High: discovery, compatibility, and match eligibility disagree

Discovery still requires reciprocal gender preferences: candidate gender must be in the viewer's `interested_in`, and viewer gender must be in the candidate's `interested_in` (`supabase/functions/pacemate/handlers/discover.ts:26,37`). It also applies reciprocal age ranges, previous swipes, blocks, suspension/pause, sport, city/travel, paid likes and radius filters (`handlers/discover.ts:11-37`, under that same directory).

Foundation does not reuse these checks. `foundation_visible` checks identity, suspension, target pause and bilateral blocks only (`draft:57-65`). Any unsuspended member with a profile can request another available member by known ID, regardless of gender, `interested_in`, age range, previous swipe, match or shared mode. `MemberProfile.vue:12` makes that request directly. This widens the profile audience beyond Discover; it is not by itself a leak of the private structured fields discussed below.

`computeCompatibility` requires a shared mode and adult ages for a dating mode but has no gender or `interested_in` inputs/checks (`src/foundation/compatibility.js:13-15,31`). Its public DTO does not contain those preferences (`draft:118-123`). A pair excluded from discovery can therefore receive an eligible compatibility score through the member route. Conversely, discovery does not filter `connection_modes`, while the new database match trigger rejects inserts without a shared mode (`draft:186-196`). Reciprocal likes for a pair still shown by discovery can now fail at the existing insert (`supabase/functions/pacemate/handlers/swipes.ts:25-33`). That handler does not recheck gender or age preferences itself (`handlers/swipes.ts:13-24`). Neither the new match trigger nor the compatibility score supplies those missing checks.

### Medium: additive schema changes also rewrite data and change existing workflows

This is not a data-neutral migration. It adds eight columns to the existing profiles table and updates every profile's connection modes and verification status (`draft:4-28`). It creates and seeds the catalog and backfills normalized sports/experience from existing profiles (`draft:30-47`). Adults with relationship/casual goals become dating-only; friendship/training goals become their respective mode; other goals, including underage relationship goals, become training plus friendship (`draft:21-26`). This is an inferred migration mapping, not newly collected consent.

No existing table/column is dropped, no existing profile row is deleted, and existing matches/messages are not backfilled or removed. However, new triggers alter future profile writes, sports writes and match inserts (`draft:72-110,186-196`). Profile updates now enforce the dating age restriction and verification mirror. The photo verification trigger runs before `zz_foundation_profile_guard`, so photo changes can still revoke verification (`draft:81-86`; `supabase/migrations/20261107010000_community_features.sql:123-130`).

Sports synchronization is partial: legacy sports changes insert/delete normalized selections, but existing normalized experience is not updated on conflict; changes to legacy `level` alone do not invoke the sync (`draft:89-98`). Normalized sports writes replace legacy `profiles.sports` with alphabetically ordered catalog names and update `updated_at` (`draft:99-110`). The backfill copies only exact catalog-name matches; unknown historical sports remain in the original array initially, but a later normalized write replaces that array and can remove them (`draft:45-47,104`). The seed covers the current selectable sports (`supabase/functions/pacemate/options.js:7-10`).

`foundation_save` updates existing name, birthdate, current city, bio, photos and timestamp as well as new fields, then deletes/upserts normalized sport rows (`draft:165-179`). Legacy goal, gender, interests, age ranges, routine and global experience remain separate. Country/city edits bypass the existing city canonicalization in `/api/me` (`supabase/functions/pacemate/handlers/me.ts:47-48`), while discovery uses canonical cities and coordinate lookup (`handlers/discover.ts:13-18,25`).

## Complete draft SQL inventory

### Tables, columns and constraints

| Object | Definition or effect | Lines in draft |
|---|---|---|
| Existing `public.profiles` | Adds `country text NOT NULL DEFAULT ''`; `languages text[]`, `preferred_days text[]`, `preferred_times text[]`, `lifestyle_interests text[]`, `connection_modes text[]`, each NOT NULL DEFAULT `'{}'`; `preferred_intensity text NOT NULL DEFAULT ''`; `verification_status text NOT NULL DEFAULT 'unverified'` | 4-12 |
| Profile constraints | `foundation_days`: allowed day values; `foundation_times`: allowed time values; `foundation_intensity`: empty/low/moderate/high; `foundation_modes`: allowed modes, cardinality 1-3; `foundation_verification`: unverified/verified; `foundation_lengths`: country <=80, languages/interests <=12 each. Modes/lengths initially NOT VALID, then validated after backfill | 13-18,27-28 |
| New `public.sports` | `id text` PK with slug regex; `name text NOT NULL UNIQUE`, length 1-60; 38 seeded sports | 30-37 |
| New `public.user_sports` | `user_id text NOT NULL` FK to profiles, ON DELETE CASCADE; `sport_id text NOT NULL` FK to sports; `experience_level text NOT NULL DEFAULT ''` with empty/beginner/intermediate/advanced check; `preferred_intensity text NOT NULL DEFAULT ''` with empty/low/moderate/high check; composite PK `(user_id,sport_id)` | 38-47 |
| Existing `public.matches` | No added columns, constraint or row backfill; new BEFORE INSERT trigger changes eligibility | 186-196 |

Other referenced tables are `public.blocks` (visibility and match blocking checks) and `storage.objects` (photo ownership/existence check); neither is altered (`draft:63-64,162,192`). No sequence, index beyond implicit PK/unique indexes, storage policy, chat table or publication is added.

### Every privilege and policy statement

| Statement | Effect | Lines in draft |
|---|---|---|
| REVOKE ALL on `public.profiles` FROM `anon,authenticated` | Retains direct profile-table denial | 51 |
| ENABLE ROW LEVEL SECURITY on `public.sports`, `public.user_sports` | Adds browser row-security model on both new tables; no FORCE RLS | 52-53 |
| REVOKE ALL on `public.sports,public.user_sports` FROM `anon,authenticated` | Clears role table privileges before regranting | 54 |
| GRANT SELECT on both new tables TO authenticated | Browser can read catalog and visible members' normalized sports | 55 |
| GRANT INSERT,UPDATE,DELETE on `public.user_sports` TO authenticated | Browser can mutate owned sport rows under policies | 56 |
| `foundation_sports_read` | SELECT sports TO authenticated when `auth.uid()` exists | 66 |
| `foundation_user_sports_read` | SELECT user_sports TO authenticated using `foundation_visible(user_id)` | 67 |
| `foundation_user_sports_insert` | INSERT TO authenticated, own user ID and visible self WITH CHECK | 68 |
| `foundation_user_sports_update` | UPDATE TO authenticated, own ID and visible self in USING and WITH CHECK | 69 |
| `foundation_user_sports_delete` | DELETE TO authenticated, own ID and visible self USING | 70 |
| REVOKE ALL on all eight functions listed below FROM `PUBLIC,anon,authenticated` | Removes default function invocation rights | 198 |
| GRANT EXECUTE on `foundation_visible(text)`, `foundation_profile(text)`, `foundation_catalog()`, `foundation_save(jsonb)` TO authenticated | Four browser-callable functions; no anon execute regrant | 199 |

No new SELECT grant or browser policy is added to profiles. Trigger functions remain uncallable by these browser roles. New-table revocations do not explicitly revoke privileges from PUBLIC or remove custom default grants; this report assesses the documented baseline, not unknown hosted ACLs.

### Every function and trigger

All functions set an empty search path. All are SECURITY DEFINER except the catalog function, which is SECURITY INVOKER.

| Function | Behavior and trigger, if any | Lines in draft |
|---|---|---|
| `foundation_visible(candidate text) RETURNS boolean` | STABLE SQL identity/suspension/pause/block helper, browser-callable | 57-65 |
| `foundation_profile_guard() RETURNS trigger` | PL/pgSQL; derives missing modes on INSERT from legacy goal, rejects under-18 dating, mirrors verified flag. `zz_foundation_profile_guard` BEFORE INSERT OR UPDATE on profiles | 72-86 |
| `foundation_legacy_sports_sync() RETURNS trigger` | PL/pgSQL; recursion guard, removes absent normalized sports, inserts new ones with legacy experience. `foundation_legacy_sports_sync` AFTER INSERT OR UPDATE OF sports on profiles | 89-98 |
| `foundation_sports_sync() RETURNS trigger` | PL/pgSQL; recursion guard, rewrites legacy sports/timestamp, rejects transferring row ownership. `foundation_sports_sync` AFTER INSERT OR UPDATE OR DELETE on user_sports | 99-110 |
| `foundation_profile(target text DEFAULT NULL) RETURNS jsonb` | STABLE PL/pgSQL; visible target projection, owner-only birthdate | 112-125 |
| `foundation_catalog() RETURNS jsonb` | STABLE SQL; sorted sports catalog under caller's permissions/RLS | 126-128 |
| `foundation_save(payload jsonb) RETURNS jsonb` | PL/pgSQL; caller-scoped existing profile, locks row, validates payload/photos, updates profile and normalized sports, returns owner projection | 130-182 |
| `foundation_match_guard() RETURNS trigger` | PL/pgSQL; locks both profiles, requires existing unsuspended profiles, shared modes and no block. `foundation_match_guard` BEFORE INSERT on matches. Does not check pause, gender, interested_in or age ranges | 186-196 |

## Execution safety and idempotence

**Structurally incremental, but not safe to approve as a release migration.** Against exactly the two documented migrations, the referenced profiles, matches, blocks, verified/suspended columns and storage objects exist. No obvious missing prerequisite from the chat proposals is required by this draft. Object creation/backfill order appears coherent by static inspection. The transaction spans `draft:3-200`; an error aborts the transaction. No SQL execution was performed, so runtime success is unverified.

It is **not idempotent**: unguarded ADD COLUMN/constraints, CREATE TABLE, CREATE FUNCTION and CREATE TRIGGER fail when objects already exist (`draft:4-18,30,38,57,86`). A second run after successful application fails at the existing profile columns. Seed/backfill statements are not independently rerunnable either (`draft:35-47`). Existing rows are retained, but the data mappings, changed write behavior, browser grants and discovery mismatch prevent a blanket “safe to run once” verdict. The initial rewrite also invokes existing UPDATE triggers applicable to those columns; it is not a schema-only operation. `VERIFICATION_PLAN.md:44-46` describes the Foundation RPC/schema mismatch against the original migrations; this draft supplies those objects through an architecture that still conflicts with the requested model.

## Member data exposure

`foundation_profile` returns exactly: `id`, `name`, derived integer `age`, `city` from `current_city`, `country`, `bio`, `languages`, `photos`, `preferred_days`, `preferred_times`, `preferred_intensity`, `lifestyle_interests`, `connection_modes`, `verification_status`, and `user_sports` containing `sport_id`, `name`, `experience_level`, `preferred_intensity` (`draft:118-122`). Authenticated direct reads of user_sports additionally expose its four table columns, including `user_id` (`draft:38-43,55,67`). Catalog reads expose sport IDs/names. The visible-member audience is described above; it is not restricted to matches or discovery-eligible members.

**Confirmed in these explicit response projections: other members receive age, never the structured birthdate, email, phone or exact-address fields.** Birthdate is appended only when target ID equals `auth.uid()` (`draft:123`); email, phone and exact address are absent altogether. The client itself returns raw response JSON and provides no privacy filtering (`src/foundation/client.js:16`), so the guarantee depends on the SQL projection and denied profile-table privileges. The existing handler's public projection also explicitly enumerates fields and excludes those private fields (`supabase/functions/pacemate/server/http.ts:108-115`); Discover's internal `SELECT p.*` is projected before the HTTP response (`handlers/discover.ts:19,38`).

Owners can receive their own birthdate through Foundation; `/api/me` also returns the owner's profile and authenticated email (`supabase/functions/pacemate/handlers/me.ts:10-20`). Foundation denies even owner reads when suspended (`draft:61,116`). There are no dedicated phone or exact-address columns in the existing profile definition or this draft (`supabase/migrations/20261107000000_pacemate.sql:44-64`; `draft:4-18`). This is a code-level structured-field finding, not a claim that free-text bio/name/city, interests or photos cannot contain voluntarily entered contact information, nor a verification of unknown hosted endpoints or policies.

## Dating and age enforcement

**Dating is restricted in the proposed database, beyond the UI.** The profile trigger rejects dating modes when birthdate is missing or younger than 18 on every INSERT/UPDATE (`draft:75-86`); backfill only assigns dating to adults (`draft:21-25`). The editor disables the dating checkbox for under-18 dates (`src/views/FoundationProfile.vue:16,54`), and compatibility ignores dating unless both ages are at least 18 (`src/foundation/compatibility.js:14,31`). The match trigger relies on profile validity rather than explicitly checking birthdays (`draft:189-193`).

The existing handler has a stricter rule: `/api/me` rejects all under-18 profiles (`supabase/functions/pacemate/handlers/me.ts:27-32`). The new save RPC accepts dates from today back to 100 years ago and permits minors with non-dating modes (`draft:141-143,165-173`), bypassing that existing app-wide adult requirement. Legacy goal edits do not resynchronize existing connection modes: the derivation runs only on INSERT (`draft:75-77`). Thus the two editors can disagree about goal versus mode. Age checks use PostgreSQL current date; the UI calculates UTC age. No live boundary-date test was run.

## Compatibility implementation

The computation is deterministic, uses supplied profile data only, contains no randomness, creates no mock fallback, and stores no score (`src/foundation/compatibility.js:8-33`; `src/views/MemberProfile.vue:11-12`). Missing factors receive zero; missing age excludes dating. The new tests cover full/partial/missing inputs, repeatability/symmetric score, self rejection, dating ages and private-field independence (`tests/compatibility.test.mjs:4-11`). Test fixtures are synthetic; production code does not import them.

| Factor | Required and implemented weight | Computation |
|---|---|---|
| Shared sports | 25 | Jaccard overlap of sport IDs |
| Availability | 20 | Day overlap multiplied by time overlap |
| Intensity | 15 | Ordinal distance of overall low/moderate/high |
| Location | 15 | Same city and country: 1; same country only: 0.35; otherwise 0 |
| Experience | 10 | Mean ordinal proximity across shared sports |
| Lifestyle | 10 | Jaccard overlap of lifestyle interests |
| Intentions | 5 | Jaccard overlap of valid modes with underage dating removed |

Weights exactly match and total 100 (`src/foundation/compatibility.js:2,19-32`). Factor contributions round to two decimals, then the total rounds to an integer (`:32-33`). Per-sport intensity is collected/displayed but not used in scoring (`src/views/FoundationProfile.vue:56`; `src/foundation/compatibility.js:22,26,31`). Country remains empty for migrated members until supplied, so location can earn zero even with matching legacy cities (`draft:5`; `compatibility.js:24`). Profile completeness reports presence, not full backend validity (`compatibility.js:35-37`).

This is a separate scoring/eligibility implementation, not reuse of existing discovery logic. Existing discovery ranks shared legacy sport count, then level/routine/goal fit, travel arrival, distance and recency (`supabase/functions/pacemate/handlers/discover.ts:20,37`). It neither imports this module nor returns these weighted scores. Foundation partially duplicates sport/location/experience/goal concepts with different data and rules, while adding its own mode eligibility. The new member view displays the score only; it does not change Discover ordering (`src/views/MemberProfile.vue:29`; `src/views/Discover.vue:34-35`).

## File verdicts

“Rework” retains useful intent but means the current file is unsuitable for application unchanged. No implementation or new feature is authorized by this report.

| File | Verdict | Reason |
|---|---|---|
| `supabase/migrations/20261107040000_phase1_foundation.sql` | Rework | Useful additive fields and explicit privacy projection, but browser table grants/RLS/RPCs conflict with architecture; mode backfill, sync behavior, match/discovery disagreement and underage non-dating saves change existing semantics (`:21-28,49-70,89-110,130-199`). Not idempotent. |
| `src/foundation/api.js` | Discard | Entire file instantiates the incompatible direct-RPC transport (`:1-3`); existing Edge API transport already exists. |
| `src/foundation/client.js` | Discard | Its core purpose is direct PostgREST RPC access (`:2-9`). Account-change checks, timeout and sanitized errors are useful behavior but do not justify a second profile backend (`:5-18`). |
| `src/foundation/compatibility.js` | Rework | Keep deterministic weighted math as useful material; eligibility disagrees with discovery, uses a parallel profile shape, and completeness is presence-only (`:13-15,24-37`). Weights are correct. |
| `src/views/FoundationProfile.vue` | Rework | Uses incompatible read/save RPCs (`:24-28`), bypasses existing adult-only handler and city normalization; useful editor and owner-response guards (`:11-14`), but new/legacy fields diverge. |
| `src/views/MemberProfile.vue` | Rework | Explicit display fields omit private data, but arbitrary-ID reads bypass discovery eligibility and the compatibility label has different eligibility semantics (`:11-13,22-29`). |
| `src/components/ProfileFoundationSummary.vue` | Rework | Useful completeness display, but existing profile screen depends on unsupported direct RPC and reports missing migration errors until schema changes (`:3-12`). |
| `tests/foundation-client.test.mjs` | Rework | Mocked transport/account/error tests pass (`:5-14`) but enshrine direct RPC. The first test supplies an owner-free payload; it does not prove the generic client rejects owner parameters. It does not execute SQL or prove response privacy/ownership. |
| `tests/compatibility.test.mjs` | Keep | Local deterministic tests meaningfully exercise pure scoring, missing data and adult dating (`:5-11`). Passing them does not prove integration with discovery, database age checks or server privacy. The weight test checks total, not every individual weight; individual values were verified statically. |

## Verification limits

Read AGENTS.md, VERIFICATION_PLAN.md, both requested Supabase documents, every requested draft file and both new tests, and inspected existing migrations, profile/discovery/swipe handlers and related integration code. The local test script is Node's test runner (`package.json:9`); remote-looking URLs in the tested paths use injected/mocked transports and DB drivers. No network or secrets were needed. Tests establish local JavaScript behavior only. Actual SQL execution, grants under real roles, trigger ordering effects under concurrency, populated-database migration success and hosted response contents remain unverified under this review's read-only limits.
