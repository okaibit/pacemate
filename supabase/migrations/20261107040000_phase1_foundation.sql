-- PHASE 1 FOUNDATION. REVIEW BEFORE EXECUTION. Requires the two existing base migrations.
-- No drops of existing user data, no replacement profile table, no scores persisted.
BEGIN;
ALTER TABLE public.profiles
 ADD COLUMN country text NOT NULL DEFAULT '',
 ADD COLUMN languages text[] NOT NULL DEFAULT '{}',
 ADD COLUMN preferred_days text[] NOT NULL DEFAULT '{}',
 ADD COLUMN preferred_times text[] NOT NULL DEFAULT '{}',
 ADD COLUMN preferred_intensity text NOT NULL DEFAULT '',
 ADD COLUMN lifestyle_interests text[] NOT NULL DEFAULT '{}',
 ADD COLUMN connection_modes text[] NOT NULL DEFAULT '{}',
 ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified',
 ADD CONSTRAINT foundation_days CHECK(preferred_days <@ ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[]),
 ADD CONSTRAINT foundation_times CHECK(preferred_times <@ ARRAY['Morning','Afternoon','Evening']::text[]),
 ADD CONSTRAINT foundation_intensity CHECK(preferred_intensity IN ('','low','moderate','high')),
 ADD CONSTRAINT foundation_modes CHECK(connection_modes <@ ARRAY['training_partner','friendship','dating']::text[] AND cardinality(connection_modes) BETWEEN 1 AND 3) NOT VALID,
 ADD CONSTRAINT foundation_verification CHECK(verification_status IN ('unverified','verified')),
 ADD CONSTRAINT foundation_lengths CHECK(length(country)<=80 AND cardinality(languages)<=12 AND cardinality(lifestyle_interests)<=12) NOT VALID;
-- Populate mode consent only from existing explicit goals. Open to all does not opt into dating.

UPDATE public.profiles SET connection_modes=CASE
 WHEN goal IN ('A relationship','Something casual') AND birthdate <= (current_date-interval '18 years')::date THEN ARRAY['dating']
 WHEN goal='Friends in a new city' THEN ARRAY['friendship']
 WHEN goal='A training partner' THEN ARRAY['training_partner']
 ELSE ARRAY['training_partner','friendship'] END,
 verification_status=CASE WHEN verified THEN 'verified' ELSE 'unverified' END;
ALTER TABLE public.profiles VALIDATE CONSTRAINT foundation_modes;
ALTER TABLE public.profiles VALIDATE CONSTRAINT foundation_lengths;

CREATE TABLE public.sports (
 id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9-]{0,59}$'),
 name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 60)
);
-- Include all existing selectable sports so no existing selections are discarded.
INSERT INTO public.sports(id,name) VALUES
 ('running','Running'),('cycling','Cycling'),('gym','Gym'),('hiking','Hiking'),('swimming','Swimming'),('tennis','Tennis'),('padel','Padel'),('climbing','Climbing'),('yoga','Yoga'),('volleyball','Volleyball'),
 ('trail-running','Trail running'),('walking','Walking'),('mountain-biking','Mountain biking'),('surfing','Surfing'),('kitesurfing','Kitesurfing'),('pilates','Pilates'),('calisthenics','Calisthenics'),('crossfit','CrossFit'),('hiit','HIIT'),('boxing','Boxing'),('muay-thai','Muay Thai'),('martial-arts','Martial arts'),('squash','Squash'),('badminton','Badminton'),('table-tennis','Table tennis'),('golf','Golf'),('football','Football'),('basketball','Basketball'),('netball','Netball'),('rugby','Rugby'),('cricket','Cricket'),('handball','Handball'),('skiing','Skiing'),('snowboarding','Snowboarding'),('skateboarding','Skateboarding'),('triathlon','Triathlon'),('rowing','Rowing'),('dance','Dance');
CREATE TABLE public.user_sports (
 user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 sport_id text NOT NULL REFERENCES public.sports(id),
 experience_level text NOT NULL DEFAULT '' CHECK(experience_level IN ('','beginner','intermediate','advanced')),
 preferred_intensity text NOT NULL DEFAULT '' CHECK(preferred_intensity IN ('','low','moderate','high')),
 PRIMARY KEY(user_id,sport_id)
);
INSERT INTO public.user_sports(user_id,sport_id,experience_level)
 SELECT DISTINCT p.id,s.id,CASE p.level WHEN 'Just starting' THEN 'beginner' WHEN 'Regular' THEN 'intermediate' WHEN 'Competitive' THEN 'advanced' ELSE '' END
 FROM public.profiles p JOIN public.sports s ON s.name=ANY(p.sports);

-- RLS is row security, not column security. Never grant SELECT on profiles to clients.
-- Only these explicit projection RPCs expose public fields.
REVOKE ALL ON public.profiles FROM anon,authenticated;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sports,public.user_sports FROM anon,authenticated;
GRANT SELECT ON public.sports,public.user_sports TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.user_sports TO authenticated;
CREATE FUNCTION public.foundation_visible(candidate text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.profiles viewer JOIN public.profiles p ON p.id=candidate
 WHERE viewer.id=auth.uid()::text AND NOT viewer.suspended AND NOT p.suspended
 AND (p.id=viewer.id OR NOT p.paused)
 AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE
 (b.blocker_id=viewer.id AND b.blocked_id=p.id) OR(b.blocked_id=viewer.id AND b.blocker_id=p.id)))
$$;
CREATE POLICY foundation_sports_read ON public.sports FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL);
CREATE POLICY foundation_user_sports_read ON public.user_sports FOR SELECT TO authenticated USING(public.foundation_visible(user_id));
CREATE POLICY foundation_user_sports_insert ON public.user_sports FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid()::text AND public.foundation_visible(user_id));
CREATE POLICY foundation_user_sports_update ON public.user_sports FOR UPDATE TO authenticated USING(user_id=auth.uid()::text AND public.foundation_visible(user_id)) WITH CHECK(user_id=auth.uid()::text AND public.foundation_visible(user_id));
CREATE POLICY foundation_user_sports_delete ON public.user_sports FOR DELETE TO authenticated USING(user_id=auth.uid()::text AND public.foundation_visible(user_id));

CREATE FUNCTION public.foundation_profile_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' AND cardinality(NEW.connection_modes)=0 THEN
  NEW.connection_modes=CASE WHEN NEW.goal IN ('A relationship','Something casual') THEN ARRAY['dating'] WHEN NEW.goal='Friends in a new city' THEN ARRAY['friendship'] ELSE ARRAY['training_partner'] END;
 END IF;
 IF 'dating'=ANY(NEW.connection_modes) AND (NEW.birthdate IS NULL OR NEW.birthdate > (current_date-interval '18 years')::date) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Dating is available only to members aged 18 or older.';
 END IF;
 -- Trusted legacy moderation remains the source of verification. Client RPC never writes it.
 NEW.verification_status=CASE WHEN NEW.verified THEN 'verified' ELSE 'unverified' END;
 RETURN NEW;
END $$;
-- Sort after the existing photo-verification trigger so changed photos revoke verification.
CREATE TRIGGER zz_foundation_profile_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.foundation_profile_guard();

-- Keep both representations usable by existing screens; nested trigger writes cannot recurse.
CREATE FUNCTION public.foundation_legacy_sports_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 DELETE FROM public.user_sports u WHERE u.user_id=NEW.id AND NOT EXISTS(SELECT 1 FROM public.sports s WHERE s.id=u.sport_id AND s.name=ANY(NEW.sports));
 INSERT INTO public.user_sports(user_id,sport_id,experience_level)
 SELECT NEW.id,s.id,CASE NEW.level WHEN 'Just starting' THEN 'beginner' WHEN 'Regular' THEN 'intermediate' WHEN 'Competitive' THEN 'advanced' ELSE '' END FROM public.sports s WHERE s.name=ANY(NEW.sports)
 ON CONFLICT(user_id,sport_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_legacy_sports_sync AFTER INSERT OR UPDATE OF sports ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.foundation_legacy_sports_sync();
CREATE FUNCTION public.foundation_sports_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
CREATE TRIGGER foundation_sports_sync AFTER INSERT OR UPDATE OR DELETE ON public.user_sports FOR EACH ROW EXECUTE FUNCTION public.foundation_sports_sync();

CREATE FUNCTION public.foundation_profile(target text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles; result jsonb; member text=coalesce(target,auth.uid()::text);
BEGIN
 IF NOT public.foundation_visible(member) THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=member;
 result=jsonb_build_object('id',p.id,'name',p.name,'age',extract(year FROM age(current_date,p.birthdate))::integer,
 'city',p.current_city,'country',p.country,'bio',p.bio,'languages',p.languages,'photos',p.photos,
 'preferred_days',p.preferred_days,'preferred_times',p.preferred_times,'preferred_intensity',p.preferred_intensity,
 'lifestyle_interests',p.lifestyle_interests,'connection_modes',p.connection_modes,'verification_status',p.verification_status,
 'user_sports',coalesce((SELECT jsonb_agg(jsonb_build_object('sport_id',s.id,'name',s.name,'experience_level',u.experience_level,'preferred_intensity',u.preferred_intensity) ORDER BY s.name) FROM public.user_sports u JOIN public.sports s ON s.id=u.sport_id WHERE u.user_id=member),'[]'::jsonb));
 IF member=auth.uid()::text THEN result=result||jsonb_build_object('birthdate',p.birthdate); END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.foundation_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]'::jsonb) FROM public.sports
$$;

CREATE FUNCTION public.foundation_save(payload jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member text=auth.uid()::text; entry jsonb; photo text; old_photos text[]; new_photos text[];
BEGIN
 IF member IS NULL OR NOT public.foundation_visible(member) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Profile unavailable.'; END IF;
 -- Serialize saves for this member; keep legacy fields and unrelated workflows intact.
 SELECT photos INTO old_photos FROM public.profiles WHERE id=member FOR UPDATE;
 IF jsonb_typeof(payload)<>'object' OR coalesce(length(trim(payload->>'name')),0) NOT BETWEEN 2 AND 30
 OR coalesce(length(trim(payload->>'city')),0) NOT BETWEEN 1 AND 60
 OR coalesce(length(trim(payload->>'country')),0) NOT BETWEEN 1 AND 80
 OR coalesce(length(payload->>'bio'),0)>500
 OR coalesce(payload->>'birthdate','') !~ '^\d{4}-\d{2}-\d{2}$'
 OR (payload->>'birthdate')::date>current_date OR (payload->>'birthdate')::date < (current_date-interval '100 years')::date
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Check your name, date of birth, city, country and bio.'; END IF;
 FOREACH photo IN ARRAY ARRAY['languages','preferred_days','preferred_times','lifestyle_interests','connection_modes','photos','user_sports'] LOOP
  IF jsonb_typeof(payload->photo) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Profile selections must be lists.'; END IF;
 END LOOP;
 IF jsonb_array_length(payload->'photos')>6 OR jsonb_array_length(payload->'user_sports') NOT BETWEEN 1 AND 8
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose one to eight sports and up to six photos.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'user_sports') s WHERE jsonb_typeof(s)<>'object'
 OR coalesce(s->>'experience_level','') NOT IN ('beginner','intermediate','advanced')
 OR coalesce(s->>'preferred_intensity','') NOT IN ('low','moderate','high')
 OR NOT EXISTS(SELECT 1 FROM public.sports c WHERE c.id=s->>'sport_id'))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose a sport, experience level and intensity for each selection.'; END IF;
 IF (SELECT count(DISTINCT s->>'sport_id') FROM jsonb_array_elements(payload->'user_sports') s)<>jsonb_array_length(payload->'user_sports')
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose each sport once.'; END IF;
 FOREACH photo IN ARRAY ARRAY['languages','preferred_days','preferred_times','lifestyle_interests','connection_modes','photos'] LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->photo) item WHERE jsonb_typeof(item)<>'string' OR length(trim(item#>>'{}')) NOT BETWEEN 1 AND 100)
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selections must contain short, non-empty text.'; END IF;
 END LOOP;
 new_photos=ARRAY(SELECT jsonb_array_elements_text(payload->'photos'));
 FOREACH photo IN ARRAY new_photos LOOP
  IF split_part(photo,'/',1)<>member OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='photos' AND name=photo)
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Upload your own profile photos before saving.'; END IF;
 END LOOP;
 UPDATE public.profiles SET name=trim(payload->>'name'),birthdate=(payload->>'birthdate')::date,
 current_city=trim(payload->>'city'),country=trim(payload->>'country'),bio=coalesce(payload->>'bio',''),
 languages=ARRAY(SELECT DISTINCT jsonb_array_elements_text(payload->'languages')),
 preferred_days=ARRAY(SELECT DISTINCT jsonb_array_elements_text(payload->'preferred_days')),
 preferred_times=ARRAY(SELECT DISTINCT jsonb_array_elements_text(payload->'preferred_times')),
 preferred_intensity=coalesce(payload->>'preferred_intensity',''),
 lifestyle_interests=ARRAY(SELECT DISTINCT jsonb_array_elements_text(payload->'lifestyle_interests')),
 connection_modes=ARRAY(SELECT DISTINCT jsonb_array_elements_text(payload->'connection_modes')),
 photos=new_photos,updated_at=now() WHERE id=member;
 -- Preserve details until replaced in this single transaction. Synchronize legacy sports at the end.
 DELETE FROM public.user_sports WHERE user_id=member AND sport_id NOT IN(SELECT s->>'sport_id' FROM jsonb_array_elements(payload->'user_sports') s);
 FOR entry IN SELECT * FROM jsonb_array_elements(payload->'user_sports') LOOP
  INSERT INTO public.user_sports(user_id,sport_id,experience_level,preferred_intensity)
  VALUES(member,entry->>'sport_id',entry->>'experience_level',entry->>'preferred_intensity')
  ON CONFLICT(user_id,sport_id) DO UPDATE SET experience_level=excluded.experience_level,preferred_intensity=excluded.preferred_intensity;
 END LOOP;
 RETURN public.foundation_profile(member);
END $$;

-- New connections require a shared mode and cannot connect blocked members.
-- Existing matches/messages are preserved when preferences change.
CREATE FUNCTION public.foundation_match_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.profiles; b public.profiles;
BEGIN
 SELECT * INTO a FROM public.profiles WHERE id=NEW.user_a FOR UPDATE;
 SELECT * INTO b FROM public.profiles WHERE id=NEW.user_b FOR UPDATE;
 IF a.id IS NULL OR b.id IS NULL OR a.suspended OR b.suspended OR NOT(a.connection_modes && b.connection_modes)
 OR EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=a.id AND blocked_id=b.id) OR(blocker_id=b.id AND blocked_id=a.id))
 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A connection requires a shared mode and available profiles.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_match_guard BEFORE INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.foundation_match_guard();

REVOKE ALL ON FUNCTION public.foundation_visible(text),public.foundation_profile(text),public.foundation_catalog(),public.foundation_save(jsonb),public.foundation_profile_guard(),public.foundation_legacy_sports_sync(),public.foundation_sports_sync(),public.foundation_match_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.foundation_visible(text),public.foundation_profile(text),public.foundation_catalog(),public.foundation_save(jsonb) TO authenticated;
COMMIT;
