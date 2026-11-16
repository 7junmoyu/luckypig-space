import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { loadConfig } from '../src/config.mjs';
import { createContentService } from '../src/content.mjs';
import { createHandler } from '../src/http.mjs';
import { post } from './fixtures.mjs';

class ResponseRecorder extends Writable {
  headers = {}; chunks = []; headersSent = false;
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
}

async function request(handler, url, { method = 'GET', headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { url, method, headers });
  const res = new ResponseRecorder();
  await handler(req, res);
  const bytes = Buffer.concat(res.chunks);
  return { status: res.status, headers: res.headers, bytes, json: () => JSON.parse(bytes.toString()) };
}

test('public API and legacy JSON URLs share one fresh publication source', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo', CHAT_MODE: 'local-demo' }, new URL('./absent.env', import.meta.url));
  let current = post();
  const fetchImpl = async (url) => Response.json(new URL(url).pathname.endsWith('/work-123') ? current : { items: [current], total: 1 });
  const handler = createHandler({ config, content: createContentService(config, { fetchImpl }) });
  assert.equal((await request(handler, '/api/projects')).json().total, 1);
  assert.equal((await request(handler, '/data/projects.json')).json().length, 1);
  assert.equal((await request(handler, '/api/projects?category=devops')).json().total, 0);
  assert.equal((await request(handler, '/api/projects?q=AI')).json().total, 1);
  assert.equal((await request(handler, '/api/projects?tag=AI')).json().total, 1);
  assert.equal((await request(handler, '/api/projects?tag=missing')).json().total, 0);
  assert.equal((await request(handler, '/api/projects?page=-1')).status, 400);
  assert.equal((await request(handler, '/api/projects/work-123')).status, 200);
  current.spec.publish = false;
  assert.equal((await request(handler, '/api/projects')).json().total, 0);
  assert.equal((await request(handler, '/data/projects.json')).json().length, 0);
  assert.equal((await request(handler, '/api/projects/work-123')).status, 404);
  const answer = await request(handler, '/api/chat', { method: 'POST', body: JSON.stringify({ question: '推荐 AI 作品' }) });
  assert.equal(answer.status, 200);
  assert.equal(answer.json().links.length, 0);
});

test('static files handle HEAD, suffix/clamped ranges, malformed ranges, and hidden paths', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'demo' }, new URL('./absent.env', import.meta.url));
  const handler = createHandler({ config, content: createContentService(config) });
  const full = await request(handler, '/assets/favicon.svg');
  assert.equal(full.status, 200);
  const partial = await request(handler, '/assets/favicon.svg', { headers: { range: 'bytes=0-9' } });
  assert.equal(partial.status, 206);
  assert.deepEqual(partial.bytes, full.bytes.subarray(0, 10));
  const suffix = await request(handler, '/assets/favicon.svg', { headers: { range: 'bytes=-9' } });
  assert.deepEqual(suffix.bytes, full.bytes.subarray(-9));
  assert.equal((await request(handler, '/assets/favicon.svg', { headers: { range: 'bytes=999999-' } })).status, 416);
  assert.equal((await request(handler, '/assets/favicon.svg', { headers: { range: 'bytes=-0' } })).status, 416);
  const head = await request(handler, '/assets/favicon.svg', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.bytes.length, 0);
  assert.equal((await request(handler, '/.env')).status, 403);
  assert.equal((await request(handler, '/%ZZ')).status, 400);
  assert.equal((await request(handler, '/api/missing')).status, 404);
  assert.equal((await request(handler, '/api/profile', { method: 'DELETE' })).status, 405);
});

test('media proxy streams Range/HEAD, strips credentials and rejects non-upload paths', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(options.method === 'HEAD' ? null : '01234', { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '5', 'Content-Range': 'bytes 0-4/100', 'Accept-Ranges': 'bytes' } });
  };
  const handler = createHandler({ config, content: {}, fetchImpl });
  const result = await request(handler, '/media/halo/upload/clip.mp4', { headers: { range: 'bytes=0-4', authorization: 'do-not-forward', cookie: 'do-not-forward' } });
  assert.equal(result.status, 206); assert.equal(result.bytes.toString(), '01234');
  assert.equal(result.headers['content-range'], 'bytes 0-4/100');
  assert.deepEqual(calls[0].options.headers, { Range: 'bytes=0-4' });
  assert.equal(calls[0].url, `${config.haloUrl}/upload/clip.mp4`);
  const head = await request(handler, '/media/halo/upload/clip.mp4', { method: 'HEAD' });
  assert.equal(head.bytes.length, 0);
  assert.equal((await request(handler, '/media/halo/apis/private')).status, 403);
  assert.equal((await request(handler, '/media/halo/upload/%2e%2e%2fprivate')).status, 403);
});

test('untrusted document types download instead of running as same-origin HTML', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const handler = createHandler({ config, content: {}, fetchImpl: async () => new Response('<script>bad()</script>', { headers: { 'Content-Type': 'text/html' } }) });
  const result = await request(handler, '/media/halo/upload/file.html');
  assert.equal(result.headers['content-type'], 'application/octet-stream');
  assert.equal(result.headers['content-disposition'], 'attachment');
});

test('demo samples are a fixed allowlist with real MP4 ranges and document download', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'demo' }, new URL('./absent.env', import.meta.url));
  const handler = createHandler({ config, content: createContentService(config) });
  const video = await request(handler, '/demo-media/clip.mp4', { headers: { range: 'bytes=0-63' } });
  assert.equal(video.status, 206); assert.equal(video.bytes.length, 64);
  assert.equal(video.bytes.subarray(4, 8).toString(), 'ftyp');
  const doc = await request(handler, '/demo-media/notes.md');
  assert.equal(doc.status, 200);
  assert.match(doc.headers['content-disposition'], /attachment/);
  assert.equal((await request(handler, '/demo-media/profile.json')).status, 404);
  const haloHandler = createHandler({ config: { ...config, source: 'halo' }, content: {} });
  assert.equal((await request(haloHandler, '/demo-media/clip.mp4')).status, 404);
});

test('Agent downloads use canonical URLs, public flags are consistent, and MCP validates Host/Origin', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'demo', PUBLIC_URL: 'https://portfolio.example', DEEPSEEK_API_KEY: 'private-test-key' }, new URL('./absent.env', import.meta.url));
  const handler = createHandler({ config, content: createContentService(config) });
  try {
    const manifest = (await request(handler, '/api/agent', { headers: { host: 'untrusted.example' } })).json();
    assert.equal(manifest.mcp.url, 'https://portfolio.example/mcp');
    assert.ok(!JSON.stringify(manifest).includes('private-test-key'));
    const status = (await request(handler, '/api/status')).json();
    const profile = (await request(handler, '/api/profile')).json();
    assert.equal(status.mcpAvailable, true); assert.equal(profile.agent.skillAvailable, true);
    const skill = await request(handler, '/agent/skill/SKILL.md');
    assert.match(skill.headers['content-disposition'], /SKILL.md/);
    assert.ok(skill.bytes.toString().includes('https://portfolio.example/api/projects'));
    assert.ok(!skill.bytes.toString().includes('http://127.0.0.1:4173'));
    const clientConfig = await request(handler, '/agent/mcp.json');
    assert.equal(clientConfig.json().mcpServers['luckypig-space'].url, manifest.mcp.url);
    const head = await request(handler, '/agent/skill/SKILL.md', { method: 'HEAD' });
    assert.equal(head.bytes.length, 0);
    const badHost = await request(handler, '/mcp', { method: 'POST', headers: { host: 'rebind.example' }, body: '{}' });
    assert.equal(badHost.status, 403);
    const badOrigin = await request(handler, '/mcp', { method: 'POST', headers: { host: '127.0.0.1:4173', origin: 'https://malicious.example' }, body: '{}' });
    assert.equal(badOrigin.status, 403);
  } finally { await handler.close(); }
});
