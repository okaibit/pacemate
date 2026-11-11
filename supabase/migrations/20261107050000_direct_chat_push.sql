-- Fresh-project direct chat and push schema.
-- Requires the core, community, and foundation migrations. Creates the chat
-- schema expected by the intention-aware migration. No webhook is installed.
BEGIN;

-- REVIEW ONLY: run manually after reviewing DIRECT_CHAT.md. Not auto-applied.
-- Requires the original and community migrations. Existing messages are preserved.
CREATE TABLE public.conversations (
  id integer PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  user_a text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(user_a < user_b), UNIQUE(user_a,user_b)
);
INSERT INTO public.conversations SELECT id,user_a,user_b,created_at FROM public.matches;
CREATE FUNCTION public.pacemate_create_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.conversations(id,user_a,user_b,created_at)
  VALUES(NEW.id,NEW.user_a,NEW.user_b,NEW.created_at);
  RETURN NEW;
END $$;
CREATE TRIGGER direct_chat_match AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.pacemate_create_conversation();

ALTER TABLE public.messages
  ADD COLUMN conversation_id integer REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN type text NOT NULL DEFAULT 'text' CHECK(type IN('text','link','image')),
  ADD COLUMN link_url text CHECK(link_url IS NULL OR (length(link_url)<=2048 AND link_url ~ '^https?://')),
  ADD COLUMN link_meta jsonb,
  ADD COLUMN status text NOT NULL DEFAULT 'sent' CHECK(status IN('sent','read')),
  ADD COLUMN read_at timestamptz,
  ADD COLUMN client_id uuid;
UPDATE public.messages SET conversation_id=match_id,
 type=CASE WHEN attachment_id IS NULL THEN 'text' ELSE 'image' END;
UPDATE public.messages m SET read_at=now(),status='read'
WHERE EXISTS(SELECT 1 FROM public.match_reads r WHERE r.match_id=m.match_id
  AND r.user_id<>m.sender_id AND r.last_read_id>=m.id);
ALTER TABLE public.messages ALTER COLUMN conversation_id SET NOT NULL;
ALTER TABLE public.messages ADD CONSTRAINT direct_chat_match_consistent CHECK(conversation_id=match_id);
CREATE UNIQUE INDEX direct_chat_client_id ON public.messages(sender_id,client_id) WHERE client_id IS NOT NULL;
CREATE INDEX direct_chat_page ON public.messages(conversation_id,id DESC);
CREATE INDEX direct_chat_unread ON public.messages(conversation_id,sender_id) WHERE read_at IS NULL;
CREATE TABLE public.message_reactions (
  message_id integer NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK(emoji IN('👍','❤️','😂','👏')),
  PRIMARY KEY(message_id,user_id)
);

-- Definer bypasses table RLS for membership checks, never accepts a caller user id.
CREATE FUNCTION public.pacemate_chat_member(chat_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversations c
 JOIN public.matches m ON m.id=c.id AND m.user_a=c.user_a AND m.user_b=c.user_b
 JOIN public.profiles a ON a.id=c.user_a JOIN public.profiles b ON b.id=c.user_b
 WHERE c.id=chat_id AND (SELECT auth.uid())::text IN(c.user_a,c.user_b)
 AND NOT a.suspended AND NOT b.suspended
 AND NOT EXISTS(SELECT 1 FROM public.blocks x
 WHERE(x.blocker_id=c.user_a AND x.blocked_id=c.user_b)
 OR(x.blocker_id=c.user_b AND x.blocked_id=c.user_a)))
$$;
CREATE FUNCTION public.pacemate_chat_reaction_member(msg_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.messages WHERE id=msg_id AND public.pacemate_chat_member(conversation_id))
$$;

-- Clients may only set the read_at column; the trigger supplies the trusted time.
-- Other columns remain immutable to clients even if grants are later broadened.
CREATE FUNCTION public.pacemate_direct_message_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed integer;
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.conversation_id:=coalesce(NEW.conversation_id,NEW.match_id);
   NEW.match_id:=coalesce(NEW.match_id,NEW.conversation_id);
   NEW.status:='sent'; NEW.read_at:=NULL; NEW.created_at:=now();
   IF NEW.attachment_id IS NOT NULL THEN NEW.type:='image'; END IF;
   IF auth.uid() IS NOT NULL THEN
     NEW.link_meta:=NULL;
     IF length(NEW.body)>2000 OR btrim(NEW.body)='' THEN RAISE EXCEPTION 'Message must contain 1–2000 characters'; END IF;
     IF NEW.type='image' THEN RAISE EXCEPTION 'Upload photos through the authenticated attachment API'; END IF;
     INSERT INTO public.feature_limits(key,hits) VALUES(auth.uid()::text||':direct-chat:'||floor(extract(epoch FROM now())/60)::text,1)
     ON CONFLICT(key) DO UPDATE SET hits=public.feature_limits.hits+1,updated_at=now() WHERE public.feature_limits.hits<30 RETURNING hits INTO allowed;
     IF allowed IS NULL THEN RAISE EXCEPTION 'Too many messages. Try again shortly.'; END IF;
   END IF;
 ELSE
   IF auth.uid() IS NOT NULL THEN
     IF OLD.sender_id=auth.uid()::text OR NOT public.pacemate_chat_member(OLD.conversation_id)
       THEN RAISE EXCEPTION 'Only an active recipient can acknowledge messages'; END IF;
     IF (to_jsonb(NEW)-'read_at') IS DISTINCT FROM (to_jsonb(OLD)-'read_at')
       THEN RAISE EXCEPTION 'Message content is immutable'; END IF;
     NEW.read_at:=coalesce(OLD.read_at,now());
   END IF;
   NEW.status:=CASE WHEN NEW.read_at IS NULL THEN 'sent' ELSE 'read' END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER direct_chat_guard BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.pacemate_direct_message_guard();

-- Keep existing match unread badges and older clients compatible with read_at.
CREATE FUNCTION public.pacemate_direct_read_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient text;
BEGIN
 IF NEW.read_at IS NOT NULL AND OLD.read_at IS NULL THEN
  SELECT CASE WHEN user_a=NEW.sender_id THEN user_b ELSE user_a END INTO recipient
  FROM public.conversations WHERE id=NEW.conversation_id;
  INSERT INTO public.match_reads(match_id,user_id,last_read_id) VALUES(NEW.match_id,recipient,NEW.id)
  ON CONFLICT(match_id,user_id) DO UPDATE SET last_read_id=greatest(public.match_reads.last_read_id,EXCLUDED.last_read_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER direct_chat_read_sync AFTER UPDATE OF read_at ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.pacemate_direct_read_sync();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
-- Remove prior message policies: permissive policies combine with OR.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='messages' LOOP
 EXECUTE format('DROP POLICY %I ON public.messages',p.policyname); END LOOP;
END $$;
REVOKE ALL ON public.conversations,public.messages,public.message_reactions FROM anon,authenticated;
GRANT ALL ON public.conversations,public.messages,public.message_reactions TO service_role;
GRANT SELECT ON public.conversations,public.messages,public.message_reactions TO authenticated;
GRANT ALL ON SEQUENCE public.messages_id_seq TO service_role;
CREATE POLICY chat_member_read ON public.conversations FOR SELECT TO authenticated
 USING(public.pacemate_chat_member(id));
CREATE POLICY chat_message_read ON public.messages FOR SELECT TO authenticated
 USING(public.pacemate_chat_member(conversation_id));
CREATE POLICY chat_reaction_read ON public.message_reactions FOR SELECT TO authenticated
 USING(public.pacemate_chat_reaction_member(message_id));

REVOKE ALL ON FUNCTION public.pacemate_chat_member(integer),public.pacemate_chat_reaction_member(integer),public.pacemate_create_conversation(),public.pacemate_direct_message_guard(),public.pacemate_direct_read_sync() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pacemate_chat_member(integer),public.pacemate_chat_reaction_member(integer) TO authenticated;
-- Postgres Changes checks SELECT RLS for each recipient. No DELETE subscription.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
 ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
 END IF;
END $$;

-- The push-subscription API remains owner-scoped through RLS.
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON public.push_subscriptions(user_id);
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
CREATE POLICY push_read_own ON public.push_subscriptions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid())::text);
CREATE POLICY push_insert_own ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid())::text AND length(endpoint)<4096 AND endpoint ~ '^https://' AND length(p256dh)<256 AND length(auth)<256 AND length(coalesce(user_agent,''))<=500);
CREATE POLICY push_delete_own ON public.push_subscriptions FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid())::text);
CREATE TABLE public.conversation_members (
 conversation_id integer REFERENCES public.conversations(id) ON DELETE CASCADE,
 user_id text REFERENCES public.profiles(id) ON DELETE CASCADE,
 muted_until timestamptz,
 PRIMARY KEY(conversation_id,user_id)
);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_members FROM anon, authenticated;
GRANT ALL ON public.conversation_members TO service_role;
GRANT SELECT ON public.conversation_members TO authenticated;
CREATE POLICY member_read ON public.conversation_members FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid())::text AND public.pacemate_chat_member(conversation_id));
-- Only the owner can track/read their presence. Service role can observe it.
CREATE POLICY push_presence_read ON realtime.messages FOR SELECT TO authenticated USING(extension='presence' AND realtime.topic()='push:'||(SELECT auth.uid())::text);
CREATE POLICY push_presence_track ON realtime.messages FOR INSERT TO authenticated WITH CHECK(extension='presence' AND realtime.topic()='push:'||(SELECT auth.uid())::text);
-- Webhook setup is separate: see PUSH_NOTIFICATIONS.md. No secrets in this file.

COMMIT;
