# Current message and match notifications

> **Staging hold:** This file describes local implementation and historical setup procedures. Hosted triggers, Vault values, schedules, and deployed function versions are not verified. Do not run its SQL, upload secrets, or deploy until the staging checklist is approved. The only approved ref is `clwgczzpucjdguyfctcg`.

All new text, link and photo messages use the authenticated message API, which queues delivery after commit. Previously, plain text/link inserts went directly through REST and bypassed that queue. The PaceMate match-chat flow now sends Web Push immediately in an EdgeRuntime background task after a message or mutual match commits. It reuses the existing notifications outbox and delivery states. No new SQL, Database Webhook or external notification provider is required for this path.

Subscriptions are registered through authenticated /api/notifications/push, which saves the device and sets notification_settings.push_enabled. Subscription status and removal are owner-scoped. A known endpoint cannot be reassigned to another user. Free and Plus members have the same notification access.

Before sending, the backend rechecks the match, blocks, suspensions, read state and any existing pair-conversation mute. Notification payloads use generic message/match text, not private message contents. Only validated browser-vendor endpoints are contacted; expired subscriptions are removed. Outbox claims prevent competing workers from dispatching the same pending record at once. Partial push-provider failures may cause a repeated notification on retry; tags collapse matching notifications, but delivery is not exactly-once.

## Test project setup

Existing push-related secret names were checked before adding configuration. If VAPID keys already exist, reuse them; rotating keys invalidates subscriptions.

For a project with no existing keys:

```sh
VAPID_SUBJECT=mailto:trypacemate@gmail.com node scripts/setup-push-secrets.mjs clwgczzpucjdguyfctcg --social-only
```

This uploads VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT through a temporary restricted file that is removed afterwards. Only the public key may be printed. No frontend variable is required: /api/settings supplies the public key. Deploy pacemate and publish the frontend using the established preview workflow.

Open Profile > Settings > Message and match notifications > Enable. Permission is requested only after a tap. On iPhone/iPad, first add PaceMate to the Home Screen and launch it there (iOS/iPadOS 16.4+). OS notification permissions and Focus settings control whether alerts are shown.

Use Settings > Notifications > Send test notification to check the OS delivery path. The authenticated, rate-limited endpoint sends only to the signed-in account’s saved devices. Provider acceptance does not prove the OS displayed the alert.

The foreground app listens to authenticated Postgres Changes on messages using existing row-level membership policies. It re-fetches the owner-scoped inbox and badges; it does not trust Broadcast payloads on this channel. Polling remains a five-second fallback. Acknowledging a message clears its matching inbox alert, and the currently open conversation does not show a duplicate in-app banner.

Verify on two real phones/accounts: enable, background the recipient app, send a message, confirm lock-screen delivery and open the conversation from it. Test a new mutual match, permission denial, disabling this device, blocked/unmatched pairs and logout. A physical-device delivery has not been verified by automated tests.

Immediate background work can be interrupted by runtime or vendor failures. Failed deliveries remain pending. The existing authenticated dispatcher can retry them if the previously documented notification cron is configured; without that schedule, automatic retries are not guaranteed. Enabling the optional cron/Vault schedule requires running the reviewed schedule-notifications.sql manually; it was not executed by this agent.

The older direct-conversation webhook implementation below remains separate. It is not needed to enable notifications for the current Matches chat flow.

---

# Message web push

Implementation uses the existing auth client and Supabase REST/Realtime. `web-push` is an encryption/VAPID library running inside the Edge Function, not a hosted push service. Delivery goes directly to browser vendor endpoints.

## SQL to review first

Nothing in `supabase/review` runs automatically. In this order:

1. Apply the existing direct-chat SQL described in `DIRECT_CHAT.md` if not already applied.
2. Review and apply `review/20261107030000_chat_push.sql`. The existing community migration already creates `push_subscriptions`; this adds `user_agent` and owner-only SELECT/INSERT/DELETE policies. No client UPDATE permission. `conversation_members` permits users to change only their own mute timestamp, with active chat membership required. Check for pre-existing permissive policies before applying: PostgreSQL combines permissive policies with OR.
3. After secrets and deployment below, review/apply `review/20261107030100_chat_push_webhook.sql`. This creates an asynchronous pg_net Database Webhook for messages INSERT, passing only the message ID. Do not also create a Dashboard webhook for the same event.

## Secrets and deployment

This workspace could not upload secrets: the usable cached Supabase CLI has no access token. The latest cached CLI is incompatible with this Mac. Generated keys from failed uploads were discarded, never added to the app.

On an authenticated machine, run once (rotating VAPID keys invalidates existing subscriptions):

```sh
npx supabase@2.39.2 login
VAPID_SUBJECT=mailto:trypacemate@gmail.com node scripts/setup-push-secrets.mjs clwgczzpucjdguyfctcg
```

Set `SUPABASE_CLI` to a working CLI path if necessary. The script generates a P-256 VAPID pair, uploads `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `PUSH_WEBHOOK_SECRET` through a temporary mode-0600 file, then deletes that file. It never prints the private key. It prints only the public key, which can be set as `VITE_VAPID_PUBLIC_KEY`. Existing `/api/settings` also returns the Edge secret public key. The temporary plaintext private key is only in the OS temporary directory during upload; it is never in source or the browser bundle.

Copy the shared webhook token from the ignored local `.env.push-webhook` file into Dashboard Vault as `push_webhook_secret`, then delete that local file. Add `push_function_url` to Vault with `https://clwgczzpucjdguyfctcg.supabase.co/functions/v1/send-push`. Never put the service-role key in a webhook header. The function explicitly verifies `x-push-secret`; gateway JWT verification is disabled for this webhook.

```sh
npx supabase@2.39.2 functions deploy send-push --project-ref clwgczzpucjdguyfctcg --use-api
npx supabase@2.39.2 functions deploy pacemate --project-ref clwgczzpucjdguyfctcg --use-api
npm run build
```

Deploy the client build using the existing hosting process. Redeploying `pacemate` is necessary: its scheduled dispatcher now skips message pushes so it cannot duplicate or bypass the dedicated function. Email and other notification kinds keep the existing dispatcher.

## Behavior and verification

- Permission is requested only after Enable. The soft prompt appears after saved chat activity or a nonzero incoming unread badge, never just because the page loaded. It can also be enabled in Settings. Settings reflects this device's subscription; other devices keep their subscriptions.
- Payloads contain a bounded sender name, conversation ID, and fixed text: `Sent a message`, `Shared a link`, or `Shared a photo`. Raw message bodies, photos and link metadata never enter a push payload.
- The service worker uses `chat-ID` tags to replace displayed notifications. Clicks navigate to `/chat/:conversationId`, which resolves to the existing authenticated chat route. Offline navigation uses the existing offline page; private data is never cached.
- Chat mounts track the current visible conversation in private Realtime `push:USER_ID` presence. Hidden tabs update visible=false; leaving removes presence. The function joins the recipient's channel and inspects synchronized presence before sending. Multiple tabs/devices are supported. Presence check times out after 1.5 seconds and allows delivery on failure; it is best effort, so opening a chat concurrently with delivery can still produce a notification.
- Mute/unmute stores `muted_until` per user/conversation. Mute is indefinite until unmuted. The server checks mute, blocks, suspension, read state and age before sending.
- A 404/410 deletes the subscription. Other push errors return 502. pg_net does not provide automatic retries; inspect `net._http_response`/function logs for failed deliveries. Notification tags collapse repeats but are not a durable webhook deduplication mechanism.
- Only known browser push service domains are accepted for outbound delivery, preventing arbitrary stored URLs from being fetched. Add explicit vendor domains if supporting additional push providers.
- On logout, subscription deletion completes before auth is cleared. Failure is displayed so cleanup can be retried. Account deletion disables this device first.
- On iOS 16.4+, use Safari Share → Add to Home Screen, launch the installed app, then Enable. HTTPS is required outside localhost. Manifest includes 192/512 PNG icons.

Local checks: `npm run build`, `npm test`. New service-worker tests cover deep links, notification tags, malformed payloads and external navigation rejection. Hosted SQL/RLS, Edge runtime and real browser push require staging verification after setup. Test with two real accounts: first activity/Enable, background push, foreground suppression, hidden-tab delivery, mute/unmute, two devices, logout, and expired endpoint deletion. Also verify authenticated user A cannot SELECT/DELETE B's subscriptions or INSERT with B's user_id, and anonymous access is denied. Verify third parties cannot join another user's private presence topic or mutate their mute settings.

References: [Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Edge secrets](https://supabase.com/docs/guides/functions/secrets).
