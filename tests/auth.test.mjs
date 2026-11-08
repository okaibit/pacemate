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
    assert.equal(JSON.parse(options.body).data, undefined);
    assert.ok(new URL(new URL(url).searchParams.get('redirect_to')).searchParams.get('auth_state'));
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
  const { client, location, storage } = setup(async (url, options) => {
    if (url.includes('/recover?')) return Response.json({});
    assert.match(url, /\/user$/);
    assert.equal(options.headers.Authorization, 'Bearer recovery-access');
    return Response.json(user);
  }, '#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery');
  await client.recover(user.email);
  location.search = '?auth_state=' + JSON.parse(storage.getItem(client.storageKey + ':transaction')).state;
  assert.deepEqual(await client.handleCallback(), { type: 'recovery' });
  assert.equal((await client.getSession()).access_token, 'recovery-access');
});

test('invalid callback tokens cannot create a session', async () => {
  const { client, location, storage } = setup(async url => url.includes('/recover?') ? Response.json({}) : Response.json({ msg: 'Invalid token' }, { status: 401 }), '#access_token=forged&refresh_token=forged&type=recovery');
  await client.recover(user.email);
  location.search = '?auth_state=' + JSON.parse(storage.getItem(client.storageKey + ':transaction')).state;
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

test('OAuth redirects to the configured Supabase project and back to this origin', async () => {
  const { client, location } = setup();
  await client.oauth('google');
  const target = new URL(location.destination);
  assert.equal(target.origin, 'https://test.supabase.co');
  assert.equal(target.searchParams.get('provider'), 'google');
  const redirect = new URL(target.searchParams.get('redirect_to'));
  assert.equal(redirect.origin, 'http://localhost:5173');
  assert.match(redirect.searchParams.get('auth_state'), /^[a-f0-9]{64}$/);
  assert.equal(target.searchParams.get('code_challenge_method'), 's256');
  assert.match(target.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
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

test('OAuth refuses missing Supabase configuration before navigating',async()=>{
 for(const config of [{url:'',key:'public'},{url:'https://test.supabase.co',key:''}]){
  let navigated=false;
  const client=createAuthClient({...config,storage:{getItem:()=>null},location:{origin:'http://localhost:5173',assign(){navigated=true;}}});
  await assert.rejects(client.oauth('google'),/not configured/);assert.equal(navigated,false);
 }
});

function oauthReturn(location, code = 'one-use-code') {
 const target = new URL(location.destination);
 const redirect = new URL(target.searchParams.get('redirect_to'));
 redirect.searchParams.set('code', code);
 location.search = redirect.search;
 location.hash = '';
 return target;
}

test('unsolicited callbacks cannot create a session or contact Auth', async()=>{
 for (const callback of [{search:'?code=unsolicited&auth_state=anything'}, {hash:'#access_token=access&refresh_token=refresh'}]) {
  const {client,location}=setup(()=>{assert.fail('Unsolicited callback contacted Auth');});
  Object.assign(location,callback);
  await assert.rejects(client.handleCallback(), /callback rejected.*Start sign-in again/);
  assert.equal(await client.getSession(),null);
 }
});

test('a mismatched state consumes the pending attempt without contacting Auth',async()=>{
 const {client,location,storage}=setup(()=>assert.fail('Mismatched state contacted Auth'));
 await client.oauth('google');oauthReturn(location);
 location.search=location.search.replace(/auth_state=[^&]+/,'auth_state=wrong');
 await assert.rejects(client.handleCallback(), /callback rejected/);
 assert.equal(storage.getItem(client.storageKey+':transaction'),undefined);
 assert.equal(await client.getSession(),null);
});

test('normal OAuth exchanges the stored PKCE verifier and verifies the user before saving',async()=>{
 let calls=0,verifier;
 const {client,location,storage}=setup(async(url,options)=>{
  calls++;
  assert.equal(storage.getItem(client.storageKey+':transaction'),undefined);
  assert.equal(await client.getSession(),null);
  if(calls===1){assert.match(url,/grant_type=pkce$/);assert.deepEqual(JSON.parse(options.body),{auth_code:'one-use-code',code_verifier:verifier});return Response.json(tokens());}
  assert.match(url,/\/user$/);assert.equal(options.headers.Authorization,'Bearer access');return Response.json(user);
 });
 await client.oauth('google');
 const pending=JSON.parse(storage.getItem(client.storageKey+':transaction'));verifier=pending.verifier;
 const target=oauthReturn(location);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 assert.equal(target.searchParams.get('code_challenge'),Buffer.from(digest).toString('base64url'));
 assert.deepEqual(await client.handleCallback(),{type:'oauth'});
 assert.equal((await client.getSession()).user.id,user.id);assert.equal(calls,2);
 // Replay must not exchange again, even while a previous session exists.
 await assert.rejects(client.handleCallback(),/callback rejected/);assert.equal(calls,2);
});

test('a code replay after clearing the established session is rejected',async()=>{
 const {client,location}=setup(async url=>Response.json(url.includes('/token?')?tokens():user));
 await client.oauth('google');oauthReturn(location);await client.handleCallback();client.clear();
 await assert.rejects(client.handleCallback(),/callback rejected/);assert.equal(await client.getSession(),null);
});

test('OAuth rejects implicit tokens, expired transactions and malformed transaction storage',async()=>{
 for(const kind of ['implicit','expired','malformed']){
  const {client,location,storage}=setup(()=>assert.fail('Rejected callback contacted Auth'));
  await client.oauth('google');oauthReturn(location);
  if(kind==='implicit')location.hash='#access_token=access&refresh_token=refresh';
  if(kind==='expired'){const pending=JSON.parse(storage.getItem(client.storageKey+':transaction'));pending.createdAt=Date.now()-3600001;storage.setItem(client.storageKey+':transaction',JSON.stringify(pending));}
  if(kind==='malformed')storage.setItem(client.storageKey+':transaction','{broken');
  await assert.rejects(client.handleCallback(),/callback rejected/);assert.equal(await client.getSession(),null);
 }
});

test('OAuth survives navigation with only the same tab transaction storage',async()=>{
 const {client,location,storage}=setup();
 const pendingValues=new Map();
 const transactionStorage={getItem:key=>pendingValues.get(key),setItem:(key,value)=>pendingValues.set(key,value),removeItem:key=>pendingValues.delete(key)};
 const options={url:'https://test.supabase.co',key:'public',storage,transactionStorage,location,fetcher:async url=>Response.json(url.includes('/token?')?tokens():user)};
 const before=createAuthClient(options);await before.oauth('google');
 assert.equal(storage.getItem(client.storageKey+':transaction'),undefined);assert.equal(pendingValues.size,1);
 oauthReturn(location);
 const after=createAuthClient(options);await after.handleCallback();
 assert.equal(pendingValues.size,0);assert.equal((await after.getSession()).user.id,user.id);
});

test('email confirmation also requires the initiating browser state and consumes it once',async()=>{
 const {client,location,storage}=setup(async url=>Response.json(url.includes('/signup?')?{user}:user));
 await client.signup(user.email,'password123');
 const pending=JSON.parse(storage.getItem(client.storageKey+':transaction'));
 location.search='?auth_state='+pending.state;
 location.hash='#access_token=access&refresh_token=refresh&expires_in=3600&type=signup';
 assert.deepEqual(await client.handleCallback(),{type:'confirmation'});
 assert.equal((await client.getSession()).user.id,user.id);
 await assert.rejects(client.handleCallback(),/callback rejected/);
});
