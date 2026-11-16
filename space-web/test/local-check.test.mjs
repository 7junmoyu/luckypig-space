import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLocal } from '../scripts/verify-local.mjs';
import { createSpaceMcp } from '../src/mcp.mjs';
import { createAgentService } from '../src/agent.mjs';
import { loadConfig } from '../src/config.mjs';

async function fixture(t, external = false) {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo', PUBLIC_URL: 'http://127.0.0.1:4173' }, new URL('./absent.env', import.meta.url));
  const prefix = external ? 'https://other.example' : 'http://127.0.0.1:8090';
  const projects = ['ai', 'devops'].map((category) => ({ id: category, title: category, category, url: `/#project/${category}`, tags: [], demo: true, authorship: '非个人成果', description: '测试', content: { baseUrl: config.haloUrl, html: `<img src="${prefix}/upload/image.png"><video src='/upload/clip.mp4'></video><a href="/upload/clip.mp4#t=10">章节</a><a href="/upload/clip.mp4#t=20">章节二</a><a href="${prefix}/upload/notes.txt">文档</a>` } }));
  const content = { listProjects: async () => projects, getProject: async (id) => projects.find((p) => p.id === id), getProfile: async () => ({ name: 'Test', interests: [] }) };
  const endpoint = createSpaceMcp({ config, agent: createAgentService({ config, content }) });
  t.after(() => endpoint.close());
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    calls.push(url.href);
    assert.equal(url.origin, config.publicUrl);
    if (url.pathname === '/mcp') return endpoint.fetch(new Request(input, init));
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    if (url.pathname === '/api/status') return Response.json({ source: 'halo', chat: { configured: true } });
    if (url.pathname === '/api/profile') return Response.json(await content.getProfile());
    if (url.pathname === '/api/projects') return Response.json({ items: projects, total: projects.length });
    if (url.pathname.startsWith('/api/projects/')) return Response.json(await content.getProject(url.pathname.split('/').at(-1)));
    if (url.pathname.endsWith('.mp4')) return new Response(new Uint8Array(64), { status: 206, headers: { 'content-range': 'bytes 0-63/100' } });
    if (url.pathname.startsWith('/media/halo/upload/')) return new Response(null);
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  return { fetchImpl, calls };
}

test('local check maps raw Halo upload URLs exactly as the webpage does', async (t) => {
  const { fetchImpl, calls } = await fixture(t);
  const report = await verifyLocal({ fetchImpl });
  assert.equal(report.passed, true);
  assert.deepEqual(report.media, { images: 1, videos: 1, documents: 1 });
  assert.equal(report.modelRequestMade, false);
  assert.ok(calls.some((url) => url.includes('/media/halo/upload/notes.txt')));
  assert.ok(calls.every((url) => !url.includes('/api/chat')));
});

test('external media cannot satisfy local upload acceptance or trigger external fetches', async (t) => {
  const { fetchImpl, calls } = await fixture(t, true);
  await assert.rejects(verifyLocal({ fetchImpl }), /本地图片/);
  assert.ok(calls.every((url) => !url.includes('other.example')));
});
