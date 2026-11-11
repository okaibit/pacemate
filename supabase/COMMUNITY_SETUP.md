> Billing update: Stripe is disconnected. Use [TEST_PLUS_SETUP.md](TEST_PLUS_SETUP.md) for allowlisted test memberships. Older payment-provider instructions below are historical.

# Activate the community features

> **Staging hold:** This is a historical setup guide, not authorization to change the hosted project. The authorized ref `clwgczzpucjdguyfctcg` is the onboarding/test project. Its hosted schema and migration ledger must be reconciled first. Do not run the SQL below or deploy from this guide until the staging checklist and migration baseline are approved.

The new code is built locally. Your hosted database and deployed function have not been changed automatically. Apply these steps in order; do not rerun the original database migration.

## 1. Historical incremental migration (do not run until approved)

In the existing project's SQL Editor, run the complete contents of:

`supabase/migrations/20261107010000_community_features.sql`

It adds moderation, verification, notifications, private chat media, session chat, premium entitlements, city coordinates and private Realtime policies. Existing profiles and the 87 seeded sessions remain intact. The migration is transactional and intended to run once.

## 2. Grant administrator access

Create and confirm the account you will use for moderation, and finish its profile. In SQL Editor, run the following with the administrator's actual email:

```sql
INSERT INTO public.app_admins(user_id)
SELECT p.id
FROM public.profiles p JOIN auth.users u ON u.id::text=p.id
WHERE lower(u.email)=lower('trypacemate@gmail.com')
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT DO NOTHING;

SELECT p.id,p.name
FROM public.app_admins a JOIN public.profiles p ON p.id=a.user_id;
```

If no rows appear, check the account's email, confirmation and completed profile. Roles cannot be granted through profile fields, request bodies, email metadata or browser storage. Refresh the app after granting access; **Admin** appears in the header. Only another administrator can approve an administrator's own photo verification.

## 3. Deploy

```sh
npm ci
npm run backend:build
npx --yes supabase@2.39.2 functions deploy pacemate --project-ref clwgczzpucjdguyfctcg --use-api
npm run dev
```

Stop any existing Vite process with Ctrl+C before starting it again. The development server now keeps port 5173 fixed so it cannot silently move to an origin rejected by the API.

Keep CLI version 2.39.2 on the Big Sur Mac. The deployed health response should show `version: "community-4"`.

For production frontend hosting, run `npm run build` and publish `dist` to your static host. Service workers require HTTPS in production; localhost works for development. The app does not cache authenticated API data or private photos for offline use.

## 4. Realtime

In Supabase's Realtime settings, enable Realtime and restrict access to private channels (disable **Allow public access**). The migration creates a SELECT policy on `realtime.messages` limited to the verified user's active matches and joined/hosted sessions. Clients have no broadcast INSERT policy.

Message/receipt triggers send change signals only. Message text and signed photo URLs are fetched through the authenticated API. Unmatching/blocking closes access; a previously issued photo URL expires within one minute. When WebSocket transport is unavailable, chats fall back to a 15-second refresh. Inspect the browser Network tab for a `101` WebSocket handshake and a successful `phx_join` reply.

Verification selfies are private and manually reviewed against the submitted profile photos. This is a photo comparison, not a legal identity or background check. Changing profile photos removes the badge. Reviewed/withdrawn selfies are deleted immediately or by scheduled cleanup; abandoned requests expire after 30 days.

## 5. Email and push delivery

In-app notifications work without an external email or push provider. External delivery is opt-in; every email preference starts off. New match/message alerts avoid including message text. Session changes, cancellation notices, one-hour reminders and local-time streak reminders are queued in the same inbox.

Set these Edge Function secrets when ready:

| Secret | Purpose |
|---|---|
| `PACEMATE_APP_URL` | Your frontend origin, such as `https://pacematess.netlify.app` |
| `RESEND_API_KEY` | Transactional email provider key |
| `PACEMATE_EMAIL_FROM` | A sender on a domain verified with Resend |
| `VAPID_PUBLIC_KEY` | Browser push public key |
| `VAPID_PRIVATE_KEY` | Browser push private key |
| `PACEMATE_TASK_SECRET` | Random secret, at least 32 characters, for scheduled delivery |

The Gmail support address is a reply-to address. It does not automatically authorize Resend to send from Gmail. Configure a verified sending domain before enabling email delivery. Resend integration uses idempotency keys to avoid duplicate email when a request is retried.

Generate a VAPID key pair with the official Web Push tooling from a terminal that can install packages:

```sh
npx --yes web-push@3.6.7 generate-vapid-keys
```

Store the private key only in Supabase secrets. Settings exposes only the public key. Users explicitly allow notifications in their browser and select **Enable**. Some mobile browsers require installing the PWA before enabling push.

### Schedule the dispatcher

The protected endpoint is `POST https://clwgczzpucjdguyfctcg.supabase.co/functions/v1/pacemate/api/tasks/dispatch`. It requires the `x-task-secret` header to match the Edge Function secret `PACEMATE_TASK_SECRET` (minimum 32 characters).

For the current test project, the repository includes `.github/workflows/notification-dispatch.yml`, which can call this endpoint every five minutes. Configure the same generated secret as a GitHub Actions repository secret named `PACEMATE_TASK_SECRET` and as a Supabase Edge Function secret. Run the workflow manually to verify it. Scheduled runs stay disabled until the GitHub Actions repository variable `PACEMATE_NOTIFICATION_DISPATCH_ENABLED` is set to `true`; set it only after the manual run succeeds. Scheduled GitHub runs may be delayed, so they are not a real-time guarantee.

Alternatively, an approved database scheduler can use Supabase `pg_cron`, `pg_net` and Vault. Create Vault secrets named `pacemate_dispatch_url` and `pacemate_task_secret`, then run `supabase/schedule-notifications.sql` only after separately reviewing and approving the hosted SQL change. Do not enable both schedulers, since they can create unnecessary competing work.

The dispatcher processes up to three notifications per run, leases claimed work, retries temporary failures at most five times per channel, and expires pending delivery after 24 hours. Increase throughput only after checking provider limits and function runtime logs.

Without a recurring scheduler, in-app notifications still work, and immediate social push is attempted in the Edge Function background. Email, timed reminders, periodic cleanup and automatic retries of failed queued deliveries are not guaranteed.

## 6. Optional billing

Billing remains disabled and no prices are invented. Existing likes remain unlimited for free. The optional subscription unlocks the **Likes you** discovery filter and up to five additional travel plans.

Billing is not integrated. Checkout, portal, cancellation, payment synchronization, and webhook routes are disabled. The regional pricing and Stripe instructions are historical proposals only; do not apply their migrations or configure Stripe for the current staging release. See [GLOBAL_BILLING_REPORT.md](../GLOBAL_BILLING_REPORT.md).

## 7. City and distance discovery

City search is available for every city name. Radius filters use city centres, never GPS or a home address. Common city coordinates are seeded in the migration; profiles in cities without coordinates are omitted from radius results.

Additional lookup is disabled unless `PACEMATE_GEOCODING_URL` is explicitly configured with a Nominatim-compatible provider. Choose a provider deliberately; do not enable a public endpoint without checking its terms and capacity. The public OpenStreetMap Nominatim service requires at most one request per second across the entire application, cached results, identification, attribution and no autocomplete or systematic bulk lookup: https://operations.osmfoundation.org/policies/nominatim/ . The app provides a shared database rate gate and caching, but a commercial provider is preferable when usage grows. No default requests are sent to the public Nominatim service.

## 8. Acceptance checks

Use two disposable member accounts and a separate administrator account. Check:

- Report → administrator review → warn/suspend/restore/remove photo → audit history.
- Pending private selfie → approved/rejected → badge → photo change invalidates badge. A member cannot approve their own request or read another selfie.
- Text and photo chat; reconnect; a conversation longer than 100 messages; receipts only after visible messages are acknowledged. Unrelated members must receive 404.
- Session edit and cancellation notifications; concurrent RSVP at the last place; host/attendee-only group chat; leave then verify chat access is denied.
- Arrival prompt accepts or dismisses a recent trip; accepting updates current city. Premium extra plans obey the server's entitlement and five-plan cap.
- Notifications are user-scoped; browser denial is handled; opted-out users receive no external messages; provider failure/retry does not duplicate email.
- Download export with multiple pages; no other member's private records or reports about the requester are included. Photo links are included; private attachment links expire after one hour.
- Install the app on supported devices; offline view requests reconnection; logout removes this browser's push subscription.
- Stripe test-mode checkout/webhooks, if billing is configured.

Automated tests use simulated services/SQL responses. A passing build and unit suite do not establish that the new SQL, scheduled delivery, Realtime, external providers or payments work in your hosted project. Complete the checks above after deployment before launch.
