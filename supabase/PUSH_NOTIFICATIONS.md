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
VAPID_SUBJECT=mailto:trypacemate@gmail.com node scripts/setup-push-secrets.mjs hgnxappuulufvdymodad
```

Set `SUPABASE_CLI` to a working CLI path if necessary. The script generates a P-256 VAPID pair, uploads `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `PUSH_WEBHOOK_SECRET` through a temporary mode-0600 file, then deletes that file. It never prints the private key. It prints only the public key, which can be set as `VITE_VAPID_PUBLIC_KEY`. Existing `/api/settings` also returns the Edge secret public key. The temporary plaintext private key is only in the OS temporary directory during upload; it is never in source or the browser bundle.

Copy the shared webhook token from the ignored local `.env.push-webhook` file into Dashboard Vault as `push_webhook_secret`, then delete that local file. Add `push_function_url` to Vault with `https://hgnxappuulufvdymodad.supabase.co/functions/v1/send-push`. Never put the service-role key in a webhook header. The function explicitly verifies `x-push-secret`; gateway JWT verification is disabled for this webhook.

```sh
npx supabase@2.39.2 functions deploy send-push --project-ref hgnxappuulufvdymodad --use-api
npx supabase@2.39.2 functions deploy pacemate --project-ref hgnxappuulufvdymodad --use-api
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
