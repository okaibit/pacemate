BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed'));
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolution text NOT NULL DEFAULT '';
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE TABLE public.app_admins (
  user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.moderation_actions (
  id bigserial PRIMARY KEY, actor_id text NOT NULL, target_id text NOT NULL,
  action text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  selfie_key text, profile_photos text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  note text NOT NULL DEFAULT '', reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX verification_one_pending ON public.verification_requests(user_id) WHERE status='pending';
CREATE TABLE public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id integer NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_fkey FOREIGN KEY (attachment_id) REFERENCES public.chat_attachments(id) ON DELETE SET NULL;
CREATE TABLE public.event_messages (
  id bigserial PRIMARY KEY, event_id integer NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_messages_page ON public.event_messages(event_id,id);
CREATE TABLE public.notification_settings (
  user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_matches boolean NOT NULL DEFAULT false, email_messages boolean NOT NULL DEFAULT false,
  email_sessions boolean NOT NULL DEFAULT false, email_streaks boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false, timezone text NOT NULL DEFAULT 'UTC',
  reminder_hour integer NOT NULL DEFAULT 20 CHECK (reminder_hour BETWEEN 0 AND 23),
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE
);
CREATE TABLE public.notifications (
  id bigserial PRIMARY KEY, user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', href text NOT NULL,
  dedupe_key text UNIQUE, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  email_state text NOT NULL DEFAULT 'pending', push_state text NOT NULL DEFAULT 'pending',
  email_attempts integer NOT NULL DEFAULT 0, push_attempts integer NOT NULL DEFAULT 0,
  claim_until timestamptz, delivery_error text
);
CREATE INDEX notifications_inbox ON public.notifications(user_id,id DESC);
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.travel_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city text NOT NULL, arrival date NOT NULL, UNIQUE(user_id,city,arrival)
);
CREATE TABLE public.billing_customers (
  user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, customer_id text NOT NULL UNIQUE
);
CREATE TABLE public.subscriptions (
  user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id text NOT NULL UNIQUE, status text NOT NULL, current_period_end timestamptz,
  last_event_at bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.billing_checkout_sessions (
  user_id text PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text NOT NULL,url text NOT NULL,expires_at timestamptz NOT NULL
);
CREATE TABLE public.billing_events (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.city_coordinates (
  city_key text PRIMARY KEY, display_name text NOT NULL,
  latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.feature_limits (key text PRIMARY KEY, hits integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX feature_limits_expiry ON public.feature_limits(updated_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['app_admins','moderation_actions','verification_requests','chat_attachments','event_messages','notification_settings','notifications','push_subscriptions','travel_plans','billing_customers','subscriptions','billing_checkout_sessions','billing_events','city_coordinates','feature_limits'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.moderation_actions_id_seq,public.event_messages_id_seq,public.notifications_id_seq FROM anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('verification','verification',false,2097152,ARRAY['image/jpeg','image/png','image/webp']),
       ('chat','chat',false,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE FUNCTION public.pacemate_notify(member text, category text, heading text, content text, link text, dedupe text DEFAULT NULL, actor text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=member AND NOT suspended) THEN RETURN; END IF;
  IF actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=member AND blocked_id=actor) OR (blocker_id=actor AND blocked_id=member)) THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id,kind,title,body,href,dedupe_key) VALUES(member,category,heading,content,link,dedupe) ON CONFLICT(dedupe_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_notify(text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pacemate_match_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  PERFORM public.pacemate_notify(NEW.user_a,'match','You have a new match','','/app/matches/'||NEW.id,'match:'||NEW.id||':'||NEW.user_a,NEW.user_b);
  PERFORM public.pacemate_notify(NEW.user_b,'match','You have a new match','','/app/matches/'||NEW.id,'match:'||NEW.id||':'||NEW.user_b,NEW.user_a);
  RETURN NEW;
END $$;
CREATE TRIGGER pacemate_match_notice AFTER INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.pacemate_match_notice();
CREATE FUNCTION public.pacemate_message_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE recipient text; BEGIN
  SELECT CASE WHEN user_a=NEW.sender_id THEN user_b ELSE user_a END INTO recipient FROM public.matches WHERE id=NEW.match_id;
  PERFORM public.pacemate_notify(recipient,'message','New message','','/app/matches/'||NEW.match_id,'message:'||NEW.id,NEW.sender_id);
  RETURN NEW;
END $$;
CREATE TRIGGER pacemate_message_notice AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.pacemate_message_notice();
CREATE FUNCTION public.pacemate_photo_verification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  IF NEW.photos IS DISTINCT FROM OLD.photos THEN
    NEW.verified=false;
    UPDATE public.verification_requests SET status='withdrawn',reviewed_at=now(),note='Profile photos changed' WHERE user_id=NEW.id AND status IN('pending','approved');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pacemate_photo_verification BEFORE UPDATE OF photos ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.pacemate_photo_verification();

-- Private broadcasts carry only a change signal. Message text and images remain
-- behind the API's membership and blocking checks.
CREATE FUNCTION public.pacemate_realtime_allowed(topic text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE me text:=auth.uid()::text; item integer; BEGIN
  IF me IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=me AND NOT suspended) THEN RETURN false; END IF;
  IF topic ~ '^match:[0-9]+$' THEN
    item:=split_part(topic,':',2)::integer;
    RETURN EXISTS(SELECT 1 FROM public.matches m JOIN public.profiles a ON a.id=m.user_a JOIN public.profiles b ON b.id=m.user_b WHERE m.id=item AND me IN(m.user_a,m.user_b) AND NOT a.suspended AND NOT b.suspended AND NOT EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=m.user_a AND blocked_id=m.user_b) OR(blocker_id=m.user_b AND blocked_id=m.user_a)));
  ELSIF topic ~ '^event:[0-9]+$' THEN
    item:=split_part(topic,':',2)::integer;
    RETURN EXISTS(SELECT 1 FROM public.events e WHERE e.id=item AND e.cancelled_at IS NULL AND (e.host_id=me OR EXISTS(SELECT 1 FROM public.rsvps r WHERE r.event_id=e.id AND r.user_id=me)) AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=me AND b.blocked_id=e.host_id) OR(b.blocker_id=e.host_id AND b.blocked_id=me)));
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_realtime_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pacemate_realtime_allowed(text) TO authenticated;
GRANT SELECT ON realtime.messages TO authenticated;
CREATE POLICY pacemate_private_broadcasts ON realtime.messages FOR SELECT TO authenticated USING (extension='broadcast' AND public.pacemate_realtime_allowed(realtime.topic()));
CREATE FUNCTION public.pacemate_broadcast() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE topic text; BEGIN
  IF TG_TABLE_NAME='event_messages' THEN topic:='event:'||NEW.event_id; ELSE topic:='match:'||NEW.match_id; END IF;
  BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'changed',topic,true); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Pacemate realtime broadcast unavailable'; END;
  RETURN NEW;
END $$;
CREATE TRIGGER pacemate_message_broadcast AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.pacemate_broadcast();
CREATE TRIGGER pacemate_read_broadcast AFTER INSERT OR UPDATE ON public.match_reads FOR EACH ROW EXECUTE FUNCTION public.pacemate_broadcast();
CREATE TRIGGER pacemate_event_broadcast AFTER INSERT ON public.event_messages FOR EACH ROW EXECUTE FUNCTION public.pacemate_broadcast();

CREATE FUNCTION public.pacemate_next_event(start_time timestamptz,zone text,repeats boolean,reference_time timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path='' AS $$ DECLARE candidate timestamp; week_count integer; BEGIN
  IF NOT repeats THEN RETURN start_time; END IF;
  week_count:=greatest(0,floor(((reference_time AT TIME ZONE zone)::date-(start_time AT TIME ZONE zone)::date)/7.0)::integer);
  candidate:=(start_time AT TIME ZONE zone)+week_count*interval '1 week';
  IF (candidate AT TIME ZONE zone) < reference_time-interval '2 hours' THEN candidate:=candidate+interval '1 week'; END IF;
  RETURN candidate AT TIME ZONE zone;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_next_event(timestamptz,text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pacemate_match_closed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'changed','match:'||OLD.id,true); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Pacemate realtime broadcast unavailable'; END;
  RETURN OLD;
END $$;
CREATE TRIGGER pacemate_match_closed AFTER DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.pacemate_match_closed();
REVOKE ALL ON FUNCTION public.pacemate_match_closed() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.pacemate_session_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE item integer; BEGIN
  IF TG_TABLE_NAME='events' THEN item:=NEW.id; ELSIF TG_OP='DELETE' THEN item:=OLD.event_id; ELSE item:=NEW.event_id; END IF;
  BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'changed','event:'||item,true); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Pacemate realtime broadcast unavailable'; END;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER pacemate_session_changed AFTER UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.pacemate_session_changed();
CREATE TRIGGER pacemate_attendance_changed AFTER INSERT OR DELETE ON public.rsvps FOR EACH ROW EXECUTE FUNCTION public.pacemate_session_changed();
CREATE FUNCTION public.pacemate_restriction_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE item record; BEGIN
  IF NEW.suspended IS DISTINCT FROM OLD.suspended THEN
    FOR item IN SELECT id FROM public.matches WHERE NEW.id IN(user_a,user_b) LOOP
      BEGIN PERFORM realtime.send(jsonb_build_object('changed',true),'changed','match:'||item.id,true); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Pacemate realtime broadcast unavailable'; END;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pacemate_restriction_changed AFTER UPDATE OF suspended ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.pacemate_restriction_changed();
REVOKE ALL ON FUNCTION public.pacemate_session_changed(),public.pacemate_restriction_changed() FROM PUBLIC,anon,authenticated;

-- Seed known city centres. Discovery distances are city-to-city, never GPS.
INSERT INTO public.city_coordinates(city_key,display_name,latitude,longitude) VALUES
('lagos','Lagos',6.5244,3.3792),('abuja','Abuja',9.0765,7.3986),('port harcourt','Port Harcourt',4.8156,7.0498),
('accra','Accra',5.6037,-0.187),('nairobi','Nairobi',-1.2921,36.8219),('cape town','Cape Town',-33.9249,18.4241),
('johannesburg','Johannesburg',-26.2041,28.0473),('london','London',51.5074,-0.1278),('paris','Paris',48.8566,2.3522),
('berlin','Berlin',52.52,13.405),('lisbon','Lisbon',38.7223,-9.1393),('porto','Porto',41.1579,-8.6291),
('barcelona','Barcelona',41.3851,2.1734),('madrid','Madrid',40.4168,-3.7038),('amsterdam','Amsterdam',52.3676,4.9041),
('rome','Rome',41.9028,12.4964),('dublin','Dublin',53.3498,-6.2603),('istanbul','Istanbul',41.0082,28.9784),
('dubai','Dubai',25.2048,55.2708),('singapore','Singapore',1.3521,103.8198),('tokyo','Tokyo',35.6762,139.6503),
('bangkok','Bangkok',13.7563,100.5018),('bali','Bali',-8.65,115.2167),('mumbai','Mumbai',19.076,72.8777),
('new york','New York',40.7128,-74.006),('los angeles','Los Angeles',34.0522,-118.2437),('toronto','Toronto',43.6532,-79.3832),
('mexico city','Mexico City',19.4326,-99.1332),('medellin','Medellín',6.2442,-75.5812),('sao paulo','São Paulo',-23.5505,-46.6333),
('buenos aires','Buenos Aires',-34.6037,-58.3816),('sydney','Sydney',-33.8688,151.2093),('melbourne','Melbourne',-37.8136,144.9631),
('auckland','Auckland',-36.8485,174.7633) ON CONFLICT DO NOTHING;

-- Remove privileges from trigger functions; only the backend or their triggers call them.
REVOKE ALL ON FUNCTION public.pacemate_match_notice(),public.pacemate_message_notice(),public.pacemate_photo_verification(),public.pacemate_broadcast() FROM PUBLIC,anon,authenticated;
COMMIT;
