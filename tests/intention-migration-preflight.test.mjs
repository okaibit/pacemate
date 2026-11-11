import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('supabase/migrations/20261111010000_intention_connections.sql','utf8');

test('conversation trigger preflight verifies catalog structure, not rendered SQL text',()=>{
 assert.match(migration,/JOIN pg_class target_table ON target_table\.oid=t\.tgrelid/);
 assert.match(migration,/target_schema\.nspname='public' AND target_table\.relname='matches'/);
 assert.match(migration,/t\.tgname='direct_chat_match' AND NOT t\.tgisinternal/);
 assert.match(migration,/v_trigger\.tgtype <> 5/);
 assert.match(migration,/v_trigger\.tgenabled NOT IN \('O','A'\)/);
 assert.match(migration,/v_trigger\.function_schema IS DISTINCT FROM 'public'/);
 assert.match(migration,/v_trigger\.function_name IS DISTINCT FROM 'pacemate_create_conversation'/);
 assert.doesNotMatch(migration,/v_trigger IS DISTINCT FROM 'CREATE TRIGGER/);
});

test('conversation and message relationship preflight tolerates PostgreSQL parenthesis rendering',()=>{
 assert.match(migration,/regexp_replace\(pg_get_constraintdef\(oid\), '\[\[:space:\]\(\)\]', '', 'g'\)='CHECKconversation_id=match_id'/);
});
