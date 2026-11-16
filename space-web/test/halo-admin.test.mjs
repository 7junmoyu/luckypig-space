import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { loginHaloAdmin } from '../scripts/halo-admin.mjs';

const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
function loginFixture({ missingCsrf = false, loginRedirect = false, expired = false } = {}) {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    assert.equal(url.origin, 'http://127.0.0.1:8090');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    if (url.pathname === '/login' && options.method !== 'POST') {
      // Thymeleaf escapes slashes inside the JSON string embedded in its script.
      return new Response(`<script>const publicKey = ${JSON.stringify(publicKey).replaceAll('/', '\\/')};</script>${missingCsrf ? '' : '<input value="masked-csrf" type="hidden" name="_csrf">'}`, { headers: { 'set-cookie': 'XSRF-TOKEN=test-csrf; Path=/' } });
    }
    if (url.pathname === '/login') {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('_csrf'), 'masked-csrf');
      assert.equal(form.get('username'), 'test-admin');
      assert.notEqual(form.get('password'), 'test-password');
      assert.equal(Buffer.from(form.get('password'), 'base64').length, 256);
      assert.match(options.headers.Cookie, /XSRF-TOKEN=test-csrf/);
      return loginRedirect ? new Response(null, { status: 302, headers: { location: 'https://other.example/login' } }) : Response.json({ name: 'test-admin' }, { headers: { 'set-cookie': 'SESSION=test-session; Path=/; HttpOnly' } });
    }
    assert.match(options.headers.Cookie, /SESSION=test-session/);
    return expired ? new Response(null, { status: 302, headers: { location: '/login' } }) : Response.json({ rawType: 'HTML' });
  };
  return { calls, fetchImpl };
}

test('Halo normal login uses masked CSRF, RSA password and in-memory session cookies', async () => {
  const { fetchImpl, calls } = loginFixture();
  const session = await loginHaloAdmin({ username: 'test-admin', password: 'test-password', fetchImpl });
  assert.equal((await session.json('/apis/test/head-content')).rawType, 'HTML');
  assert.equal(calls.length, 3, 'embedded key avoids unavailable public-key route');
  await assert.rejects(session.json('//other.example/apis/test'), /只允许 Halo 管理 API/);
  assert.equal(calls.length, 3);
});

test('missing CSRF stops before submitting any credentials', async () => {
  const { fetchImpl, calls } = loginFixture({ missingCsrf: true });
  await assert.rejects(loginHaloAdmin({ username: 'test-admin', password: 'test-password', fetchImpl }), /缺少 CSRF/);
  assert.equal(calls.length, 1);
});

test('login redirects and expired sessions report authentication failure without following redirects', async () => {
  const blocked = loginFixture({ loginRedirect: true });
  await assert.rejects(loginHaloAdmin({ username: 'test-admin', password: 'test-password', fetchImpl: blocked.fetchImpl }), /登录未完成/);
  assert.equal(blocked.calls.length, 2);
  const { fetchImpl } = loginFixture({ expired: true });
  const session = await loginHaloAdmin({ username: 'test-admin', password: 'test-password', fetchImpl });
  await assert.rejects(session.json('/apis/test/head-content'), /会话未授权或已过期/);
});
