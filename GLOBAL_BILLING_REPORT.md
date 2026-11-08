> Current status: Stripe has been disconnected. The provider setup below is historical. Use [test membership setup](supabase/TEST_PLUS_SETUP.md) to test Free and Plus without payments. No real checkout is available.

# Global money and subscription implementation report

**Pricing update:** The user subsequently approved weekly/monthly/annual v2 prices. The earlier launch amounts below are historical. Follow [PLUS_PRICING_V2.md](supabase/PLUS_PRICING_V2.md) and the incremental v2 migration for new sales; preserve existing contracts.

Status: implementation and local validation completed; hosted migration, provider setup and live/sandbox payment verification remain outstanding. No application/payment account was contacted, no SQL executed and no deployment performed. Only public standards and Stripe documentation were consulted externally.

## 1. Architecture audited

Preserved Vue, the direct Supabase Auth HTTP client, the existing authenticated Edge Function router, parameterized PostgreSQL queries/Drizzle and Stripe hosted Checkout/Portal. Audited `handlers/billing.ts`, `trips.ts`, `discover.ts`, `swipes.ts`, profile/Foundation writes, existing schemas/migrations, entitlement helpers, export, notification infrastructure and Plus/Likes/Settings interfaces. No new dependency or payment provider was installed.

The old billing implementation had one global price ID, no durable amount/currency contract, no local payment ledger, and entitlement based on subscription status/period rather than a verified paid invoice. A separate primary-trip path could allow an additional sixth city. These are addressed in the new source and migration.

## 2. Files and components

New shared modules under `supabase/functions/pacemate/money/` contain the country registry, currency precision, integer money handling, effective regional-price selection, provider-price validation and payment/contract validation. `src/money.js` re-exports that same source for the frontend. `src/money-preferences.js` adds user-scoped local preference persistence.

The existing billing handler delegates provider synchronization to `server/billing-service.ts`. Its routes now include preferences, history, cancellation and verified synchronization. The existing Plus page, Settings, onboarding, Foundation/profile editors and Discover use the central registry/utilities. `MoneyPreferences.vue` is shared UI. No layout rebuild was performed; the existing visual identity and requested rounded profile surfaces remain.

The current workspace also contains earlier authorized OAuth, acknowledgement and profile changes. They were retained, not reset. The global billing work did not introduce a second authentication system.

## 3. Database changes

Prepared `supabase/migrations/20261108010000_global_billing.sql`, **not applied**:

- Extends existing subscriptions with plan/provider/price, country, currency, amount, interval, start, renewal, cancellation and verified paid-through fields.
- Extends existing checkout rows with selected price, environment and origin; profiles/trips gain country codes.
- Adds only three needed structures: billing preferences, versioned regional prices and a payment ledger. Country/currency reference data remains one shared code registry rather than duplicate SQL tables.
- Adds owner foreign keys, unique invoice/transaction/charge/payment-intent references, checks and indexes. Payment history intentionally does not FK to the single mutable current-subscription row, so replacing a subscription cannot rewrite or delete its older payment history. Account deletion nulls the payment owner while retaining the audit record.
- Enables RLS and denies browser roles direct access. Only authorized backend queries return a member's own records.
- Locks a subscription contract against in-place economic changes and locks bound regional price versions against rewriting their economic terms.
- Adds a shared paid-through entitlement SQL function and travel guards covering both primary and additional trip writes. No downgrade deletes data.

Static migration checks are tested. PostgreSQL execution, constraints, privileges, trigger behavior, concurrency and rollback have **not** been validated on an actual database because SQL execution was prohibited. Do not conflate the mocked SQL-driver integration tests with that validation.

## 4. Country and territory coverage

Exactly 106 requested entries across all seven product regions, each with a name, alpha-2 code, region, default currency, formatting locale, symbol and default payment-availability/pricing status. They are used in registration/onboarding location, profile editing, discovery filtering, travel destinations and regional preferences. Existing manually entered cities remain supported; unsupported checkout does not block ordinary platform use.

Known profile geography and locale-region hints can supply an initial country. Saved server preferences take priority over a new locale hint; manual choices remain available. Language without a region does not invent a country. With no hint/preference, the fallback is Nigeria/NGN. No new IP-location provider or automatic GPS request was introduced.

## 5. Currency mapping verification

Bulgaria defaults to EUR, Sierra Leone to SLE, Zimbabwe to ZWG. SLL/BGN are historical-only and never silently converted. ISO precision, locale cash formatting and Stripe's API representation are kept separate. Manual country/currency mappings were cross-checked with standards references; this is not an automatically refreshed authoritative feed.

Reference links and important qualifications are in `supabase/functions/pacemate/money/REFERENCES.md`, including SIX, ISO/Unicode CLDR, the ECB and Stripe. XCD/XPF display support does not invent additional geographical coverage. Local defaults in multi-currency countries do not assert exclusive legal tender.

## 6. Display currency support

88 current codes:

NGN, USD, GBP, EUR, GHS, ZAR, KES, EGP, MAD, XOF, XAF, CAD, MXN, BRL, ARS, CLP, COP, AUD, NZD, JPY, CNY, HKD, INR, IDR, MYR, SGD, PHP, KRW, THB, PKR, BDT, NPR, LKR, KZT, UZS, AED, SAR, QAR, KWD, BHD, OMR, JOD, ILS, LBP, TRY, CHF, DKK, NOK, SEK, PLN, CZK, HUF, RON, UAH, RSD, ISK, XCD, TTD, JMD, BBD, DOP, PAB, CRC, PEN, UYU, BWP, AOA, DZD, ETB, MUR, MZN, NAD, RWF, SLE, TND, UGX, ZMW, ZWG, XPF, CDF, LRD, MGA, TZS, GEL, TWD, VND, CUP, FJD.

The additional current currencies are needed by the requested geographical mappings. Formatter tests cover zero/two/three decimal precision, separators, negative values, unsupported codes and amounts beyond JavaScript's safe integer range. Values remain integer minor units; no floating-point FX calculation or exchange-rate API exists.

Country, product region, preferred display currency, chosen checkout market and locked billing currency are independent. A display preference can select an explicitly approved matching quote; otherwise the UI explains the original charge currency rather than inventing a converted amount. Original history and renewal currency never change when a preference or destination changes.

## 7. Regional pricing

The database is the sole production price source. Only the approved launch amounts are seeded, separately for test/live:

| Country | Monthly | Full annual charge |
| --- | --- | --- |
| Nigeria | NGN 150,000 minor units = ₦1,500 | NGN 1,200,000 minor units = ₦12,000 |
| United States | USD 299 minor units = $2.99 | USD 2,499 minor units = $24.99 |

Each row has an explicit country, currency, interval, amount, approval, active flag, effective period, environment and Stripe price reference. No other market receives a calculated or guessed price. Countries sharing a currency can have distinct independent price rows. Future versions affect new sales, not existing agreements. Annual selectors show the whole annual amount and state that it is charged annually.

Provider IDs are intentionally null in the migration. Prices can be displayed as approved amounts, but checkout stays disabled until provider/environment/amount/currency/interval checks pass and that market is explicitly enabled. A Stripe quote outage disables purchase availability without hiding an already verified entitlement or blocking free like counts.

## 8. Payment provider compatibility

Stripe is retained. Account eligibility, recurring payment methods, supported presentment currencies, minimums and merchant capabilities have not been checked against the actual account. No promise is made that all 88 display currencies can be charged. `STRIPE_MARKETS` explicitly controls enabled markets, independently of geographical coverage. Exact matching provider Price IDs and test/live mode checks are required.

Provider precision adapters handle ISK/UGX and MGA separately from ISO precision and reject unsupported fractional charges. Three-decimal amounts that Stripe cannot represent are rejected. Stripe APIs are pinned to `2024-06-20`; staging must confirm the actual webhook/API shapes and account configuration.

## 9. Subscription price and currency locks

The verified contract records Plus, interval, original amount and currency, selected market, provider, subscription/price references, start, renewal/cancellation and paid-through dates. Renewals must match that contract; new regional prices are not substituted. A database trigger prevents in-place changes for the same subscription reference.

No automatic in-place repricing or consent-bypass mechanism was introduced. Changing billing currency/price requires a clearly selected new subscription after the existing paid term ends. Disable Stripe portal price/plan switching. A separate consent-driven repricing workflow is not implemented; operators must not change existing agreements externally and assume the application will accept them.

## 10. Free and Plus entitlements

Free unlimited likes, matching, messaging, profile management, basic discovery, all connection modes, blocking/reporting, received-like count and the primary travel/destination path remain free. Existing abuse-prevention request limits are not monetization limits. No boosts or paid advanced filters were added.

Liker profiles remain server-gated. Additional cities remain server-gated. The five-upcoming-city cap now includes an upcoming primary profile trip and has a database guard for both write paths. Free users cannot POST extra cities by claiming Plus in a payload. Downgrade retains all records, permits viewing/removing owned destinations and blocks adding premium destinations. Existing over-limit records are not silently deleted.

Paid access is derived from verified paid, non-fully-refunded/non-disputed invoice periods and the actual subscription status. An end-of-period cancellation preserves the paid term; expiration removes access by time comparison even without a cleanup job. A verified renewal restores access. No subscription transition deletes social records.

## 11. Payment security and lifecycle

Amounts are never accepted from the frontend. Checkout receives only a selected market and regional price ID, then resolves/verifies the provider price server-side. Customer ownership, origin, active subscription conflicts and test/live credentials are checked. Checkout creation and customer creation use provider idempotency plus per-user database serialization.

Webhooks verify raw-body HMAC/timestamp, retrieve the provider event, verify environment and retrieve current subscription/invoice/charge data. Provider state is re-fetched after serializing on the profile row to avoid older request snapshots overwriting a newer one. Contracts, prices, quantities, amounts, currencies, references, paid status and periods must match. Event and ledger effects share one transaction, with independent unique references as a second duplicate-processing guard.

Handled states include pending/action-required, failed, void, uncollectible, paid, partial/full refund, dispute and resolution, cancellation and expiry. Partial refunds retain access; full refunds revoke the affected paid period. Other paid periods remain eligible. Old-subscription events can update historical payments without replacing a newer contract. Success/cancelled return URLs do not grant access. The authenticated sync path verifies actual payment before granting/restoring access.

Billing management/history/cancellation use verified ownership even if social-profile access is suspended; new checkout and social features retain their profile/adult checks. Private payment data is not exposed through discovery or other users' profiles.

## 12. Subscription UI and notifications

The existing Plus page offers country/currency preferences, independent monthly/yearly quotes, the actual charge currency, locked subscription amounts, next renewal amount/date, paid-through/cancellation information, portal access, cancel-renewal, verified checkout return status, paginated history and validated receipt links. Settings reuses the shared formatter and links to the same management flow.

Billing events and upcoming renewals queue notifications in the existing in-app inbox. External email/push delivery and provider receipts still depend on their existing hosted settings. No replacement notification service or automatic background reconciliation job was added.

## 13. Executed local validation

- `npm test`: **203 tests passed, 0 failed** in the final recorded run. The original suite was retained and expanded. This includes isolated billing-handler integration tests using mocked Stripe/SQL responses, country/money/price/contract tests, Plus flow tests and the existing auth/social tests.
- `npm run build`: backend bundle, Vite production frontend and source packaging completed successfully.
- `git diff --check`: passed.
- The SQL migration was statically reviewed/tested for reference uniqueness, RLS, contract locks, caps and absence of downgrade deletion. **No SQL was executed.** Actual database integration is outstanding.
- Deno is not installed in this workspace, so `deno check` was not executed. The backend bundle/import graph was built successfully; a bundle is not a full type check.
- Browser visual/end-to-end verification and real Stripe/Supabase integration were not executed.

The integration fixtures simulate provider responses and SQL transactions; they do not execute database constraints or prove hosted deployment behavior.

## 14. Deployment requirements

Follow `supabase/GLOBAL_BILLING_SETUP.md`. The required sequence is staging backup/migration/constraint validation, approved Stripe product/price mapping, correct environment secrets and market verification, legacy reconciliation, sandbox acceptance, backend deployment and frontend publication.

Required server settings include `PACEMATE_DATABASE_URL`, Supabase server credentials, `STRIPE_MODE`, a matching secret key, webhook secret, explicitly verified `STRIPE_MARKETS`, `BILLING_ENABLED`, frontend origin and allowed origins. The former single `STRIPE_PRICE_ID` setup is superseded; the community setup guide now points to the new instructions. Keep separate test/live projects and credentials. No credentials were invented or placed in frontend code.

## 15. Hosted/live status

**Not verified:** migration execution/rollback/real concurrency, actual hosted schema or credentials, Stripe merchant/currency eligibility, sandbox Checkout/card flows, live webhooks, receipts, portal configuration, external notifications, scheduled renewal delivery and real payment restoration. No hosted application/payment service was contacted, no deployment performed and no real charge attempted.

Checkout intentionally fails closed when hosted prerequisites are absent. This delivery is not a certification that live payments are operational or that the application can be launched without the remaining acceptance work.

## 16. Outstanding dependencies and operational decisions

1. Execute the documented staging database and Stripe sandbox acceptance checks under authorization; verify webhook retry/out-of-order and concurrency behavior on real services.
2. Reconcile legacy subscriber contracts before rollout. Original history was not previously stored locally; earlier invoices are not automatically bulk imported. Stripe portal history remains the provider archive until an explicit import is arranged.
3. Configure approved test/live Price IDs and verify market support, especially NGN recurring checkout for the actual merchant account. Leave unsupported markets unavailable; do not silently use USD instead.
4. Disable portal in-place plan/currency repricing. New economic terms need a new consented subscription; no separate price-change-consent administration workflow exists.
5. Validate accounting/tax/discount/trial decisions before enabling any invoice structures beyond the exact one-line launch contract. Unknown adjustments fail verification rather than changing amounts silently.
6. Configure external receipt/renewal delivery and monitor failed webhooks. Authenticated reconciliation exists, but an unattended provider-reconciliation scheduler is not implemented.
7. Periodically review currency adoption/reference changes and the runtime's locale data. The reference catalogue is a maintained configuration, not a live standards feed.

Implemented and locally tested: registry, integer formatting/provider adapters, approved-price selection, server verification/ledger/contract logic, entitlements and UI flows. Implemented but hosted-unverified: database migration/triggers/RLS, real provider APIs/webhooks, checkout/portal/notifications. External work not performed: account configuration, provider price creation, migration execution, historical import, deployment and end-to-end live/sandbox verification.
