-- Organizer-led local run clubs with persistent member chat.
-- Additive only. Existing events and event chats remain unchanged.
BEGIN;

CREATE TABLE public.run_clubs (
  id serial PRIMARY KEY,
  organizer_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 3 AND 80),
  city text NOT NULL CHECK(length(city) BETWEEN 1 AND 60),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX run_clubs_city_idx ON public.run_clubs(lower(city),id DESC) WHERE archived_at IS NULL;

CREATE TABLE public.run_club_members (
  club_id integer NOT NULL REFERENCES public.run_clubs(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(club_id,user_id)
);
CREATE INDEX run_club_members_user_idx ON public.run_club_members(user_id,club_id);

ALTER TABLE public.events ADD COLUMN club_id integer REFERENCES public.run_clubs(id) ON DELETE SET NULL;
CREATE INDEX events_club_schedule_idx ON public.events(club_id,starts_at,id) WHERE cancelled_at IS NULL;

CREATE TABLE public.run_club_messages (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES public.run_clubs(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX run_club_messages_page_idx ON public.run_club_messages(club_id,id);

ALTER TABLE public.run_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_club_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.run_clubs,public.run_club_members,public.run_club_messages FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.run_clubs,public.run_club_members,public.run_club_messages TO service_role;
REVOKE ALL ON SEQUENCE public.run_clubs_id_seq,public.run_club_messages_id_seq FROM PUBLIC,anon,authenticated;
GRANT ALL ON SEQUENCE public.run_clubs_id_seq,public.run_club_messages_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.pacemate_realtime_allowed(topic text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE me text:=auth.uid()::text; item integer;
BEGIN
  IF me IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=me AND NOT suspended) THEN RETURN false; END IF;
  IF topic ~ '^match:[0-9]+$' THEN
    item:=split_part(topic,':',2)::integer;
    RETURN EXISTS(SELECT 1 FROM public.matches m JOIN public.profiles a ON a.id=m.user_a JOIN public.profiles b ON b.id=m.user_b WHERE m.id=item AND me IN(m.user_a,m.user_b) AND NOT a.suspended AND NOT b.suspended AND NOT EXISTS(SELECT 1 FROM public.blocks WHERE (blocker_id=m.user_a AND blocked_id=m.user_b) OR(blocker_id=m.user_b AND blocked_id=m.user_a)));
  ELSIF topic ~ '^event:[0-9]+$' THEN
    item:=split_part(topic,':',2)::integer;
    RETURN EXISTS(SELECT 1 FROM public.events e WHERE e.id=item AND e.cancelled_at IS NULL AND (e.host_id=me OR EXISTS(SELECT 1 FROM public.rsvps r WHERE r.event_id=e.id AND r.user_id=me)) AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=me AND b.blocked_id=e.host_id) OR(b.blocker_id=e.host_id AND b.blocked_id=me)));
  ELSIF topic ~ '^club:[0-9]+$' THEN
    item:=split_part(topic,':',2)::integer;
    RETURN EXISTS(SELECT 1 FROM public.run_clubs c JOIN public.run_club_members cm ON cm.club_id=c.id WHERE c.id=item AND c.archived_at IS NULL AND cm.user_id=me AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=c.organizer_id AND p.suspended) AND NOT EXISTS(SELECT 1 FROM public.blocks b WHERE (b.blocker_id=me AND b.blocked_id=c.organizer_id) OR (b.blocker_id=c.organizer_id AND b.blocked_id=me)));
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION public.pacemate_run_club_broadcast() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(jsonb_build_object('changed',true),'changed','club:'||NEW.club_id,true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Pacemate club broadcast unavailable';
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER run_club_message_broadcast AFTER INSERT ON public.run_club_messages
FOR EACH ROW EXECUTE FUNCTION public.pacemate_run_club_broadcast();

REVOKE ALL ON FUNCTION public.pacemate_run_club_broadcast() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
