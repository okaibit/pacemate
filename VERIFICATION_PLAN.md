# Pacemate verification review

7 November 2026. Static, read-only review. No SQL, migrations, tests, builds, deployments, or hosted requests were executed for this review. Only this document was created. Existing local changes from the stopped Foundation task were left untouched.

References below use repository-relative paths and current line numbers. `base` means `supabase/migrations/20261107000000_pacemate.sql`; `community` means `supabase/migrations/20261107010000_community_features.sql`.

## Confirmed findings, ranked

### High: current chat code cannot run against only the two documented migrations

- `handlers/matches.ts:8` reads `messages.read_at`; `handlers/messages.ts:27,43,51` uses `read_at` and `client_id`; `handlers/chat.ts:20` uses `link_url` and `link_meta`. Paths in this paragraph are under `supabase/functions/pacemate/`.
- Neither reviewed migration creates those columns. They are introduced by the separate, review-only `supabase/review/20261107020000_direct_chat.sql:22-39`.
- `src/composables/useChat.js:14-25,48,64,74` directly reads/writes PostgREST conversations, messages, reactions, and receipts. `base:330-334` denies browser table access; `community:90-96` does the same for new tables. The direct-chat proposal separately grants browser access at lines 122-144.
- Result with only base + community: the match list query fails on a missing column; direct chat cannot load its required tables or write messages. This is a confirmed source/schema mismatch, not evidence of a hosted authorization breach.
- Current push/mute UI also depends on review-only SQL: `src/composables/useChat.js:50,76` accesses `conversation_members`; `src/composables/usePush.js:9-12,28-34` accesses `push_subscriptions` directly. The grants/table are in `supabase/review/20261107030000_chat_push.sql:3-23`, outside the two reviewed migrations.
- Do not deploy the current checkout as a handler-only, two-migration release. Decide the release artifact before deployment. This review does not authorize applying the separate proposals.

### Medium: failed push cleanup prevents logout and can prevent account deletion

`src/auth.js:54-57` rethrows a failure from `disablePush()` before calling Auth logout or clearing session state. `src/composables/usePush.js:32-35` awaits an authenticated database DELETE before unsubscribing locally. With an existing browser subscription, a network failure or the documented deny-all table privileges can leave the user signed in after choosing Log out. The underlying Auth client correctly clears tokens in a `finally` block (`src/auth-client.js:85-88`), but this path never reaches it.

The same cleanup is awaited before deletion in `src/views/Profile.vue:40-43`. A failed subscription DELETE therefore prevents the account DELETE request too. Reproduction requires an existing subscription; browsers without one skip the failing operation.

### Medium: photo upload does not enforce suspension

`supabase/functions/pacemate/handlers/photos.ts:15-22` uses `requireUser`, which validates identity but does not inspect the profile. A suspended member whose bearer token still validates can upload new public photos, subject to the upload rate limit. This is especially relevant when the Auth ban update fails: `handlers/admin.ts:59,65-66` explicitly preserves the database suspension and returns a warning in that case. Other protected community handlers use `requireProfile`, which checks suspension (`server/http.ts:36-40`).

Photo deletion is owner-scoped and intentionally available without a completed profile. Export and account deletion likewise retain owner access; those are not treated as suspension bypass bugs here.

### Medium: event chat does not reject a suspended host's existing session

`supabase/functions/pacemate/server/feature-db.ts:22-28` checks the caller, membership, cancellation, and host blocking, but never checks whether the host is suspended. `handlers/eventchat.ts:4,14-18` therefore lets an unsuspended attendee post in that session using its known ID after the host is suspended. The session list and RSVP handler do hide/reject suspended hosts (`handlers/events.ts:23,38`). The event branch of the Realtime authorization helper has the same omission (`community:142`). The suspended host themselves is rejected by `requireProfile`.

### Medium: event-chat membership check and insert are not atomic

`handlers/eventchat.ts:4` authorizes membership before reading the request body; lines 15-17 later rate-limit, read the body, and insert without locking/rechecking the event or membership. A request already past authorization can finish after cancellation, attendee departure, or a new host block. The foreign keys still permit the insert because the event/profile rows remain. This is a bounded in-flight race, not a general ability for a nonmember to start a new authorized request.

### Medium: raw profile export assumes a decoded Postgres array

`handlers/export.ts:35` calls `(profile.photos || []).map(...)` on a raw SQL result. The database disables array type discovery (`db/runtime.js:19-21`), and the repository explicitly handles raw `text[]` literals in `server/profile-data.js:1-21`. Unlike public profile paths, export does not normalize the array. When `photos` arrives as a literal such as `{...}` or `{}`, the profile export throws instead of completing. Actual hosted driver output needs confirmation; the unhandled representation is visible in code.

Paths in the preceding four findings are under `supabase/functions/pacemate/` unless specified otherwise.

### Medium: stopped Foundation changes remain connected to profile routes

This is from the earlier stopped task, not the original two-migration architecture. `src/router.js:27-28` registers Foundation screens; `src/views/Profile.vue:8,53` mounts the Foundation summary. `src/components/ProfileFoundationSummary.vue:9` calls `foundation_profile` through the RPC client (`src/foundation/client.js:9`). Neither reviewed migration defines that function. Against the requested schema, the summary reports migration-pending and the linked full editor cannot load. No Foundation SQL was run during this review; its pending local file was not included in the migration assessment or deployment order.

### Low: database pair ordering and reverse lookup indexes are incomplete

- `base:27-32,96` uniquely constrains the ordered match pair, but has no `CHECK(user_a < user_b)`. Reversed pairs or self-pairs are therefore not rejected by this schema alone. Current swipes correctly sort IDs (`server/http.ts:118`, `handlers/swipes.ts:13,17,31`), so no duplicate-match bug was found through that handler.
- There are no reverse indexes on `blocks(blocked_id)`, `rsvps(user_id)`, or `messages(sender_id)` in either migration. Their forward composite indexes cannot efficiently serve those leading-column lookups/cascades. This is an indexing gap, not an authorization flaw or proven latency measurement.

## Migration review

| Object | Existing protection | Assessment |
|---|---|---|
| Swipes | Composite PK `(swiper_id,target_id)`, target index, both profile FKs with cascade (`base:85-90,104,124-126`) | Correct uniqueness and lookup coverage for current handler. PK also makes both columns non-null. |
| Matches | ID PK, unique `(user_a,user_b)`, user-B index, both profile FKs (`base:27-32,96-98,112-114`) | Current sorted handler works; database ordering gap noted above. |
| RSVPs | Composite PK `(event_id,user_id)`, both cascading FKs (`base:77-81,120-122`) | Duplicate RSVP prevented. Event count is indexed by PK; user reverse index absent. Capacity is enforced in the handler, not a table constraint. |
| Blocks | Composite PK and both cascading profile FKs (`base:3-7,106-108`) | Both block directions checked by handlers; reverse index absent. |
| Messages | ID PK, `(match_id,id)` index, match/sender FKs (`base:35-40,100,116-118`), attachment FK (`community:30-36`) | Match paging and cascades covered. Sender index absent. Client UUID uniqueness is not in these two migrations. |

No definite SQL syntax or creation-order error was found in the two files by static inspection. This is not an execution result. Tables exist before their FKs; attachment storage exists before its FK; functions precede their triggers; referenced sequence names match serial/bigserial columns. `gen_random_uuid()` is available in modern Supabase PostgreSQL. The scripts require Supabase-provided `auth`, `storage`, and `realtime` facilities and a sufficiently privileged executor, not plain PostgreSQL alone.

The base script includes later additions such as `weekly_goal`, `last_active_at`, `next_city`, and `next_arrival` before COMMIT (`base:203-205,318-320`). Community adds suspension/verification before functions use them (`community:3-4`). It preserves existing profile rows and seeded events.

**When base has already run:** skip it. Its unguarded CREATE TABLE statements fail on existing objects (`base:3` onward). Apply community once only if it is absent. Community is also not rerunnable: although its first columns use `IF NOT EXISTS`, its tables, constraint, functions, triggers, and policy do not (`community:13,36,103,116,149`). Both scripts are transactional; after an error, roll back before retrying. Do not rerun historical Netlify migrations or infer that `IF NOT EXISTS` makes the whole script idempotent.

Reports and moderation audit actor/target IDs intentionally do not all have profile FKs, preserving evidence after account deletion (`base:67-74`; `community:17-19`). This is not counted as a missing core relationship.

## Realtime policy

`community:134-149` is appropriately narrow for the original architecture:

- Resolves identity from `auth.uid()`, rejects missing/suspended callers, and uses a fixed empty search path in the security-definer helper.
- Match topics require an existing match, membership, both members unsuspended, and no block in either direction.
- Event topics require a noncancelled event and host/RSVP membership, plus no block with the host. Suspended-host omission is reported above.
- SELECT policy only permits `extension='broadcast'`. This migration grants no client INSERT policy for broadcasts and does not authorize presence or arbitrary topics.
- Database broadcasts contain only `{"changed":true}`, not message bodies, profile data, or storage URLs (`community:150-157,169-191`). An event participant can receive generic activity signals for the whole event, including posts filtered out of their HTTP feed because they blocked another attendee. Do not describe this as complete activity-metadata isolation.

The policy does not itself disconnect previously joined sockets. Whether authorization is rechecked promptly after block, leave, suspension, or token refresh must be tested against the hosted Realtime service. Existing permissive policies can combine with OR; this migration does not remove unrelated policies on `realtime.messages`. Hosted public-channel settings and policy inventory were not inspected. Arbitrarily long numeric topics can overflow the integer cast (`community:138,141`); that produces an authorization error, not an access grant.

## Handler authorization review

All paths in this section are under `supabase/functions/pacemate/`.

`server/supabase.ts:12-20` verifies bearer tokens using Supabase `/auth/v1/user`; it does not trust decoded claims or browser user IDs. `index.ts:65-69` rejects unauthenticated private routes before loading handlers. Public exceptions are explicit. `server/http.ts:29-40` implements verified-user and unsuspended-profile requirements. The privileged database connection does not replace these checks.

| Handler | Identity and ownership/membership check | Result |
|---|---|---|
| messages | `handlers/messages.ts:6`; `server/feature-db.ts:13-19` | Match-only read/write; blocks and both suspensions checked. Receipt cursor restricted to that match (lines 24-27). Attachment requires caller ownership, same match, unused attachment (47-48). Send rechecks match/block under shared pair lock (38-41), but does not recheck suspension there after initial authorization. |
| chat | `handlers/chat.ts:6,10,18-19,25` | Match-only metadata/images. Image IDs constrained by match; preview enrichment requires the caller's own message. Looks correct. |
| eventchat | `handlers/eventchat.ts:4`; `server/feature-db.ts:22-28` | Host/attendee only; GET filters suspended and mutually blocked senders (lines 9-10). Host-suspension and in-flight membership gaps reported above. |
| attachments | `handlers/attachments.ts:5,9-14` | Active match required; object key generated under caller ID; later message send checks ownership. Upload failure cleans storage. A concurrent closed match can leave an unused upload temporarily; it cannot make an unrelated member a recipient. |
| photos | `handlers/photos.ts:9-12,16,26-30` | GET is deliberately public. POST validates identity but omits suspension. DELETE requires caller prefix and rejects currently referenced photos. |
| events | `handlers/events.ts:8-31,35-44,49-75` | GET deliberately public with optional verified viewer. Writes require unsuspended profile; edits/cancels require host ID. Event row is locked before count/insert and before capacity edit: the core final-seat race protection looks correct. |
| matches | `handlers/matches.ts:4,10-11,16-21` | List scoped to caller and excludes blocked/suspended counterpart. Unmatch requires membership and serializes against sends/swipes/block. Current read query has the schema dependency reported above. |
| swipes | `handlers/swipes.ts:9,13-24,28-32` | Caller identity fixed server-side; self/paused/suspended target denied; pair lock plus bilateral block check; mutual likes required. No non-admin privilege escalation found. Suspension is checked before the transaction, so concurrent moderation needs live race testing. |
| admin | `handlers/admin.ts:6`; `server/feature-db.ts:8-11` | Every route requires unsuspended profile and an actual `app_admins` row. Frontend flags cannot grant access. Own moderation/self verification denied (38,50); approval locks profile/request, compares submitted photos, and writes audit (33-43). |
| verification | `handlers/verification.ts:6,8,13-23,26-32` | Caller-scoped state and private selfie storage; no member approval endpoint. Pending uniqueness in `community:29` closes duplicate inserts, though a losing concurrent request can surface a generic error. |
| safety | `handlers/safety.ts:11-30` | Caller-bound reporter/blocker, target existence, self rejection, pair lock, atomic report/block/match deletion. No arbitrary reporter spoofing found. |
| export | `handlers/export.ts:18,23-29,32-35` | Verified owner; fixed section/table allowlist; own records, participant matches, own attachments only. Suspended users retaining their own export is intentional. No arbitrary table selection or another member's inbox exposure found. Array handling gap noted above. |
| billing | `handlers/billing.ts:46-47,60-83` | Member operations require unsuspended profile; customer lookup bound to caller; return origin allowlisted. Webhook intentionally has no bearer requirement, instead verifies raw-body HMAC and timestamp (16-20), customer mapping (28-32), and event deduplication/order (38-43). Disabled by default for member operations. Signature helper: `server/validation.js:16-23`. Live Stripe behavior remains unverified. |

**Photo privacy boundary:** `base:362-365` makes profile photos public. A known profile-photo URL can be fetched by a blocked, suspended, unrelated, or anonymous person. This is documented behavior, not private-photo authorization. Chat and verification buckets are private (`community:98-101`); chat signed URLs last 60 seconds by default (`server/supabase.ts:62-65`). Blocking prevents new authorized reads but cannot revoke an already-issued signed URL immediately. Owner attachment export deliberately issues one-hour URLs (`handlers/export.ts:33`).

## Frontend auth and stale state

- Initial auth completes before mounting (`src/main.js:14`). Route guards require login/profile and enforce recovery/admin/suspension state (`src/router.js:45-54`). Frontend admin checks are backed by server checks. No route-only admin authorization flaw found.
- Profile loading deduplicates concurrent requests and rejects stale-account responses using request generation plus user ID (`src/auth.js:8-20`). A direct switch between accounts forces a reload (40-42). Logout clears profile generation; `src/App.vue:5-10` redirects/unmounts protected content when the user disappears. These protections look sound by inspection.
- `useChat` captures the owner, checks token identity before/after direct requests, and sends `expectedUserId` to Edge calls (`src/composables/useChat.js:10,14-20,28,47,60`). It stops work and releases subscriptions/timers/object URLs on unmount (79). `src/views/AppLayout.vue:39` keys the routed component by path, so switching chat IDs remounts instead of keeping the previous chat instance.
- Membership refresh clears the conversation when the direct table query returns no row (`useChat.js:33`). Generic network/authorization errors only set an error and can leave previously loaded bubbles visible (40); that is cached, previously authorized state, not proof of a fresh data leak. Verify send failure and recovery after suspension/block.
- Logout cleanup defect and direct-REST/schema mismatches are reported above. No browser execution or console-error pass was performed here.

## What remains unverified

- Actual applied migrations, custom schemas/policies/grants, Supabase version, deployment bundle, database role, secrets, and auth/Realtime dashboard settings.
- Fresh and incremental SQL execution, real FK/cascade behavior, signed-photo permissions, Realtime revocation timing, concurrent RSVP/send/moderation outcomes, and the raw array representation in hosted export.
- Real email confirmation/recovery/OAuth, two-device session changes, mobile layout/keyboard/photo selection, browser console errors, installation and offline behavior.
- Provider delivery, scheduled reminders/cleanup, Auth bans, subscription cancellation and full account deletion. The historical report's 64 passing mocked tests is not evidence these work live or the current checkout has passed them.

## Manual test script for later authorized execution

Use two disposable real accounts A and B in separate browser profiles, with separate inboxes. Keep Network/Console open, preserve request IDs/statuses, and record actual responses without publishing tokens. Start as non-admins. An existing operator/admin may prepare the capacity fixture and later moderate; alternatively temporarily grant A administrator access after non-admin tests. Self-verification approval needs another administrator and cannot honestly be tested with only one admin.

Do not execute these steps during this review. Resolve the release/schema mismatch first.

| Step | Action | Expected result |
|---|---|---|
| 1 | In a signed-out browser open `/app/matches`; call a private API without a token, then with an invalid token. | UI redirects to login; private API returns 401, no member data. Public events/profile-photo URLs remain intentionally public. |
| 2 | Register A and B, confirm each inbox link, then sign in. Try login before confirmation when confirmation is enabled. | Correct inbox/account confirmed; unconfirmed account cannot obtain the configured authenticated flow; each account proceeds to its own onboarding. |
| 3 | Complete both profiles with adult birthdates, compatible reciprocal gender/age preferences, same city and a common sport. Upload, reorder, save, reload photos. Try an under-18 birthdate. | Each profile persists separately; invalid age rejected by current `/api/me`; main-photo order survives refresh. Other member's public response contains age, no birthdate/email. |
| 4 | Search Discover with filters that include each other; test empty city, then restore. | Both appear when eligible; empty result differs from an API error. No fake match or random profile is substituted. |
| 5 | A likes B; B then likes A. Repeat each request once. | First like alone creates no match; reciprocal like creates exactly one pair. Repeats do not duplicate the match. Record match ID M. |
| 6 | Open M on both devices. Send text and photo both ways, retry one simulated lost response, load older messages, hide B's tab then show it. | One persisted bubble per client identity; correct ordering/paging; photo displays; visible incoming messages receive receipts; hidden tab does not falsely acknowledge. No 42703/missing-table or permission errors. |
| 7 | Before joining any session, B requests its event chat; try an unrelated/nonexistent match ID and try deleting A's profile photo as B. Test private APIs with no bearer. | Event chat denied 403; unavailable match/chat/image endpoint denied 404; photo DELETE denied 403; missing bearer denied 401. Knowing a public profile-photo URL still permits public GET. For a real third-party existing conversation, an operator must supply a fixture ID; a nonexistent ID alone does not prove unrelated-member isolation. |
| 8 | Unmatch M from A while B has it open; B refreshes and attempts text/photo/receipt operations. | Match removed from both lists; old private requests denied; no new message in M. Previously issued photo URLs may work until expiry. Unmatch disables both reciprocal likes. |
| 9 | To exercise blocking on a fresh match, re-like each other through authenticated `/api/swipes` requests using the known member IDs if UI no longer presents the pair; record the new match. A blocks B while B's chat is open. | Pair disappears from discovery/matches; old chat/attachment/API access denied in both directions; in-flight send ordering agrees with the shared pair lock. New Realtime join denied; record whether existing socket stops receiving signals. |
| 10 | A opens Settings → blocked accounts and removes A's block. Both like again. B reports A with a valid reason and details. | Unblock affects only A's own block; no old conversation resurrects. Report persists with B as reporter and also blocks/ends the current match. |
| 11 | As a non-admin, call all `/api/admin` sections and try to submit a moderation action; modify only frontend admin state if desired. | Server returns 403 regardless of UI/storage flags. No reports, selfies, member search, or audit data disclosed. |
| 12 | Operator/admin opens the report, reviews/dismisses it with a note, warns A, suspends A, then restores A. If only A/B are available, first have A report B after clearing B's block, then grant A admin and moderate B. | Review actor/time/resolution recorded; warning scoped to target; suspended account denied protected actions and excluded from discovery/matches. Test upload explicitly: current code has a suspension gap. Auth-ban failure returns a warning, never removes database suspension. Restore re-enables allowed workflows. |
| 13 | A hosts a future event with capacity 2; hosting auto-RSVPs A. B sends two concurrent join requests from two tabs; repeat join after full, then try a host capacity reduction below attendance. | At most one B RSVP; going count stays 2; repeated B join is idempotent. Invalid capacity edit rejected (validation rejects values below 2; capacity below valid existing attendance is 409). |
| 14 | For a genuine distinct-user final-seat race, use an existing operator-hosted capacity-2 event with that host already RSVP'd. A and B, neither enrolled, submit join simultaneously. | Exactly one new distinct RSVP succeeds; loser receives 409; total remains 2. Without this third host fixture, the two-account duplicate-request test in step 13 is not a complete distinct-member race test. |
| 15 | Joined attendee opens event chat, leaves, and retries. Separately, start a deliberately delayed POST, then have host cancel or remove eligibility before completing it. Suspend host with an attendee's chat open. | Fresh requests after leave/cancel are denied; messages hidden from mutually blocked attendees. Record current in-flight and suspended-host findings rather than marking those paths passed. |
| 16 | On B, request export pages, including profile/attachments; compare ownership. Try arbitrary section names and another user's identifiers. | Only B-owned/participant records; no private verification key, push auth secret, or reports about B written by A. Invalid sections rejected. Profile export must complete despite raw array handling; record failure if reproduced. |
| 17 | Enable push on a supported device if configured. Simulate a failing subscription DELETE and choose Log out; restore connectivity and repeat. Also sign out in another tab and switch accounts. | Acceptance target: tokens/local state cleared and protected pages unmounted; current cleanup-dependent logout is expected to fail in the injected-error case. A's pending requests must never populate B's account. |
| 18 | Delete a disposable account with `DELETE` confirmation, then try logging in and accessing its old conversations/photos. Delete the other test account last. | Successful deletion removes Auth identity/profile and cascaded matches/messages/RSVPs; reports remain. Owned Storage objects removed; billing cancellation failure must stop false success. On cleanup/Auth failure, surface the failure and inspect remaining records before retry. Public caches cannot be retroactively revoked. |

## Activation order for a later approved release

These are future operator instructions, not actions performed or authorized by this review.

1. **Choose a consistent release and inspect applied history first.** The current checkout requires more than these two migrations and includes stopped Foundation additions. Stop release activation until that mismatch is resolved. For the stated handler-only architecture, do not automatically apply `supabase/review/*` or the pending Foundation migration. Do not use an indiscriminate migration push against this workspace.
2. **Set core Edge secrets before deploying:** `PACEMATE_DATABASE_URL` = hosted transaction-pooler URI with correctly encoded password and a trusted role; `PACEMATE_ALLOWED_ORIGINS` = comma-separated exact frontend origins; `PACEMATE_APP_URL` = the intended frontend origin for links. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Keep `PACEMATE_LOCAL_DATABASE` unset/false in hosted environments. Never put private values into `VITE_*`.
3. **Apply base only to an empty app schema:** `supabase/migrations/20261107000000_pacemate.sql`, once. If already applied, skip it. Do not run the historical Netlify migrations.
4. **Apply community after base:** `supabase/migrations/20261107010000_community_features.sql`, once, only if absent. Verify transactional completion and preservation of existing users/data. Do not rerun either file to fix runtime errors.
5. **Configure Auth and Realtime:** enable intended email/password/confirmation settings, set Site URL and exact confirmation/recovery redirects for the frontend, configure SMTP/providers only if used, enable private Realtime and disable public-channel access. Review existing `realtime.messages` policies for broader permissive grants. Grant administrator membership only to an actual confirmed, completed profile using the operator SQL in `supabase/COMMUNITY_SETUP.md:15-28`; no frontend flag substitutes for this.
6. **Staging deployment is on hold.** The command below targets only the authorized onboarding/test project and must not be run until the hosted baseline, recovery rehearsal, migration, and checklist have separate approval: `npx --yes supabase@2.39.2 functions deploy pacemate --project-ref clwgczzpucjdguyfctcg --use-api`. Build and test locally first. The entrypoint is the generated bundle (`supabase/config.toml:3-6`); deploy only a bundle generated from the reviewed source.
7. **Publish the matching frontend** with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_API_URL`. Confirm health, database probe, stats, then the two-account test script. Basic health alone only proves the secret exists. Documentation version strings are stale: README says `stats-3`, community setup says `community-4`, current source returns `chat-5` (`index.ts:43`). Check the version expected for the chosen artifact.
8. **Optional scheduled delivery, after core acceptance:** set `RESEND_API_KEY`, `PACEMATE_EMAIL_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a random `PACEMATE_TASK_SECRET` of at least 32 characters before enabling delivery. Set Vault `pacemate_dispatch_url` and matching `pacemate_task_secret`; enable required cron/net/Vault facilities, then apply the separately reviewed `supabase/schedule-notifications.sql`. Test actual delivery and cleanup. Current `handlers/tasks.ts:25` skips message push, so the old community setup alone is not evidence that current chat-message push works; do not activate the separate send-push/webhook proposals under this single-function review.
9. **Optional billing remains disabled unless separately tested:** configure Stripe test-mode product/price/portal and secrets `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`; configure the documented signed webhook events; set `BILLING_ENABLED=true` only for the authorized test environment. Verify checkout, renewal/expiry, cancellation, duplicates and out-of-order events before any live enablement. No additional service is required for the core manual script.

No launch sign-off is implied. Record actual status/request IDs and observed results next to each test before marking it passed.
