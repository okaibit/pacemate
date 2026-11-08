import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

let handler;
let databaseReads = 0;
let connection;
globalThis.Deno = {
  env: { get(name) { if (name === 'PACEMATE_DATABASE_URL') { databaseReads++; return connection; } return undefined; } },
  serve(fn) { handler = fn; },
};
// Load the exact production bundle graph, replacing only the network driver.
// It must be possible to check health and reject anonymous users without a DB.
const bundle = await rolldown({
  input: 'supabase/functions/pacemate/index.ts',
  plugins: [{
    name: 'test-database-driver',
    resolveId(id) { if (id === 'postgres') return '\0test-postgres'; if(id==='web-push')return '\0test-web-push'; },
    load(id) { if(id==='\0test-web-push')return 'export default {setVapidDetails(){},sendNotification(){throw new Error("Unexpected push delivery")}}'; if (id === '\0test-postgres') return `export default function postgres() {
      globalThis.__databaseConnections = (globalThis.__databaseConnections || 0) + 1;
      return {
        options: { parsers: {}, serializers: {} },
        unsafe(query) {
          if (query === "SELECT 1 AS ok") return Promise.resolve([{ ok: 1 }]);
          globalThis.__statsQueries = (globalThis.__statsQueries || 0) + 1;
          if (globalThis.__statsFailure) return Promise.reject(globalThis.__statsFailure);
          if (!query.includes('public.profiles') || !query.includes('public.matches') || !query.includes('public.events')) throw new Error('Stats tables must be schema-qualified');
          return Promise.resolve([{ members: '3', matches: '3', events: '3', cities: '[{"city":"Lagos","n":2}]' }]);
        },
        end: async () => {},
      };
    }`; },
  }],
});
const output = await bundle.generate({ format: 'esm', codeSplitting: false, minify: true });
await bundle.close();
await import('data:text/javascript;base64,' + Buffer.from(output.output[0].code).toString('base64'));

test('bundled worker health works without initializing the database', async () => {
  const response = await handler(new Request('https://function.test/pacemate/api/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', version: 'chat-5', databaseConfigured: false });
});

test('anonymous private requests are rejected before database module loading', async () => {
  databaseReads = 0;
  for (const path of ['/api/me', '/api/discover', '/api/matches', '/api/today', '/api/foundation', '/api/foundation/sports', '/api/location', '/api/foundation/members/member-b']) {
    const response = await handler(new Request('https://function.test/pacemate' + path));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Please log in.');
  }
  assert.equal(databaseReads, 0);
});

test('preflight returns CORS headers without loading application handlers', async () => {
  const response = await handler(new Request('https://function.test/pacemate/api/me', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
});

test('worker rejects unapproved browser origins', async () => {
  const response = await handler(new Request('https://function.test/pacemate/api/health', { headers: { Origin: 'https://evil.example' } }));
  assert.equal(response.status, 403);
});


test('SQL health probe checks an actual driver query independently of application tables', async () => {
  assert.equal(globalThis.__databaseConnections || 0, 0);
  connection = 'postgresql://postgres.project:test-password@aws-0-test.pooler.supabase.com:6543/postgres';
  const response = await handler(new Request('https://function.test/pacemate/api/health?database=1'));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).database, { status: 'ok', connectionType: 'transaction-pooler', port: 6543 });
});

test('stats uses one direct query and preserves the public response shape', async () => {
  const response = await handler(new Request('https://function.test/pacemate/api/stats'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { members: 3, matches: 3, events: 3, cities: [{ city: 'Lagos', n: 2 }] });
  assert.equal(globalThis.__statsQueries, 1);
});


test('stats surfaces permission failures without disclosing driver messages', async () => {
  globalThis.__statsFailure = { code: '42501', message: 'private-password-in-driver-error' };
  try {
    const response = await handler(new Request('https://function.test/pacemate/api/stats'));
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.code, '42501');
    assert.ok(!JSON.stringify(result).includes('private-password'));
  } finally { globalThis.__statsFailure = undefined; }
});
