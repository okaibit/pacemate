# Test Free and Plus without a payment provider

Stripe checkout, portal, payment sync and webhooks have been removed from the active app. Those endpoints return HTTP 410. No replacement payment provider is connected. Old subscription/payment records, immutable prices and receipt links are retained for history. Historical schema and offline money-validation helpers may still mention Stripe; they do not make network requests.

## Enable only on the test Supabase project

The existing core, community and global billing migrations must already be applied. No additional migration is needed: the existing subscriptions table stores provider `test`, a random `testplus_` reference and a 24-hour expiry. There is no charge, payment ledger insertion, billing currency, agreed amount or automatic renewal for test access.

In Authentication > Users, copy the User UID of each test account. Complete onboarding and accept the adult terms on those accounts first. Add these **Edge Function secrets** on the test project, never frontend VITE variables:

```text
PACEMATE_ENV=test
PACEMATE_TEST_PLUS_ENABLED=true
PACEMATE_TEST_PROJECT_REF=clwgczzpucjdguyfctcg
PACEMATE_TEST_PLUS_USERS=REPLACE_WITH_YOUR_TEST_USER_UID
```

Multiple UIDs may be comma-separated. `SUPABASE_URL` must exactly match the declared project ref. Missing flags, a production environment, mismatched project or an unlisted account disables test access even if a temporary subscription record still exists. Existing paid subscription records cannot be replaced using these controls. Do not copy these test secrets into production.

Deploy the current backend to your test project from the repository root:

```sh
npm run backend:build
npx --yes supabase@2.39.2 functions deploy pacemate --project-ref clwgczzpucjdguyfctcg --use-api
npm run dev
```

The frontend must use this same test project. Hosted secrets, database execution and deployment have not been performed by the agent.

## Check in the app

1. Log into an allowlisted account and open Profile > Explore Plus.
2. Find Test membership and select Try Plus. The server confirms a temporary entitlement; the UI labels it Test Plus and shows its expiry.
3. Confirm liker profiles are accessible; an account with no incoming likes will show an empty list. Use a second test account to send a like first.
4. Add upcoming destinations. Five is the total, including an existing primary trip. A sixth is rejected by the existing server and database guards.
5. Select Use Free. Liker profiles must be locked, while the like count remains visible. Free accounts can add or replace one primary destination in the same travel form. Existing extra trip records remain after downgrade; adding another destination is blocked until they are within the Free limit. Likes, matches, messages and profiles are preserved.
6. Confirm an unlisted account has no Test membership panel and POST /api/billing/test-access returns 403. Requests without authentication return 401. A body containing userId, expiry or price overrides returns 422.
7. Change PACEMATE_TEST_PLUS_ENABLED to false. Previously granted test access must no longer unlock liker profiles or extra travel cities. This is the immediate kill switch. For cleanup, use Free before disabling it if desired; no data deletion is required.
8. Confirm checkout redirects and old webhook deliveries never grant membership. Payments unavailable is the expected purchase-button state.

Expiry, disabled/production gates, project/account checks, authenticated ownership, paid-record preservation and Free/Plus toggles have automated offline tests. Real database triggers and browser flows still need verification on this test project.

## Free travel

Free members use PUT /api/trips/primary to save or replace their profile's existing next_city/next_arrival fields, and POST /api/trips/dismiss to clear them. GET /api/trips includes that primary destination in the displayed list and total. The server locks the profile before counting additional saved cities; members with other upcoming destinations cannot add a new primary slot above the Free limit. The existing profile-save path also checks this limit. Plus POST /api/trips continues to enforce five total upcoming cities. No new table or migration is needed. Deploy the updated backend before testing this form.

## Removing old provider configuration

Remove obsolete STRIPE_* secrets and BILLING_ENABLED from the test project's Edge Function secrets. Old Stripe webhook destinations may also be disabled in the provider dashboard. The app does not call that provider anymore. Historical externally managed subscriptions are not automatically cancelled by disconnecting the integration. Account deletion is blocked for uncancelled historical provider subscriptions so that deletion cannot silently leave an external renewal running.

## Production

Do not enable these test controls. All real checkout remains unavailable until a separately approved provider is integrated and verified. This test mode verifies entitlements, not payments, renewals, refunds, receipts or real cancellation.
