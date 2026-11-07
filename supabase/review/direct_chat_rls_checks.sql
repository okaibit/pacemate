-- STAGING ONLY, after the proposed chat migration. All fixture rows roll back.
-- Do not run inside another transaction. SQL Editor must execute the whole file.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-0000000000a1','chat-rls-a@example.invalid'),
 ('00000000-0000-4000-8000-0000000000b2','chat-rls-b@example.invalid'),
 ('00000000-0000-4000-8000-0000000000c3','chat-rls-c@example.invalid');
INSERT INTO public.profiles(id,name,birthdate,gender,home_city,current_city) VALUES
 ('00000000-0000-4000-8000-0000000000a1','RLS A','1994-01-01','Man','Abuja','Abuja'),
 ('00000000-0000-4000-8000-0000000000b2','RLS B','1994-01-01','Woman','Abuja','Abuja'),
 ('00000000-0000-4000-8000-0000000000c3','RLS C','1994-01-01','Man','Abuja','Abuja');
INSERT INTO public.matches(user_a,user_b) VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2');
SELECT set_config('chat_test.match',(SELECT id::text FROM public.matches
 WHERE user_a='00000000-0000-4000-8000-0000000000a1' AND user_b='00000000-0000-4000-8000-0000000000b2'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
DO $$ DECLARE chat integer:=current_setting('chat_test.match')::int; msg integer; affected integer; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.conversations WHERE id=chat) THEN RAISE EXCEPTION 'FAIL: member cannot read conversation'; END IF;
 INSERT INTO public.messages(conversation_id,match_id,sender_id,body)
 VALUES(chat,chat,auth.uid()::text,'RLS test') RETURNING id INTO msg;
 PERFORM set_config('chat_test.message',msg::text,true);
 UPDATE public.messages SET read_at=now() WHERE id=msg;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'FAIL: sender changed own read timestamp'; END IF;
 BEGIN
  INSERT INTO public.messages(conversation_id,match_id,sender_id,body) VALUES(chat,chat,'00000000-0000-4000-8000-0000000000b2','spoof');
  RAISE EXCEPTION 'FAIL: sender spoof accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.messages SET body='tampered' WHERE id=msg;
  RAISE EXCEPTION 'FAIL: content edit accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.messages(conversation_id,match_id,sender_id,body,link_meta) VALUES(chat,chat,auth.uid()::text,'forged','{"title":"forged"}');
  RAISE EXCEPTION 'FAIL: forged link metadata accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES(msg,auth.uid()::text,'👍');
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b2',true);
DO $$ DECLARE msg integer:=current_setting('chat_test.message')::int; affected integer; stamp timestamptz; BEGIN
 UPDATE public.messages SET read_at='2000-01-01'::timestamptz WHERE id=msg;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'FAIL: recipient cannot acknowledge'; END IF;
 SELECT read_at INTO stamp FROM public.messages WHERE id=msg;
 IF stamp IS DISTINCT FROM now() THEN RAISE EXCEPTION 'FAIL: client controlled read timestamp'; END IF;
 DELETE FROM public.message_reactions WHERE message_id=msg;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'FAIL: removed another member reaction'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c3',true);
DO $$ DECLARE chat integer:=current_setting('chat_test.match')::int; BEGIN
 IF EXISTS(SELECT 1 FROM public.messages WHERE conversation_id=chat) OR EXISTS(SELECT 1 FROM public.conversations WHERE id=chat)
 OR EXISTS(SELECT 1 FROM public.message_reactions WHERE message_id=current_setting('chat_test.message')::int)
 THEN RAISE EXCEPTION 'FAIL: unrelated member can read'; END IF;
 BEGIN
  INSERT INTO public.messages(conversation_id,match_id,sender_id,body) VALUES(chat,chat,auth.uid()::text,'intrusion');
  RAISE EXCEPTION 'FAIL: unrelated member can send';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.message_reactions(message_id,user_id,emoji) VALUES(current_setting('chat_test.message')::int,auth.uid()::text,'👍');
  RAISE EXCEPTION 'FAIL: unrelated member can react';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO public.blocks(blocker_id,blocked_id) VALUES('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b2');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.messages WHERE conversation_id=current_setting('chat_test.match')::int)
 THEN RAISE EXCEPTION 'FAIL: blocked match can read'; END IF;
END $$;
RESET ROLE;
DELETE FROM public.blocks WHERE blocker_id='00000000-0000-4000-8000-0000000000a1' AND blocked_id='00000000-0000-4000-8000-0000000000b2';
UPDATE public.profiles SET suspended=true WHERE id='00000000-0000-4000-8000-0000000000b2';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.messages WHERE conversation_id=current_setting('chat_test.match')::int)
 THEN RAISE EXCEPTION 'FAIL: suspended counterpart can read'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM 1 FROM public.messages LIMIT 1;
  RAISE EXCEPTION 'FAIL: anonymous message access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'RLS checks passed; fixtures rolled back' AS result;
