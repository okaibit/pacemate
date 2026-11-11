# Billing integration status

**Billing is not integrated in PaceMate.** The application has no connected payment provider and cannot take real or sandbox payments.

The current backend intentionally returns HTTP 410 for checkout, portal, cancellation, payment synchronization, and payment webhook routes. Billing configuration reports payments disabled. Do not describe billing as integrated or enable payment-provider settings for staging.

The app has limited Plus entitlement code, including allowlisted test access for QA. Test Plus grants a temporary entitlement only; it does not charge a user, create a payment ledger entry, renew, refund, issue a receipt, or verify a paid subscription. It must not be presented as billing.

Local regional pricing modules and the files `supabase/migrations/20261108010000_global_billing.sql`, `supabase/migrations/20261108030000_plus_weekly_prices.sql`, and `supabase/GLOBAL_BILLING_SETUP.md` are historical or unintegrated proposals. They have not been confirmed as applied to the authorized staging database. Do not run those migrations or follow their Stripe setup instructions as part of the current staging release.

Any future billing integration requires a separate product decision, provider selection, migration and hosted-schema review, security review, sandbox testing, and explicit deployment approval.
