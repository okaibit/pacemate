-- Run after enabling pg_cron, pg_net and Vault, and creating the two Vault
-- secrets described in COMMUNITY_SETUP.md. This script contains no credentials.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='pacemate_dispatch_url')
     OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='pacemate_task_secret') THEN
    RAISE EXCEPTION 'Create pacemate_dispatch_url and pacemate_task_secret in Vault first';
  END IF;
END $$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='pacemate-notifications';
SELECT cron.schedule('pacemate-notifications','* * * * *',$job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='pacemate_dispatch_url' LIMIT 1),
    headers := jsonb_build_object('Content-Type','application/json','x-task-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='pacemate_task_secret' LIMIT 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
