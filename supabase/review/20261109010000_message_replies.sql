-- Apply to the test project in Supabase SQL Editor. Additive; existing messages remain unchanged.
BEGIN;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id integer REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
-- Replies are written only by the authenticated message API, which checks same-chat membership.
-- Existing client grants and RLS policies are not broadened.
NOTIFY pgrst, 'reload schema';
COMMIT;
