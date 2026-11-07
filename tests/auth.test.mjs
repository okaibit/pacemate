import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../src/auth-client.js';

const user = { id: 'member-1', email: 'test@example.com' };
function setup(fetcher, hash = '') {
  const values = new Map();
  const location = { origin: 'http://localhost:5173', hash, assign(value) { this.destination = value; } };
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const client = createAuthClient({ url: 'https://test.supabase.co', key: 'sb_publishable_test', storage, fetcher, location });
  return { client, storage, location, values };
}
const tokens = (overrides = {}) => ({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user, ...overrides });

test('password login sends the publishable key as apikey and stores tokens, never the password', async () => {
  const { client, values } = setup(async (url, options) => {
    assert.equal(url, 'https://test.supabase.co/auth/v1/token?grant_type=password');
    assert.equal(options.headers.apikey, 'sb_publishable_test');
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { email: user.email, password: 'password123' });
    return Response.json(tokens());
  });
  assert.deepEqual(await client.login(user.email, 'password123'), user);
  assert.equal((await client.getSession()).access_token, 'access');
  assert.ok(![...values.values()].join().includes('password123'));
});

test('concurrent calls share a single token refresh', async () => {
  let calls = 0;
  const { client, storage } = setup(async (url, options) => {
    calls++;
    assert.match(url, /grant_type=refresh_token/);
    assert.equal(JSON.parse(options.body).refresh_token, 'old-refresh');
    await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json(tokens());
  });
  storage.setItem(client.storageKey, JSON.stringify({ access_token: 'old', refresh_token: 'old-refresh', expires_at: 1, user }));
  const result = await Promise.all([client.getSession(), client.getSession(), client.getSession()]);
  assert.equal(calls, 1);
  assert.ok(result.every(session => session.access_token === 'access'));
});

test('rejected refresh clears the session and emits sign out', async () => {
  const { client, storage } = setup(async () => Response.json({ msg: 'Invalid refresh token' }, { status: 400 }));
  storage.setItem(client.storageKey, JSON.stringify({ access_token: 'old', refresh_token: 'old', expires_at: 1, user }));
  let event;
  client.onChange(value => { event = value; });
  await assert.rejects(client.getSession(), /Invalid refresh token/);
  assert.equal(await client.getSession(), null);
  assert.equal(event, 'SIGNED_OUT');
});

test('unconfirmed signup does not create an authenticated session', async () => {
  const { client } = setup(async (url, options) => {
    assert.ok(url.includes('redirect_to=http%3A%2F%2Flocalhost%3A5173%2F'));
    assert.ok(JSON.parse(options.body).data.terms_accepted_at);
    return Response.json({ ...user, identities: [] });
  });
  assert.equal((await client.signup(user.email, 'password123')).emailVerified, false);
  assert.equal(await client.getSession(), null);
});

test('confirmed signup preserves the Supabase session', async () => {
  const { client } = setup(async () => Response.json(tokens()));
  assert.equal((await client.signup(user.email, 'password123')).emailVerified, true);
  assert.equal((await client.getSession()).user.id, user.id);
});

test('recovery callback verifies the user before persisting callback tokens', async () => {
  const { client } = setup(async (url, options) => {
    assert.match(url, /\/user$/);
    assert.equal(options.headers.Authorization, 'Bearer recovery-access');
    return Response.json(user);
  }, '#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery');
  assert.deepEqual(await client.handleCallback(), { type: 'recovery' });
  assert.equal((await client.getSession()).access_token, 'recovery-access');
});

test('invalid callback tokens cannot create a session', async () => {
  const { client } = setup(async () => Response.json({ msg: 'Invalid token' }, { status: 401 }), '#access_token=forged&refresh_token=forged');
  await assert.rejects(client.handleCallback(), /Invalid token/);
  assert.equal(await client.getSession(), null);
});

test('logout clears local state even when the service cannot be reached', async () => {
  const { client, storage } = setup(async () => { throw new Error('offline'); });
  storage.setItem(client.storageKey, JSON.stringify({ ...tokens(), expires_at: Date.now() / 1000 + 3600 }));
  await assert.rejects(client.logout(), /Cannot reach/);
  assert.equal(await client.getSession(), null);
});

test('malformed success responses fail visibly', async () => {
  const { client } = setup(async () => new Response('<html>fallback</html>', { status: 200 }));
  await assert.rejects(client.login(user.email, 'password123'), /unexpected response/);
  assert.equal(await client.getSession(), null);
});

test('OAuth redirects to the configured Supabase project and back to this origin', () => {
  const { client, location } = setup();
  client.oauth('google');
  const target = new URL(location.destination);
  assert.equal(target.origin, 'https://test.supabase.co');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), 'http://localhost:5173/');
});

test('an in-flight refresh cannot restore a session after logout', async () => {
  let resolveRefresh;
  const { client, storage } = setup(() => new Promise(resolve => { resolveRefresh = resolve; }));
  storage.setItem(client.storageKey, JSON.stringify({ access_token: 'old', refresh_token: 'old-refresh', expires_at: 1, user }));
  const pending = client.getSession();
  client.clear();
  resolveRefresh(Response.json(tokens()));
  assert.equal(await pending, null);
  assert.equal(await client.getSession(), null);
});

test('a stale refresh failure cannot clear a replacement session from another tab', async () => {
  let resolveRefresh;
  const { client, storage } = setup(() => new Promise(resolve => { resolveRefresh = resolve; }));
  storage.setItem(client.storageKey, JSON.stringify({ access_token: 'old', refresh_token: 'old-refresh', expires_at: 1, user }));
  const pending = client.getSession();
  storage.setItem(client.storageKey, JSON.stringify({ access_token: 'new', refresh_token: 'new-refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'other' } }));
  resolveRefresh(Response.json({ msg: 'Token already used' }, { status: 400 }));
  await assert.rejects(pending, /already used/);
  assert.equal((await client.getSession()).user.id, 'other');
});
