import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionInfo, createDatabaseRuntime, databaseFailure } from '../supabase/functions/pacemate/db/runtime.js';

const uri = 'postgresql://postgres.project:encoded-password@aws-0-test.pooler.supabase.com:6543/postgres';

test('connection diagnostics distinguish transaction, session, and direct connections without exposing credentials', () => {
  assert.deepEqual(connectionInfo(uri), { connectionType: 'transaction-pooler', port: 6543 });
  assert.equal(connectionInfo(uri.replace(':6543/', ':5432/')).connectionType, 'session-pooler');
  assert.equal(connectionInfo('postgresql://postgres:password@db.project.supabase.co:5432/postgres').connectionType, 'direct');
  assert.ok(!JSON.stringify(connectionInfo(uri)).includes('encoded-password'));
});

test('missing and malformed database secrets fail before attempting a network connection', () => {
  for (const value of ['', 'https://project.supabase.co', 'postgresql://user@host/db', 'postgresql://user:%5BYOUR-PASSWORD%5D@host/db']) {
    assert.throws(() => connectionInfo(value), error => ['DATABASE_NOT_CONFIGURED', 'DATABASE_URL_INVALID'].includes(error.code));
  }
});

test('database connections are lazy, use transaction-pooler settings, and preserve bound query methods', async () => {
  let connections = 0;
  const runtime = createDatabaseRuntime({ connection: uri, log() {},
    connect(value, options) {
      connections++;
      assert.equal(value, uri);
      assert.equal(options.prepare, false);
      assert.equal(options.fetch_types, false);
      assert.equal(options.max, 1);
      assert.equal(options.ssl, 'require');
      return { end: async () => {} };
    },
    makeDatabase() { return { count: 7, select() { return this.count; } }; },
  });
  assert.equal(connections, 0);
  assert.equal(runtime.database.select(), 7);
  assert.equal(await runtime.withDeadline((_client, db) => db.select()), 7);
  assert.equal(connections, 1);
});

test('a stalled database operation times out, closes the pool, and permits a fresh connection', async () => {
  let connections = 0, closed = 0;
  const runtime = createDatabaseRuntime({ connection: uri, timeoutMs: 15, log() {},
    connect() { connections++; return { end: async () => { closed++; } }; },
    makeDatabase: () => ({}),
  });
  await assert.rejects(runtime.withDeadline(() => new Promise(() => {})), error => error.code === 'DATABASE_TIMEOUT');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(closed, 1);
  assert.equal(await runtime.withDeadline(() => 42), 42);
  assert.equal(connections, 2);
});

test('database failures return useful codes without reflecting raw credential-bearing messages', () => {
  const result = databaseFailure({ code: '28P01', message: uri });
  assert.equal(result.code, '28P01');
  assert.match(result.error, /authentication failed/);
  assert.ok(!JSON.stringify(result).includes('encoded-password'));
  assert.equal(databaseFailure({ code: '42P01' }).code, '42P01');
});
