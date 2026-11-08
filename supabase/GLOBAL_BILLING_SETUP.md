> Current status: Stripe has been disconnected. The provider setup below is historical. Use [test membership setup](TEST_PLUS_SETUP.md) to test Free and Plus without payments. No real checkout is available.

# Global billing deployment checklist

**Pricing update:** The user subsequently approved weekly/monthly/annual v2 prices. The earlier launch amounts below are historical. Follow [PLUS_PRICING_V2.md](PLUS_PRICING_V2.md) and the incremental v2 migration for new sales; preserve existing contracts.

Prepared 2026-11-08. No application account, payment-provider account or hosted database was inspected or changed. The migration is not applied. Do not treat a local build or mocked integration test as live verification.

## Schema and existing subscribers

Apply `migrations/20261108010000_global_billing.sql` once, in a separately authorized staging environment, after the existing core, community and Foundation migrations. It extends the existing subscription, profile, checkout and travel tables, and adds only billing preferences, versioned regional prices and a payment ledger. Verify rollback, privileges, row locking and triggers on PostgreSQL before production. This migration is intentionally not marked idempotent; use the migration tracking system rather than rerunning it.

Existing records are retained. Old subscriptions initially have no verified paid-through ledger or locked amount. Before directing existing subscribers to the new entitlement system:

1. Back up the existing billing customer and subscription rows.
2. Create an approved regional price record matching each legacy subscription's actual Stripe price, interval, amount and currency. Keep legacy-only prices inactive for new sales. Do not map an old subscription to a different price merely to match launch pricing.
3. Use authenticated `POST /api/billing/sync` for each existing account, or exercise its “Verify existing subscription” button. This retrieves and verifies the original price, latest invoice and charge before locking the contract. Legacy records do not require retroactively adding application metadata to Stripe subscriptions.
4. Confirm the subscriber's original amount, currency, renewal date, paid-through period and entitlements. A legacy discounted, tax-adjusted or unsupported interval invoice will fail closed and needs explicit reconciliation before rollout. Status-only legacy rows are not evidence of payment.
5. Historical payments predating this migration are not bulk imported automatically. Import/reconcile them from Stripe with original amounts and references if complete pre-migration history is required; use Stripe's billing portal for the provider's complete invoice archive meanwhile.

Do not deploy the new backend before the schema and existing subscribers are ready. Existing free profiles, likes, matches, messages and travel records are not deleted by the migration or a downgrade.

## Server configuration

Use separate Supabase projects/databases and Stripe credentials for staging and production. Customer IDs and subscription rows in the existing architecture belong to one Stripe environment per database; do not flip a populated test database into live mode.

Set these as Edge Function secrets, never `VITE_*` variables:

| Variable | Required configuration |
| --- | --- |
| `PACEMATE_DATABASE_URL` | Existing server-only PostgreSQL connection; the documented `postgres` role can execute the entitlement function. Grant the function explicitly if using a different server role. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase-provided backend identity verification and administration credentials. |
| `STRIPE_MODE` | Exactly `test` or `live`. |
| `STRIPE_SECRET_KEY` | Matching `sk_test_…` or `sk_live_…` secret. |
| `STRIPE_WEBHOOK_SECRET` | Secret for this environment's webhook destination. |
| `STRIPE_MARKETS` | Comma-separated ISO country codes individually verified for this merchant account, such as `US`; do not enable every geographical country. |
| `BILLING_ENABLED` | Keep `false` until that environment passes sandbox/live readiness checks. |
| `PACEMATE_APP_URL` | Actual frontend origin used for return navigation. |
| `PACEMATE_ALLOWED_ORIGINS` | Exact allowed frontend origins. |

`STRIPE_PRICE_ID` is no longer the source of subscription pricing. `regional_prices` owns the configured market, approved ISO minor-unit amount, interval, environment, effective dates and provider price ID. A missing, inactive, incorrect or wrong-environment Stripe price cannot be purchased. No FX service is used.

## Approved launch prices

Create one Plus product and four recurring Prices in Stripe test mode, and later their separately verified live counterparts:

| Market | Interval | Currency | ISO minor units | Full charge |
| --- | --- | --- | --- | --- |
| Nigeria (`NG`) | month | NGN | 150000 | ₦1,500 |
| Nigeria (`NG`) | year | NGN | 1200000 | ₦12,000 |
| United States (`US`) | month | USD | 299 | $2.99 |
| United States (`US`) | year | USD | 2499 | $24.99 |

The migration seeds these approved amounts for both environments, with null provider IDs. Bind each correct Stripe price ID to its matching regional row after verification. No other market has an invented price or USD fallback. A price becoming effective later affects only new checkout offers. Once a provider price is bound, use a new row/version for changed economic terms. Retain old versions for historical reconciliation.

A displayed currency is not proof that Stripe accepts charges in it. Explicitly verify merchant-account eligibility, presentment currency, recurring payment method, minimum amount and the actual checkout flow for each enabled market. Nigeria's geographical availability is not a claim that this merchant account supports NGN recurring checkout. If it does not, leave that market unavailable until an explicitly approved, verified alternative is configured. No replacement provider was introduced.

## Webhooks and customer portal

Configure the destination:

`<SUPABASE_URL>/functions/v1/pacemate/api/billing/webhook`

The API pins outbound Stripe requests to `2024-06-20`; configure and test a compatible snapshot webhook version. Register:

- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.upcoming`.
- `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.

The backend verifies signatures against the raw body and a five-minute timestamp window, retrieves the provider event, verifies environment and ownership, then retrieves authoritative subscription/invoice/charge data. It deduplicates event IDs transactionally and payment/invoice/charge/payment-intent references through unique constraints. Amounts, currencies, price IDs, quantities, periods and charge status must match. Checkout returns are checked through authenticated server synchronization, not trusted as payment evidence.

Configure the Stripe customer portal for payment methods, invoices and cancellation. **Disable subscription price/plan switching and in-place repricing.** The application does not implement a consent-based repricing workflow; existing contracts cannot change amount or currency in place. A new currency or price requires an explicitly chosen new subscription after the paid term ends. Configure Stripe's customer emails/receipts and upcoming invoice schedule. Application billing notifications are added to the existing in-app inbox; external email/push still depends on the existing notification delivery configuration and user preferences.

The current launch contract expects one recurring line, quantity one, exact approved charge, no coupons/trials/credits or extra tax lines. These adjustments fail verification rather than silently changing the agreed charge. Confirm the approved charge and any tax obligations/account settings before accepting real customers. Supporting other invoice structures requires explicit accounting/consent decisions and additional tests.

## Required staging acceptance checks

These have NOT been executed against hosted services:

1. Apply and roll back the migration on staging PostgreSQL. Inspect constraints, indexes, function permissions and RLS using ordinary member credentials as well as the server role.
2. Complete both intervals in both configured markets with Stripe test cards; verify the selected billing market, collected address and final charge currency are clearly shown. The selected market is a manual preference, not an IP/GPS-enforced residency assertion.
3. Deliver correct and tampered webhooks. Retry duplicates, replay out-of-order events and exercise parallel payment/travel requests. Check that a primary trip plus additional trips never allows adding a sixth upcoming city.
4. Test pending/action-required/failed payments, cancellation at period end, expiry, successful renewal, partial/full refunds and dispute resolution. Verify free social data and existing destinations remain intact.
5. Change display currency and country; confirm the locked billing amount/currency remains unchanged. Introduce a future regional price; confirm existing renewals retain their contract.
6. Test receipts, paginated payment history, anonymous/foreign-user access and portal navigation. Confirm annual checkout shows the full annual total.
7. Verify subscriber notifications, provider email settings, delivery failures and authenticated synchronization after a lost webhook. No automatic background reconciliation job was added; monitor webhook failures and use the authenticated sync path when needed.
8. Reconcile legacy subscribers and historical invoices before rollout. Test account deletion and billing cancellation independently.

After those checks and separate deployment authorization, build the backend with `npm run backend:build`, deploy the function to the intended project, and build/publish the frontend with `npm run build`. No deployment or real customer charge was performed during implementation.
