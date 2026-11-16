import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { contentUrl } from '../public/rich-content.js';

export async function verifyRecordings({ withChat = false, fetchImpl = fetch } = {}) {
  const base = 'http://127.0.0.1:4173';
  const projects = JSON.parse(await readFile(new URL('../content/recordings.json', import.meta.url), 'utf8'));
  const imported = JSON.parse(await readFile(new URL('../artifacts/recordings-import.json', import.meta.url), 'utf8'));
  const request = async (path, options = {}) => {
    const response = await fetchImpl(new URL(path, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(options.method === 'POST' ? 75000 : 15000) });
    assert.ok(response.ok, `${path} 返回 ${response.status}`); return response;
  };
  const index = await (await request('/api/projects?size=100')).json();
  assert.deepEqual(index.items.slice(0, 3).map((p) => p.id), projects.map((p) => p.id));
  const client = new Client({ name: 'space-recording-verifier', version: '1.0.0' }, { capabilities: {} });
  const checked = [];
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { fetch: fetchImpl }));
    for (const project of projects) {
      const detail = await (await request(`/api/projects/${project.id}`)).json();
      assert.equal(detail.demo, false); assert.equal(detail.title, project.title);
      assert.ok(detail.description.includes(project.boundary));
      assert.ok(detail.authorship.includes('待补充'));
      assert.equal((detail.content.html.match(/#t=/g) || []).length, project.chapters.length);
      const coverSuffix = imported.media[project.slug + '-cover.png'] ? '-cover.png' : '-poster.jpg';
      assert.equal(detail.cover, contentUrl(imported.media[project.slug + coverSuffix].path, detail.content.baseUrl));
      assert.ok(detail.content.html.includes(imported.media[project.slug + coverSuffix].path));
      for (const suffix of ['.mp4', coverSuffix]) {
        const asset = imported.media[project.slug + suffix];
        const path = contentUrl(asset.path, detail.content.baseUrl);
        const response = await request(path);
        assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), asset.sha256);
        if (suffix === '.mp4') {
          const partial = await request(path, { headers: { Range: 'bytes=0-63' } });
          assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 64);
        }
      }
      const mcp = await client.callTool({ name: 'get_project', arguments: { id: project.id } });
      assert.notEqual(mcp.isError, true); assert.equal(mcp.structuredContent.demo, false);
      assert.ok(mcp.structuredContent.description.includes(project.boundary));
      const found = await client.callTool({ name: 'search_projects', arguments: { q: project.title } });
      assert.ok(found.structuredContent.items.some((p) => p.id === project.id));
      checked.push({ id: project.id, title: project.title, mediaHashesMatch: true, videoRange: true, chapters: project.chapters.length, mcp: true });
    }
    assert.deepEqual((await client.callTool({ name: 'list_capabilities', arguments: {} })).structuredContent.executableWorkflows, []);
  } finally { await client.close(); }
  let chat = null;
  if (withChat) {
    const answer = await (await request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: '请分别介绍我新增的三个个人开发录屏：TeleAgent × 智护 CLI、告警分析与处置建议、数字员工 · 故障下钻。分别能看到什么？哪些个人职责与实现细节还未确认？' }) })).json();
    assert.equal(answer.mode, 'deepseek'); assert.ok(answer.text);
    assert.ok(projects.every((p) => answer.links.some((link) => link.id === p.id)));
    chat = { text: answer.text, links: answer.links, realDeepseek: true };
  }
  return { passed: true, checkedAt: new Date().toISOString(), publicWorks: index.total, personalRecordings: checked, chat, modelRequestMade: withChat };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyRecordings({ withChat: process.env.RECORDINGS_CHAT_CHECK === '1' });
    await writeFile(new URL('../artifacts/recordings-validation.json', import.meta.url), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
