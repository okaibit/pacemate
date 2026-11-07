-- Phase 1: server-only foundation data. Requires base and community migrations.
BEGIN;
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS preferred_days text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS preferred_times text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS preferred_intensity text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS lifestyle_interests text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS connection_modes text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_days') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_days CHECK(preferred_days <@ ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[]);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_times') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_times CHECK(preferred_times <@ ARRAY['Morning','Afternoon','Evening']::text[]);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_intensity') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_intensity CHECK(preferred_intensity IN ('','low','moderate','high'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_modes') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_modes CHECK(connection_modes <@ ARRAY['training_partner','friendship','dating']::text[] AND cardinality(connection_modes) BETWEEN 1 AND 3) NOT VALID;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_verification') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_verification CHECK(verification_status IN ('unverified','verified'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='foundation_lengths') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT foundation_lengths CHECK(length(country)<=80 AND cardinality(languages)<=12 AND cardinality(lifestyle_interests)<=12) NOT VALID;
 END IF;
END $$;
UPDATE public.profiles SET connection_modes=CASE
 WHEN goal IN ('A relationship','Something casual') AND birthdate <= (current_date-interval '18 years')::date THEN ARRAY['dating']
 WHEN goal='Friends in a new city' THEN ARRAY['friendship']
 WHEN goal='A training partner' THEN ARRAY['training_partner']
 ELSE ARRAY['training_partner','friendship'] END,
 verification_status=CASE WHEN verified THEN 'verified' ELSE 'unverified' END
 WHERE cardinality(connection_modes)=0;
ALTER TABLE public.profiles VALIDATE CONSTRAINT foundation_modes;
ALTER TABLE public.profiles VALIDATE CONSTRAINT foundation_lengths;

CREATE TABLE IF NOT EXISTS public.sports (
 id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9-]{0,59}$'),
 name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 60)
);
-- Include all existing selectable sports so no existing selections are discarded.
INSERT INTO public.sports(id,name) VALUES
 ('running','Running'),('cycling','Cycling'),('gym','Gym'),('hiking','Hiking'),('swimming','Swimming'),('tennis','Tennis'),('padel','Padel'),('climbing','Climbing'),('yoga','Yoga'),('volleyball','Volleyball'),
 ('trail-running','Trail running'),('walking','Walking'),('mountain-biking','Mountain biking'),('surfing','Surfing'),('kitesurfing','Kitesurfing'),('pilates','Pilates'),('calisthenics','Calisthenics'),('crossfit','CrossFit'),('hiit','HIIT'),('boxing','Boxing'),('muay-thai','Muay Thai'),('martial-arts','Martial arts'),('squash','Squash'),('badminton','Badminton'),('table-tennis','Table tennis'),('golf','Golf'),('football','Football'),('basketball','Basketball'),('netball','Netball'),('rugby','Rugby'),('cricket','Cricket'),('handball','Handball'),('skiing','Skiing'),('snowboarding','Snowboarding'),('skateboarding','Skateboarding'),('triathlon','Triathlon'),('rowing','Rowing'),('dance','Dance') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.user_sports (
 user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 sport_id text NOT NULL REFERENCES public.sports(id),
 experience_level text NOT NULL DEFAULT '' CHECK(experience_level IN ('','beginner','intermediate','advanced')),
 preferred_intensity text NOT NULL DEFAULT '' CHECK(preferred_intensity IN ('','low','moderate','high')),
 PRIMARY KEY(user_id,sport_id)
);
INSERT INTO public.user_sports(user_id,sport_id,experience_level)
 SELECT DISTINCT p.id,s.id,CASE p.level WHEN 'Just starting' THEN 'beginner' WHEN 'Regular' THEN 'intermediate' WHEN 'Competitive' THEN 'advanced' ELSE '' END
 FROM public.profiles p JOIN public.sports s ON s.name=ANY(p.sports) ON CONFLICT(user_id,sport_id) DO NOTHING;

ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles,public.sports,public.user_sports FROM PUBLIC,anon,authenticated;
-- No browser policies or callable profile RPCs. All access goes through pacemate.
CREATE OR REPLACE FUNCTION public.foundation_profile_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' AND cardinality(NEW.connection_modes)=0 THEN
  NEW.connection_modes=CASE WHEN NEW.goal IN ('A relationship','Something casual') THEN ARRAY['dating'] WHEN NEW.goal='Friends in a new city' THEN ARRAY['friendship'] ELSE ARRAY['training_partner'] END;
 END IF;
 IF NEW.birthdate IS NULL OR NEW.birthdate > ((now() AT TIME ZONE 'UTC')::date-interval '18 years')::date THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='You must be 18 or older to use Pacemate.';
 END IF;
 -- Trusted legacy moderation remains the source of verification. Foundation handlers never write it.
 NEW.verification_status=CASE WHEN NEW.verified THEN 'verified' ELSE 'unverified' END;
 RETURN NEW;
END $$;
-- Sort after the existing photo-verification trigger so changed photos revoke verification.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='zz_foundation_profile_guard') THEN
  CREATE TRIGGER zz_foundation_profile_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.foundation_profile_guard();
 END IF;
END $$;

-- Keep both representations usable by existing screens; nested trigger writes cannot recurse.
CREATE OR REPLACE FUNCTION public.foundation_legacy_sports_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 DELETE FROM public.user_sports u WHERE u.user_id=NEW.id AND NOT EXISTS(SELECT 1 FROM public.sports s WHERE s.id=u.sport_id AND s.name=ANY(NEW.sports));
 INSERT INTO public.user_sports(user_id,sport_id,experience_level)
 SELECT NEW.id,s.id,CASE NEW.level WHEN 'Just starting' THEN 'beginner' WHEN 'Regular' THEN 'intermediate' WHEN 'Competitive' THEN 'advanced' ELSE '' END FROM public.sports s WHERE s.name=ANY(NEW.sports)
 ON CONFLICT(user_id,sport_id) DO NOTHING;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='foundation_legacy_sports_sync') THEN
  CREATE TRIGGER foundation_legacy_sports_sync AFTER INSERT OR UPDATE OF sports ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.foundation_legacy_sports_sync();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.foundation_sports_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member text;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NULL; END IF;
 member=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 UPDATE public.profiles SET sports=ARRAY(SELECT s.name FROM public.user_sports u JOIN public.sports s ON s.id=u.sport_id WHERE u.user_id=member ORDER BY s.name),updated_at=now() WHERE id=member;
 IF TG_OP='UPDATE' AND OLD.user_id<>NEW.user_id THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='A sport cannot be transferred to another account.';
 END IF;
 RETURN NULL;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_sports'::regclass AND tgname='foundation_sports_sync') THEN
  CREATE TRIGGER foundation_sports_sync AFTER INSERT OR UPDATE OR DELETE ON public.user_sports FOR EACH ROW EXECUTE FUNCTION public.foundation_sports_sync();
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.foundation_profile_guard(),public.foundation_legacy_sports_sync(),public.foundation_sports_sync() FROM PUBLIC,anon,authenticated;
COMMIT;
