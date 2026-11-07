import test from 'node:test';import assert from 'node:assert/strict';
import {requestFailure} from '../supabase/functions/pacemate/server/request-failure.js';
test('wrapped database disconnects return a retryable status without exposing SQL or credentials',()=>{
 const result=requestFailure(new Error('SELECT private fields',{cause:Object.assign(new Error('postgres://secret:password@host/db'),{code:'CONNECTION_CLOSED'})}));
 assert.equal(result.status,503);assert.equal(result.code,'CONNECTION_CLOSED');assert.ok(!JSON.stringify(result).includes('password'));assert.ok(!JSON.stringify(result).includes('SELECT'));
});
test('timeouts are distinguished from programming errors',()=>{
 assert.equal(requestFailure({code:'DATABASE_TIMEOUT'}).status,503);assert.equal(requestFailure(new TypeError('private data')).status,500);
});
test('cyclic errors cannot hang failure handling',()=>{const error={};error.cause=error;assert.equal(requestFailure(error).code,'INTERNAL_ERROR');});
