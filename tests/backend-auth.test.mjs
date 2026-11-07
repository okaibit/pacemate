import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: name => ({ SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key' })[name] } };
const { getUser, deleteIdentity, removeUserPhotos } = await import('../supabase/functions/pacemate/server/supabase.ts');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('backend rejects missing bearer credentials without making an Auth call', async () => {
  globalThis.fetch = () => { throw new Error('Must not call Auth'); };
  assert.equal(await getUser(new Request('https://function.test/api/me', { headers: { apikey: 'publishable-test' } })), null);
});

test('backend verifies bearer credentials with Supabase instead of trusting browser user IDs', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://test.supabase.co/auth/v1/user');
    assert.equal(options.headers.Authorization, 'Bearer actual-user-jwt');
    assert.equal(options.headers.apikey, 'server-only-test-key');
    return Response.json({ id: 'verified-member' });
  };
  const result = await getUser(new Request('https://function.test/api/me?userId=forged', { headers: { Authorization: 'Bearer actual-user-jwt' } }));
  assert.equal(result.id, 'verified-member');
});

test('invalid or expired JWTs are rejected', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Invalid token' }, { status: 401 });
  assert.equal(await getUser(new Request('https://function.test/api/me', { headers: { Authorization: 'Bearer forged' } })), null);
});

test('an Auth service outage is not silently treated as anonymous access', async () => {
  globalThis.fetch = async () => Response.json({ error: 'Service unavailable' }, { status: 503 });
  await assert.rejects(getUser(new Request('https://function.test/api/me', { headers: { Authorization: 'Bearer jwt' } })), /unavailable/);
});

test('identity deletion failures propagate instead of returning false success', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://test.supabase.co/auth/v1/admin/users/member');
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.Authorization, 'Bearer server-only-test-key');
    return Response.json({ error: 'Failed' }, { status: 500 });
  };
  await assert.rejects(deleteIdentity('member'), /failed/);
});

test('account photo cleanup drains pages without skipping objects after deletion', async () => {
  const pages = [[{ id:'one', name: 'one.jpg' }], [{ id:'two', name: 'two.jpg' }], []];
  const removed = [];
  globalThis.fetch = async (url, options) => {
    if (url.includes('/object/list/')) {
      const body = JSON.parse(options.body);
      assert.equal(body.offset, 0);
      assert.equal(body.prefix, 'member');
      return Response.json(url.endsWith('/list/photos') ? pages.shift() : []);
    }
    assert.equal(options.method, 'DELETE');
    removed.push(...JSON.parse(options.body).prefixes);
    return Response.json({});
  };
  await removeUserPhotos('member');
  assert.deepEqual(removed, ['member/one.jpg', 'member/two.jpg']);
});

test('image upload validation rejects HTML and aborts oversized streamed bodies',async()=>{
  const {readImage}=await import('../supabase/functions/pacemate/server/supabase.ts');
  await assert.rejects(readImage(new Request('https://test/image',{method:'POST',body:'<html>not an image</html>'})),/IMAGE_INVALID/);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024));controller.enqueue(new Uint8Array(1024*1024));controller.enqueue(new Uint8Array(1024));},cancel(){cancelled=true;}});
  await assert.rejects(readImage(new Request('https://test/image',{method:'POST',body:stream,duplex:'half'})),/IMAGE_TOO_LARGE/);
  assert.equal(cancelled,true);
});
