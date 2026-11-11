-- Phase 1 intention-aware connection expansion.
-- Apply only after a separately approved hosted-baseline review and backup/restore rehearsal.
-- The hosted migration ledger is known to be empty. Do not replay historical migrations.
BEGIN;

DO $$
DECLARE
  v_trigger record;
  v_function text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='swipes' AND column_name IN ('id','intention','acted_at')
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='matches' AND column_name IN ('intention','ended_at','ended_reason')
  ) THEN
    RAISE EXCEPTION 'Phase 1 columns already exist; reconcile partial deployment before continuing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.swipes'::regclass AND conname='swipes_pkey' AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (swiper_id, target_id)') THEN
    RAISE EXCEPTION 'Unexpected swipes primary key; stop and reconcile hosted schema';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.swipes'::regclass) THEN
    RAISE EXCEPTION 'Foreign keys reference swipes; review dependencies before identity cutover';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class i JOIN pg_index x ON x.indexrelid=i.oid WHERE i.relname='matches_pair_idx' AND x.indrelid='public.matches'::regclass AND x.indisunique AND x.indisvalid AND x.indisready AND x.indislive AND x.indpred IS NULL AND NOT x.indisprimary AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=i.oid) AND pg_get_indexdef(i.oid)='CREATE UNIQUE INDEX matches_pair_idx ON public.matches USING btree (user_a, user_b)') THEN
    RAISE EXCEPTION 'Unexpected matches_pair_idx definition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.conversations'::regclass AND conname='conversations_user_a_user_b_key' AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (user_a, user_b)') THEN
    RAISE EXCEPTION 'Unexpected conversation pair constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE user_a >= user_b) OR EXISTS (SELECT 1 FROM public.conversations WHERE user_a >= user_b) THEN
    RAISE EXCEPTION 'Non-canonical user pair found; stop and reconcile before changing uniqueness';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.conversations'::regclass AND conname='conversations_id_fkey' AND contype='f' AND convalidated AND pg_get_constraintdef(oid)='FOREIGN KEY (id) REFERENCES matches(id) ON DELETE CASCADE')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='messages_match_id_matches_id_fkey' AND contype='f' AND convalidated AND pg_get_constraintdef(oid)='FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='messages_conversation_id_fkey' AND contype='f' AND convalidated AND pg_get_constraintdef(oid)='FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='direct_chat_match_consistent' AND contype='c' AND convalidated AND regexp_replace(pg_get_constraintdef(oid), '[[:space:]()]', '', 'g')='CHECKconversation_id=match_id') THEN
    RAISE EXCEPTION 'Unexpected direct-chat foreign keys or equality check; stop and reconcile';
  END IF;

  SELECT t.tgtype, t.tgenabled, function_schema.nspname AS function_schema,
    p.proname AS function_name
  INTO v_trigger
  FROM pg_trigger t
  JOIN pg_class target_table ON target_table.oid=t.tgrelid
  JOIN pg_namespace target_schema ON target_schema.oid=target_table.relnamespace
  JOIN pg_proc p ON p.oid=t.tgfoid
  JOIN pg_namespace function_schema ON function_schema.oid=p.pronamespace
  WHERE target_schema.nspname='public' AND target_table.relname='matches'
    AND t.tgname='direct_chat_match' AND NOT t.tgisinternal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected trigger direct_chat_match on public.matches was not found';
  END IF;
  -- tgtype 5 is AFTER INSERT FOR EACH ROW (TRIGGER_TYPE_INSERT | TRIGGER_TYPE_ROW).
  -- Check the catalog attributes instead of comparing pg_get_triggerdef(), whose
  -- rendering of schema qualifications depends on the active search_path.
  IF v_trigger.tgtype <> 5 OR v_trigger.tgenabled NOT IN ('O','A')
    OR v_trigger.function_schema IS DISTINCT FROM 'public'
    OR v_trigger.function_name IS DISTINCT FROM 'pacemate_create_conversation' THEN
    RAISE EXCEPTION 'direct_chat_match must be an enabled AFTER INSERT row trigger on public.matches bound to public.pacemate_create_conversation()';
  END IF;
  SELECT p.prosrc INTO v_function
  FROM pg_proc p WHERE p.oid='public.pacemate_create_conversation()'::regprocedure;
  IF regexp_replace(v_function, '[[:space:]]', '', 'g') NOT IN (
    'BEGININSERTINTOpublic.conversations(id,user_a,user_b,created_at)VALUES(NEW.id,NEW.user_a,NEW.user_b,NEW.created_at);RETURNNEW;END',
    'BEGININSERTINTOpublic.conversations(id,user_a,user_b,created_at)VALUES(NEW.id,NEW.user_a,NEW.user_b,NEW.created_at);RETURNNEW;END;'
  ) THEN
    RAISE EXCEPTION 'Conversation trigger function differs from the verified hosted behavior';
  END IF;
END $$;

ALTER TABLE public.swipes ADD COLUMN intention text;
ALTER TABLE public.swipes ADD COLUMN acted_at timestamptz;
UPDATE public.swipes SET acted_at=created_at WHERE acted_at IS NULL;
ALTER TABLE public.swipes ALTER COLUMN acted_at SET DEFAULT clock_timestamp();
ALTER TABLE public.swipes ALTER COLUMN acted_at SET NOT NULL;
ALTER TABLE public.swipes ADD COLUMN id integer GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE public.swipes DROP CONSTRAINT swipes_pkey;
ALTER TABLE public.swipes ADD CONSTRAINT swipes_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX swipes_legacy_pair_unique ON public.swipes(swiper_id,target_id) WHERE intention IS NULL;
CREATE UNIQUE INDEX swipes_intention_pair_unique ON public.swipes(swiper_id,target_id,intention) WHERE intention IS NOT NULL;
ALTER TABLE public.swipes ADD CONSTRAINT swipes_intention_check CHECK (intention IS NULL OR intention IN ('play','friend','date'));

ALTER TABLE public.matches ADD COLUMN intention text;
ALTER TABLE public.matches ADD COLUMN ended_at timestamptz;
ALTER TABLE public.matches ADD COLUMN ended_reason text;
ALTER TABLE public.matches ADD CONSTRAINT matches_intention_check CHECK (intention IS NULL OR intention IN ('play','friend','date'));
ALTER TABLE public.matches ADD CONSTRAINT matches_ended_reason_check CHECK (ended_reason IS NULL OR ended_reason IN ('unmatched','blocked','moderated'));
ALTER TABLE public.matches ADD CONSTRAINT matches_end_state_check CHECK ((ended_at IS NULL) = (ended_reason IS NULL));
DROP INDEX public.matches_pair_idx;
CREATE UNIQUE INDEX matches_legacy_pair_unique ON public.matches(user_a,user_b) WHERE intention IS NULL;
CREATE UNIQUE INDEX matches_active_intention_unique ON public.matches(user_a,user_b,intention) WHERE intention IS NOT NULL AND ended_at IS NULL;

ALTER TABLE public.conversations DROP CONSTRAINT conversations_user_a_user_b_key;

CREATE FUNCTION public.pacemate_intention_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
  IF OLD.intention IS DISTINCT FROM NEW.intention THEN
    RAISE EXCEPTION 'Connection intention cannot be changed after creation';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER swipes_intention_immutable BEFORE UPDATE OF intention ON public.swipes
FOR EACH ROW EXECUTE FUNCTION public.pacemate_intention_immutable();
CREATE TRIGGER matches_intention_immutable BEFORE UPDATE OF intention ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.pacemate_intention_immutable();

CREATE OR REPLACE FUNCTION public.pacemate_create_conversation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  INSERT INTO public.conversations(id,user_a,user_b,created_at)
  VALUES(NEW.id,NEW.user_a,NEW.user_b,NEW.created_at);
  RETURN NEW;
END;
$function$;

COMMIT;
