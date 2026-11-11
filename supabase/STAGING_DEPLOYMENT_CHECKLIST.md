# Staging deployment checklist

## Target and current boundary

The authorized project ref is `clwgczzpucjdguyfctcg`. It is the onboarding/test project and is not confirmed production. This file is a plan, not authorization to change hosted state. No database migration, secret update, or deployment is approved by this checklist alone.

The hosted migration ledger was reported empty while the database already contains application objects. Do not replay historical canonical migrations, run `db push`, repair the ledger, or follow older setup commands until the baseline has been reconciled and separately approved.

## Gates before any hosted change

- Confirm the target project in the dashboard and in any command before running it.
- Capture read-only schema evidence for the migration preflight: columns, constraints, index definitions and validity, inbound foreign keys to `swipes`, canonical match pairs, message relationships, check constraints, trigger state, and full trigger-function body.
- Reconcile the empty migration ledger. Do not mark historical migrations applied unless object-by-object evidence supports that exact history. Do not replay historical migrations against the populated project.
- Verify a recent usable database backup/export, restore information, and a tested restore path. Include Storage objects separately because database backups do not restore them.
- Verify hosted RLS, grants, Storage bucket privacy/policies, Realtime membership, notification triggers/functions, webhook configuration, scheduled jobs, and deployed Edge Function versions.
- For notification delivery, verify provider secret names and choose one dispatcher: the existing SQL scheduler (requires hosted `pg_cron`, `pg_net`, Vault and an approved SQL setup), or the repository's external GitHub Actions scheduler (requires the same `PACEMATE_TASK_SECRET` in Supabase and GitHub Actions). Do not configure both schedules.
- Review required secret names and purpose without printing or copying secret values into Git. Billing is not integrated; do not configure Stripe or run billing proposals.
- Approve a maintenance window and pause all swipe writes before the uniqueness cutover. Ensure the old backend cannot accept swipe requests during the migration.

## Controlled release order

1. Complete the gates above and approve a reconciled migration baseline.
2. Review the Phase 1 migration against the exact hosted catalog. Resolve every mismatch with a separately reviewed forward migration; do not guess.
3. Rehearse the reviewed migration on an isolated restore/clone. Confirm existing match, conversation, message, attachment and reply IDs remain intact; legacy intentions remain NULL; all conversations still map to their match; and new swipe identity values and sequence ownership are correct.
4. Pause swipe traffic and apply only the separately approved migration to the authorized staging project.
5. Validate constraints/indexes and generated identity sequence state before enabling writes. Test concurrent reciprocal likes and separate Play/Friend/Date connections.
6. Build and deploy the matching backend bundle to the explicit staging ref. Verify backend health, auth, chat membership, archived reads, block/unmatch behavior, attachment authorization, notifications, and Plus test entitlement.
7. Deploy the matching frontend only after backend smoke tests pass. Test onboarding and two-account flows on real browsers/devices.
8. Verify notification delivery and suppression for active, ended, blocked, muted, read, and stale queued events. Confirm webhook/scheduler targets use this staging ref.
9. Reopen swipe traffic only after acceptance checks pass and monitoring is available.

## Notification dispatcher status

The authorized test project was inspected read-only. `pg_cron` and `pg_net` are not installed, `vault.secrets` returned no rows, and no database trigger matching push/webhook names was found. The deployed function listing showed `pacemate` version 18 and no separate `send-push` function. The project does have VAPID secret names configured. These facts do not establish whether an external scheduler already exists.

The local code has a protected `POST /api/tasks/dispatch` endpoint. The repository's GitHub Actions workflow is scheduled every five minutes and can also be run manually. Scheduled runs remain disabled unless the GitHub Actions repository variable `PACEMATE_NOTIFICATION_DISPATCH_ENABLED` is set to `true`. Manual runs require the same strong `PACEMATE_TASK_SECRET` to be configured as a Supabase Edge Function secret and a GitHub Actions repository secret. Configure the secrets only after the backend deployment is approved. Test a manual run first; enable the repository variable only after it succeeds. Do not put secret values in files, SQL, workflow logs, or chat.

The dispatcher also sends email only when `RESEND_API_KEY` and `PACEMATE_EMAIL_FROM` are configured. Push delivery requires VAPID keys and user subscriptions/preferences. Missing email credentials do not disable in-app notifications or push.

The workflow uses a five-minute cadence. GitHub scheduled runs can be delayed, so it is not a hard real-time guarantee. The app's direct social push path remains best-effort; the scheduled dispatcher retries queued notifications. Verify response status, delivery state, retry behavior, and reminder timing in staging before relying on it.

## Recovery and rollback

Before intention-specific records are created, recovery still requires a reviewed forward fix or a restore. After such records exist, pair-only uniqueness cannot safely be restored by merging or deleting connections. Prefer a forward fix. A restore may discard later database writes and cause downtime; use only the separately approved recovery plan. Restore Storage objects through their own verified procedure.

## Billing status

Billing is not integrated. Test Plus is an allowlisted temporary entitlement, not payment processing. Checkout, portal, cancellation, synchronization, and payment webhook routes are disabled. Do not enable payment settings or run billing migrations as part of this staging release.
