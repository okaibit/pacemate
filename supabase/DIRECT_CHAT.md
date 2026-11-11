# Direct chat: review and activation

> **Staging hold:** The SQL and deployment steps below are historical proposals. Do not execute or deploy them against `clwgczzpucjdguyfctcg` until the hosted schema baseline, backup/restore rehearsal, and staging checklist are approved.

The new screen replaces `/app/matches/:id` and follows the existing authentication and router guards. All frontend chat data access lives in `src/composables/useChat.js`, using the project's existing Supabase Auth REST client and authenticated Edge API. No dependencies were added. Calling and audio recording are not implemented; those icons are disabled and labelled accessibly. Camera/photo attachments and emoji selection work.

## 1. Static UI

With Vite running and a completed account signed in, visit:

`http://localhost:5173/app/matches/1?preview=1`

This development-only preview shows mock messages without writing chat data. The mock link is illustrative; the photograph is a bundled project asset. The mode is excluded from production by Vite's DEV flag. There was no screenshot attachment available during implementation; styling follows the written specification. Check the layout at 320, 390 and 430 pixels, keyboard focus, long messages, photo rendering and the mobile keyboard.

## 2. SQL for review — not applied

The standalone proposal is:

`supabase/review/20261107020000_direct_chat.sql`

It is deliberately outside `supabase/migrations`, so normal migration commands will not apply it. Review against a backup or staging database first. On your Mac, copy it for review with:

```sh
pbcopy < supabase/review/20261107020000_direct_chat.sql
```

It requires the previous original and community migrations. It adds `conversations`, extends the **existing** `messages` table and adds `message_reactions`; existing messages are not replaced. Conversation IDs equal match IDs, preserving links. Matches create conversations via a trigger; unmatching or blocking deletes the match and cascades the conversation. Members cannot create arbitrary conversations. No new RLS grants are added to profiles, matches, storage or admin tables.

RLS/privilege review:

| Action | Allowed | Denied |
|---|---|---|
| Read conversation/messages/reactions | Either active matched member | Anonymous users, third parties, suspended or blocked members |
| Insert text/link | Authenticated sender in their conversation | Spoofed sender, other conversation, forged metadata/status/read time, direct photo attachment claims |
| Change messages | Recipient can set `read_at`; trigger supplies server time | Sender setting own receipt; client editing body, IDs, metadata, timestamps or status |
| Reactions | Members read; caller adds/removes their own supported emoji | Forged user, other conversations, removing another member's reaction |
| Conversation creation/deletion | Trusted existing match lifecycle | Browser writes |
| Link metadata | Verified sender through the Edge handler | Browser-supplied metadata and enrichment of another member's message |

Table grants are revoked before narrowly granting column access. Existing messages policies are dropped because permissive policies combine with OR; inspect any custom policies before approving this replacement. Membership helpers use a fixed empty search path and only the authenticated user's ID. Trigger functions cannot be called by clients. A 30-message/minute throttle also covers direct REST inserts. Server handlers continue to enforce attachment ownership and storage access. The server database role intentionally bypasses RLS; keep its URI and service key private.

Read timestamps are backfilled from existing read cursors. New receipts synchronize legacy match cursors. The direct chat and current match list/badge queries use `read_at`; an older deployed backend using cursors can undercount older unread messages after a newer message is read. Deploy this backend alongside the migration.

**The SQL has not been executed or validated against hosted PostgreSQL here.** Review and run `supabase/review/direct_chat_rls_checks.sql` in staging after the migration. That script runs as actual `authenticated` and `anon` roles, rolls back fixtures and raises exceptions on authorization failures. It is an additional manual database check, not part of `npm test`.

## 3. Sending and Realtime

After approving and manually running the SQL:

```sh
npm run backend:build
npx --yes supabase@2.39.2 functions deploy pacemate --project-ref clwgczzpucjdguyfctcg --use-api
```

Refresh Vite. Health should return `version: "chat-5"`. Existing private Realtime policies for `match:<id>` remain in use. The migration adds `public.messages` to `supabase_realtime` publication. WebSocket joins subscribe to INSERT and UPDATE Postgres Changes with `conversation_id=eq.<id>`. PostgreSQL SELECT RLS authorizes message delivery; filters alone are not authorization. The subscription leaves on unmount. A 15-second refresh recovers missed events and reaction changes.

Send text immediately shows a local bubble. A unique sender/client UUID reconciles HTTP and Realtime results and protects retries from duplicate insertion after response loss. Photos use the existing authenticated upload/send endpoints with the same retry identity. Failed bubbles offer Retry; an abandoned uploaded file is handled by the existing cleanup job.

The initial request loads the latest 30 messages. Scrolling up fetches 30 older rows with an ID cursor and preserves scroll position. Live refresh retrieves later rows and receipt updates without using an offset.

## 4. Read receipts

Only messages intersecting the visible conversation viewport are acknowledged while the document is visible. The database assigns a trusted timestamp. Sender ticks turn blue after the UPDATE event or fallback refresh. Header unread count counts `read_at IS NULL AND sender_id != me`. Test with two browsers, a hidden tab, older unread history, a long image, and receipt changes on an outgoing message older than the latest 30.

## 5. Link previews

Preview enrichment is disabled by default. With approval to share public links with Microlink, set the Edge secret `PACEMATE_LINK_PREVIEWS=true`. Set `MICROLINK_API_KEY` if your provider plan needs it. This uses the fixed `https://api.microlink.io` endpoint; the function never fetches arbitrary user destinations or follows their redirects. It rejects local/IP URLs, non-HTTPS inputs and obvious credential-bearing URLs, bounds responses and sanitizes stored fields. The provider handles target fetching and its own network protections. Do not enable this for confidential URLs. The browser loads third-party thumbnails/logos without a Referer; plain shared links still work when previews are disabled or the provider fails.

The Edge handler reads the URL from the sender's stored message, checks active match membership, rate-limits enrichment and stores title/description/image/logo/video metadata in `link_meta`. Enabling previews affects new sends; existing unenriched messages remain plain links. Preview failure never prevents sending. No provider call was made during automated tests.

## Validation status

Run `npm test` and `npm run build`. Automated tests cover message reconciliation, grouping, safe URLs, bounded preview metadata/provider routing, and filtered subscription lifecycle, alongside the existing application checks. They do not replace hosted SQL/RLS, two-browser transport, mobile/device, screen-reader or provider acceptance testing.

Supabase references: [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
