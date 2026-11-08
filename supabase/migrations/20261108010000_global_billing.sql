BEGIN;
-- Extend the existing subscription/customer/event structures. Do not delete legacy records.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code text CHECK(country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
ALTER TABLE public.subscriptions
 ADD COLUMN plan_id text NOT NULL DEFAULT 'plus', ADD COLUMN provider text NOT NULL DEFAULT 'stripe',
 ADD COLUMN price_id text, ADD COLUMN billing_country text, ADD COLUMN currency text,
 ADD COLUMN amount_minor bigint CHECK(amount_minor>0), ADD COLUMN billing_interval text CHECK(billing_interval IN('month','year')),
 ADD COLUMN started_at timestamptz, ADD COLUMN renewal_at timestamptz, ADD COLUMN paid_through timestamptz,
 ADD COLUMN cancelled_at timestamptz, ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.billing_checkout_sessions ADD COLUMN price_id text, ADD COLUMN environment text, ADD COLUMN origin text;
ALTER TABLE public.travel_plans ADD COLUMN country_code text CHECK(country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
CREATE TABLE public.billing_preferences (
 user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
 display_currency text NOT NULL CHECK(display_currency ~ '^[A-Z]{3}$'),
 billing_country text CHECK(billing_country ~ '^[A-Z]{2}$'), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.regional_prices (
 id text PRIMARY KEY, country_code text NOT NULL CHECK(country_code ~ '^[A-Z]{2}$'),
 plan_id text NOT NULL DEFAULT 'plus' CHECK(plan_id='plus'), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 billing_interval text NOT NULL CHECK(billing_interval IN('month','year')), interval_count integer NOT NULL DEFAULT 1 CHECK(interval_count=1),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), provider text NOT NULL DEFAULT 'stripe' CHECK(provider='stripe'),
 provider_price_id text, environment text NOT NULL CHECK(environment IN('test','live')),
 approved boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT false,
 effective_from timestamptz NOT NULL, effective_until timestamptz, CHECK(effective_until IS NULL OR effective_until>effective_from),
 UNIQUE(provider_price_id,environment), UNIQUE(country_code,currency,billing_interval,environment,effective_from)
);
CREATE INDEX regional_price_lookup ON public.regional_prices(country_code,environment,effective_from);
-- Approved product amounts. Checkout remains disabled until verified provider IDs and market configuration exist.
INSERT INTO public.regional_prices(id,country_code,currency,billing_interval,amount_minor,approved,active,environment,effective_from) VALUES
 ('ng-month-test-v1','NG','NGN','month',150000,true,true,'test','2026-11-08T00:00:00Z'),
 ('ng-year-test-v1','NG','NGN','year',1200000,true,true,'test','2026-11-08T00:00:00Z'),
 ('us-month-test-v1','US','USD','month',299,true,true,'test','2026-11-08T00:00:00Z'),
 ('us-year-test-v1','US','USD','year',2499,true,true,'test','2026-11-08T00:00:00Z'),
 ('ng-month-live-v1','NG','NGN','month',150000,true,true,'live','2026-11-08T00:00:00Z'),
 ('ng-year-live-v1','NG','NGN','year',1200000,true,true,'live','2026-11-08T00:00:00Z'),
 ('us-month-live-v1','US','USD','month',299,true,true,'live','2026-11-08T00:00:00Z'),
 ('us-year-live-v1','US','USD','year',2499,true,true,'live','2026-11-08T00:00:00Z');
CREATE TABLE public.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text REFERENCES public.profiles(id) ON DELETE SET NULL,
 subscription_id text NOT NULL, provider text NOT NULL CHECK(provider='stripe'),
 charge_reference text, payment_intent_reference text, transaction_reference text NOT NULL, invoice_reference text NOT NULL, price_id text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL CHECK(status IN('pending','paid','failed','void','uncollectible','refunded','disputed')),
 paid_at timestamptz, period_start timestamptz NOT NULL, period_end timestamptz NOT NULL CHECK(period_end>period_start),
 refunded_minor bigint NOT NULL DEFAULT 0 CHECK(refunded_minor>=0 AND refunded_minor<=amount_minor),
 receipt_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,transaction_reference), UNIQUE(provider,invoice_reference), UNIQUE(provider,charge_reference), UNIQUE(provider,payment_intent_reference)
);
CREATE OR REPLACE FUNCTION public.pacemate_lock_regional_price() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.provider_price_id IS NOT NULL AND
 ROW(NEW.country_code,NEW.currency,NEW.billing_interval,NEW.amount_minor,NEW.provider_price_id,NEW.environment)
 IS DISTINCT FROM ROW(OLD.country_code,OLD.currency,OLD.billing_interval,OLD.amount_minor,OLD.provider_price_id,OLD.environment)
 THEN RAISE EXCEPTION 'Create a new regional price version instead of changing an existing provider price.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pacemate_lock_regional_price BEFORE UPDATE ON public.regional_prices FOR EACH ROW EXECUTE FUNCTION public.pacemate_lock_regional_price();
REVOKE ALL ON FUNCTION public.pacemate_lock_regional_price() FROM PUBLIC,anon,authenticated;
CREATE INDEX payments_owner_history ON public.payments(user_id,created_at DESC);
CREATE INDEX payments_paid_period ON public.payments(subscription_id,status,period_end);
CREATE OR REPLACE FUNCTION public.pacemate_plus_entitled(s public.subscriptions) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (s).plan_id='plus' AND (s).status IN('active','past_due','canceled') AND (s).paid_through>now()
$$;
CREATE OR REPLACE FUNCTION public.pacemate_lock_contract() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.subscription_id=OLD.subscription_id AND OLD.amount_minor IS NOT NULL AND
 ROW(NEW.plan_id,NEW.provider,NEW.price_id,NEW.billing_country,NEW.currency,NEW.amount_minor,NEW.billing_interval,NEW.started_at)
 IS DISTINCT FROM ROW(OLD.plan_id,OLD.provider,OLD.price_id,OLD.billing_country,OLD.currency,OLD.amount_minor,OLD.billing_interval,OLD.started_at)
 THEN RAISE EXCEPTION 'Subscription contract is locked; create a new subscription after the current contract ends.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pacemate_lock_contract BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.pacemate_lock_contract();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['billing_preferences','regional_prices','payments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_lock_contract() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pacemate_plus_entitled(public.subscriptions) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pacemate_plus_entitled(public.subscriptions) TO postgres;
-- Serialize all travel writers on the profile row, including the existing free primary-trip path.
CREATE OR REPLACE FUNCTION public.pacemate_guard_travel_count() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE member text; primary_trip integer; planned integer; subscriber public.subscriptions;
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF NEW.next_city IS NOT DISTINCT FROM OLD.next_city AND NEW.next_arrival IS NOT DISTINCT FROM OLD.next_arrival THEN RETURN NEW; END IF;
  member=NEW.id;
  IF NEW.next_city IS NULL OR NEW.next_arrival<current_date OR (OLD.next_city IS NOT NULL AND OLD.next_arrival>=current_date) THEN RETURN NEW; END IF;
  SELECT * INTO subscriber FROM public.subscriptions WHERE user_id=member;
  IF NOT coalesce(public.pacemate_plus_entitled(subscriber),false) THEN RETURN NEW; END IF;
  primary_trip=CASE WHEN NEW.next_city IS NOT NULL AND NEW.next_arrival>=current_date THEN 1 ELSE 0 END;
  SELECT count(*) INTO planned FROM public.travel_plans WHERE user_id=member AND arrival>=current_date;
 ELSE
  member=NEW.user_id;
  PERFORM id FROM public.profiles WHERE id=member FOR UPDATE;
  SELECT * INTO subscriber FROM public.subscriptions WHERE user_id=member;
  IF NOT coalesce(public.pacemate_plus_entitled(subscriber),false) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Additional cities require Pacemate Plus.'; END IF;
  IF NEW.arrival<current_date THEN RETURN NEW; END IF;
  SELECT CASE WHEN next_city IS NOT NULL AND next_arrival>=current_date THEN 1 ELSE 0 END INTO primary_trip FROM public.profiles WHERE id=member;
  SELECT count(*) INTO planned FROM public.travel_plans WHERE user_id=member AND arrival>=current_date AND id<>NEW.id;
  planned=planned+1;
 END IF;
 IF planned+coalesce(primary_trip,0)>5 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='You can plan up to five upcoming cities, including your primary trip.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pacemate_guard_primary_trip BEFORE UPDATE OF next_city,next_arrival ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.pacemate_guard_travel_count();
CREATE TRIGGER pacemate_guard_additional_trip BEFORE INSERT OR UPDATE ON public.travel_plans FOR EACH ROW EXECUTE FUNCTION public.pacemate_guard_travel_count();
REVOKE ALL ON FUNCTION public.pacemate_guard_travel_count() FROM PUBLIC,anon,authenticated;
COMMIT;
