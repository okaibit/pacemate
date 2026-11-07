-- REVIEW ONLY. Requires community_features and direct_chat SQL. Not auto-applied.
BEGIN;
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
GRANT SELECT, INSERT ON public.conversation_members TO authenticated;
GRANT UPDATE(muted_until) ON public.conversation_members TO authenticated;
CREATE POLICY member_read ON public.conversation_members FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid())::text AND public.pacemate_chat_member(conversation_id));
CREATE POLICY member_insert ON public.conversation_members FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid())::text AND public.pacemate_chat_member(conversation_id));
CREATE POLICY member_update ON public.conversation_members FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())::text AND public.pacemate_chat_member(conversation_id)) WITH CHECK(user_id=(SELECT auth.uid())::text AND public.pacemate_chat_member(conversation_id));
-- Only the owner can track/read their presence. Service role can observe it.
CREATE POLICY push_presence_read ON realtime.messages FOR SELECT TO authenticated USING(extension='presence' AND realtime.topic()='push:'||(SELECT auth.uid())::text);
CREATE POLICY push_presence_track ON realtime.messages FOR INSERT TO authenticated WITH CHECK(extension='presence' AND realtime.topic()='push:'||(SELECT auth.uid())::text);
COMMIT;
-- Webhook setup is separate: see PUSH_NOTIFICATIONS.md. No secrets in this file.
