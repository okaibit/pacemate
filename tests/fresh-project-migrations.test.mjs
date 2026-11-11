import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const migrationDir='supabase/migrations';
const files=(await readdir(migrationDir)).filter(name=>name.endsWith('.sql')).sort();
const chat=await readFile(`${migrationDir}/20261107050000_direct_chat_push.sql`,'utf8');
const replies=await readFile(`${migrationDir}/20261109010000_message_replies.sql`,'utf8');
const clubs=await readFile(`${migrationDir}/20261112010000_run_clubs.sql`,'utf8');

test('fresh project migration order includes chat and replies before intention cutover',()=>{
 const chatIndex=files.indexOf('20261107050000_direct_chat_push.sql');
 const repliesIndex=files.indexOf('20261109010000_message_replies.sql');
 const intentionIndex=files.indexOf('20261111010000_intention_connections.sql');
 const clubsIndex=files.indexOf('20261112010000_run_clubs.sql');
 assert.ok(chatIndex>=0&&repliesIndex>chatIndex&&intentionIndex>repliesIndex&&clubsIndex>intentionIndex);
});

test('run clubs use additive schema, server-only rows and club-member realtime authorization',()=>{
 assert.match(clubs,/ALTER TABLE public\.events ADD COLUMN club_id integer REFERENCES public\.run_clubs\(id\) ON DELETE SET NULL/);
 assert.match(clubs,/CREATE TABLE public\.run_club_messages/);
 assert.match(clubs,/REVOKE ALL ON public\.run_clubs,public\.run_club_members,public\.run_club_messages FROM PUBLIC,anon,authenticated/);
 assert.match(clubs,/cm\.user_id=me/);
 assert.match(clubs,/CREATE TRIGGER run_club_message_broadcast AFTER INSERT ON public\.run_club_messages/);
 assert.doesNotMatch(clubs,/DROP TABLE|TRUNCATE|DELETE FROM/);
});

test('chat browser permissions are read-only except owner-managed push subscriptions',()=>{
 assert.match(chat,/GRANT SELECT ON public\.conversations,public\.messages,public\.message_reactions TO authenticated/);
 assert.match(chat,/GRANT SELECT ON public\.conversation_members TO authenticated/);
 assert.doesNotMatch(chat,/GRANT (?:INSERT|UPDATE|DELETE)[^;]* TO authenticated/);
 assert.doesNotMatch(chat,/CREATE POLICY chat_message_send|CREATE POLICY chat_reaction_insert|CREATE POLICY chat_reaction_delete/);
 assert.match(chat,/GRANT SELECT, INSERT, DELETE ON public\.push_subscriptions TO authenticated/);
});

test('replies preserve existing messages and stay behind the authenticated API',()=>{
 assert.match(replies,/ADD COLUMN IF NOT EXISTS reply_to_id integer REFERENCES public\.messages\(id\) ON DELETE SET NULL/);
 assert.match(replies,/CREATE INDEX IF NOT EXISTS messages_reply_to_idx/);
 assert.match(replies,/Existing client grants and RLS policies are not broadened/);
});
