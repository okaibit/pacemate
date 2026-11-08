-- Apply once after 20261108010000_global_billing.sql. Preserves existing subscription contracts.
BEGIN;
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_interval_check CHECK(billing_interval IN('week','month','year'));
ALTER TABLE public.regional_prices DROP CONSTRAINT IF EXISTS regional_prices_billing_interval_check;
ALTER TABLE public.regional_prices ADD CONSTRAINT regional_prices_billing_interval_check CHECK(billing_interval IN('week','month','year'));
-- Retire earlier launch offers for new checkout only. Their provider IDs and agreed contracts remain intact.
UPDATE public.regional_prices SET active=false,effective_until=now()
WHERE id IN('ng-month-test-v1','ng-year-test-v1','us-month-test-v1','us-year-test-v1','ng-month-live-v1','ng-year-live-v1','us-month-live-v1','us-year-live-v1');
-- Generated from money/plus-launch-prices.json, explicitly approved by the user. Bind new provider IDs separately.
INSERT INTO public.regional_prices(id,country_code,currency,billing_interval,amount_minor,approved,active,environment,effective_from) VALUES
 ('ng-week-test-v2','NG','NGN','week',120000,true,true,'test',now()),
 ('ng-month-test-v2','NG','NGN','month',300000,true,true,'test',now()),
 ('ng-year-test-v2','NG','NGN','year',2000000,true,true,'test',now()),
 ('us-week-test-v2','US','USD','week',199,true,true,'test',now()),
 ('us-month-test-v2','US','USD','month',499,true,true,'test',now()),
 ('us-year-test-v2','US','USD','year',3499,true,true,'test',now()),
 ('ng-week-live-v2','NG','NGN','week',120000,true,true,'live',now()),
 ('ng-month-live-v2','NG','NGN','month',300000,true,true,'live',now()),
 ('ng-year-live-v2','NG','NGN','year',2000000,true,true,'live',now()),
 ('us-week-live-v2','US','USD','week',199,true,true,'live',now()),
 ('us-month-live-v2','US','USD','month',499,true,true,'live',now()),
 ('us-year-live-v2','US','USD','year',3499,true,true,'live',now());
COMMIT;
