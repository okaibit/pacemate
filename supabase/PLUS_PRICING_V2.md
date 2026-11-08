> Current status: Stripe has been disconnected. The provider setup below is historical. Use [test membership setup](TEST_PLUS_SETUP.md) to test Free and Plus without payments. No real checkout is available.

# Plus pricing bar update

This user-approved update replaces the earlier launch prices for NEW sales. Existing subscription contracts and provider price references remain locked to their original terms.

| Market | Interval | Full charge | Displayed comparison rate |
| --- | --- | --- | --- |
| NG | week | ₦1,200.00 | ₦1,200.00/wk |
| NG | month | ₦3,000.00 | ₦692.84/wk |
| NG | year | ₦20,000.00 | ₦384.62/wk |
| US | week | $1.99 | $1.99/wk |
| US | month | $4.99 | $1.15/wk |
| US | year | $34.99 | $0.67/wk |

Weekly comparison rates and header labels are explicitly approved display values, not payment amounts. The selected full charge is always used in the CTA. The canonical catalogue is `functions/pacemate/money/plus-launch-prices.json`; the incremental migration's rows were generated from it.

Run `migrations/20261108030000_plus_weekly_prices.sql` once after the already-applied global billing migration. It expands interval checks to include weekly subscriptions, retires v1 offers for new sales only, and inserts v2 price records for test/live with no invented provider IDs. It has not been applied by this agent.

Create matching recurring Stripe Prices for each enabled test market and bind the appropriate `provider_price_id` on each v2 row. A v1 price with a different amount is never attached to a v2 card. The backend still verifies currency, full amount, interval and environment. Do not rebind or reprice an existing subscriber.

The plan country is inferred from saved profile country/current-city information, with an explicit locale-region fallback and then NG. This does not request GPS or contact an IP-location service, and it does not change an existing subscription's billing currency. Planned future destinations are ignored. Other markets retain their explicitly configured server quotes; unconfigured prices are not invented.

The purchase button is enabled for an approved selection to allow interaction with the pricing bar, but its existing payment handler refuses a charge when the matching server quote is unavailable. A clear error is shown; no fake checkout, successful payment or entitlement is created. Keep billing disabled until the documented Stripe sandbox setup passes.
