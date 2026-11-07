-- REVIEW ONLY. Apply after chat_push.sql, deploying send-push and adding Vault secrets.
-- In Dashboard Vault, add push_function_url (https://PROJECT.supabase.co/functions/v1/send-push)
-- and push_webhook_secret (same value as Edge secret PUSH_WEBHOOK_SECRET).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE FUNCTION public.pacemate_message_push_webhook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target text; token text;
BEGIN
 SELECT decrypted_secret INTO target FROM vault.decrypted_secrets WHERE name='push_function_url';
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='push_webhook_secret';
 IF target IS NULL OR token IS NULL THEN RAISE EXCEPTION 'Configure push webhook Vault secrets first'; END IF;
 PERFORM net.http_post(url:=target,headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',token),
 body:=jsonb_build_object('type','INSERT','schema','public','table','messages','record',jsonb_build_object('id',NEW.id)),timeout_milliseconds:=15000);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_message_push_webhook() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER message_push_webhook AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.pacemate_message_push_webhook();
