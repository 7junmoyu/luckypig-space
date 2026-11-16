import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { readSse } from '../public/chat-stream.js';
import { loginHaloAdmin } from './halo-admin.mjs';

const artifacts = new URL('../artifacts/', import.meta.url);
const expectedTitle = '多媒体发布链路测试（示例）';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export function restoredContentMatches(head, release, published, baseline, original) {
  return ['raw', 'content', 'rawType'].every((key) => head[key] === baseline[key] && release[key] === baseline[key])
    && published.id === original.id && published.description === original.description;
}

// Scoped to the dedicated local test work, never arbitrary user content.
export async function verifyPublication({ fetchImpl = fetch } = {}) {
  const base = 'http://127.0.0.1:4173';
  const state = JSON.parse(await readFile(new URL('integration-state.json', artifacts), 'utf8'));
  if (state.title !== expectedTitle || !/^[a-zA-Z0-9-]+$/.test(state.postId)) throw new Error('缺少专用多媒体测试作品，未修改任何内容');
  const credentials = JSON.parse(await readFile(new URL('local-admin.json', artifacts), 'utf8'));
  const id = state.postId, endpoint = `/apis/api.console.halo.run/v1alpha1/posts/${id}`;
  const request = async (origin, path, options = {}) => {
    try { return await fetchImpl(`${origin}${path}`, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(75000) }); }
    catch (error) { throw new Error(`验收请求无法连接：${path.split('?')[0]}（${error.cause?.code || error.code || error.name}）`); }
  };
  const json = async (origin, path, options = {}) => {
    const result = await request(origin, path, options);
    if (!result.ok) throw new Error(`验收请求失败：${path.split('?')[0]}，HTTP ${result.status}`);
    return result.json();
  };
  const original = await json(base, `/api/projects/${id}`);
  if (original.title !== expectedTitle || original.demo !== true) throw new Error('目标不是约定的示例测试作品，未修改内容');
  if ((await json(base, '/api/status')).chat?.mode !== 'deepseek') throw new Error('此联合验收需要真实 DeepSeek 模式');
  const session = await loginHaloAdmin({ ...credentials, fetchImpl });
  const admin = (path, options) => session.json(path, options);
  const mutate = (suffix, content) => admin(endpoint + suffix, { method: 'PUT', ...(content ? { body: JSON.stringify(content) } : {}) });
  const head = await admin(endpoint + '/head-content');
  const release = await admin(endpoint + '/release-content');
  for (const field of ['raw', 'content', 'rawType']) if (head[field] !== release[field]) throw new Error('测试作品有未发布草稿，请先自行处理；未覆盖草稿');
  const baseline = { raw: head.raw, content: head.content, rawType: head.rawType };
  if (typeof baseline.raw !== 'string' || typeof baseline.content !== 'string' || String(baseline.rawType).toLowerCase() !== 'html') throw new Error('只验证专用 HTML 测试作品，未修改内容');
  await writeFile(new URL('m5-publication-baseline.json', artifacts), JSON.stringify({ postId: id, capturedAt: new Date().toISOString(), ...baseline, originalPublicDescription: original.description }), { mode: 0o600 });
  const marker = `M5_PUBLIC_${randomBytes(6).toString('hex')}`, draft = `M5_DRAFT_${randomBytes(6).toString('hex')}`;
  const client = new Client({ name: 'space-m5-live', version: '1.0.0' }, { capabilities: {} });
  let dirty = false, restored = false, connected = false;
  const checks = {};
  const until = async (predicate) => {
    for (let attempt = 0; attempt < 30; attempt++) { if (await predicate()) return; await delay(1000); }
    throw new Error('公开内容未在 30 秒内同步');
  };
  const chat = async (question, history = [], cancel = false) => {
    const controller = new AbortController();
    const response = await request(base, '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ question, history }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(75000)]) });
    if (!response.ok) throw new Error(`真实 DeepSeek 会话 HTTP ${response.status}`);
    let text = '', links = [], done = false, sawDelta = false;
    for await (const frame of readSse(response.body)) {
      const value = JSON.parse(frame.data);
      if (frame.event === 'error') throw new Error('真实模型请求中断，详见网站状态；未将验收记为通过');
      if (frame.event === 'meta') { assert.equal(value.mode, 'deepseek'); links = value.links; }
      if (frame.event === 'delta') {
        text += value.text; sawDelta = true;
        if (cancel) { controller.abort(); break; }
      }
      if (frame.event === 'done') done = true;
    }
    assert.ok(sawDelta && (cancel || done), '必须收到真实流式文字，正常请求必须完整结束');
    return { text, links, cancelledAfterDelta: cancel };
  };
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { fetch: fetchImpl })); connected = true;
    const projectTool = () => client.callTool({ name: 'get_project', arguments: { id } });
    const searchTool = () => client.callTool({ name: 'search_projects', arguments: { q: expectedTitle } });
    dirty = true;
    await mutate('/content', { ...baseline, raw: `${baseline.raw}<p>${draft}</p>`, content: `${baseline.content}<p>${draft}</p>` });
    assert.ok(!JSON.stringify(await json(base, `/api/projects/${id}`)).includes(draft));
    assert.ok(!JSON.stringify(await projectTool()).includes(draft));
    checks.unpublishedDraftIsolated = true;
    await mutate('/content', { ...baseline, raw: `${baseline.raw}<p>本轮集成验收标记：${marker}</p>`, content: `${baseline.content}<p>本轮集成验收标记：${marker}</p>` });
    await mutate('/publish');
    await until(async () => (await json(base, `/api/projects/${id}`)).description.includes(marker));
    // The legacy index is the list projection, which may omit body text.
    // The detail, MCP detail and real chat below verify the changed body.
    await until(async () => (await json(base, '/data/projects.json')).some((p) => p.id === id && p.title === expectedTitle && !JSON.stringify(p).includes(draft)));
    const detail = await projectTool(); assert.notEqual(detail.isError, true); assert.ok(detail.structuredContent.description.includes(marker));
    const resource = await client.readResource({ uri: `${base}/api/projects` });
    assert.ok(JSON.parse(resource.contents[0].text).items.some((p) => p.id === id));
    checks.updateVisibleToWebsiteAndMcp = true;
    const question = `请读取《${expectedTitle}》的最新公开说明，原样给出正文中 M5_PUBLIC_ 开头的本轮集成验收标记，并说明这是不是个人真实成果。`;
    await chat(question, [], true); checks.realHttpStreamCancelledAfterDelta = true;
    const answer = await chat(question); assert.ok(answer.text.includes(marker), '真实问答没有读到最新作品标记');
    assert.ok(answer.links.some((p) => p.id === id));
    checks.realDeepseekRetryReadsUpdate = true;
    await mutate('/unpublish');
    await until(async () => (await request(base, `/api/projects/${id}`)).status === 404);
    assert.ok(!(await json(base, '/api/projects?size=100')).items.some((p) => p.id === id));
    assert.ok(!(await json(base, '/data/projects.json')).some((p) => p.id === id));
    assert.equal((await searchTool()).structuredContent.total, 0);
    assert.equal((await projectTool()).isError, true);
    const hiddenResource = await client.readResource({ uri: `${base}/api/projects` });
    assert.ok(!JSON.parse(hiddenResource.contents[0].text).items.some((p) => p.id === id));
    const followup = await chat(`请继续介绍这个作品的本轮集成验收标记；若资料已下线，请说明无法从当前公开资料确认。`, [{ role: 'user', content: question }, { role: 'assistant', content: answer.text.slice(0, 5000), projectIds: [id] }]);
    assert.ok(!followup.links.some((p) => p.id === id)); assert.ok(!followup.text.includes(marker));
    checks.unpublishedExcludedFromWebsiteChatMcpAndHistory = true;
  } finally {
    try {
      if (dirty) {
        await mutate('/content', baseline); await mutate('/publish');
        // Halo renders the released HTML (heading IDs, etc.); it is not byte
        // identical to the editor source. Compare both saved source snapshots
        // plus the original public text instead of treating rendering as drift.
        await until(async () => restoredContentMatches(await admin(endpoint + '/head-content'), await admin(endpoint + '/release-content'), await json(base, `/api/projects/${id}`), baseline, original));
        restored = true;
      }
    } catch { throw new Error('测试作品恢复未确认；原内容保存在 artifacts/m5-publication-baseline.json，请检查后再继续'); }
    finally {
      if (connected) await client.close();
      await writeFile(new URL('m5-publication-progress.json', artifacts), JSON.stringify({ checkedAt: new Date().toISOString(), checks, originalBodyRestored: restored }, null, 2), { mode: 0o600 });
    }
    if (dirty && !restored) throw new Error('测试作品自动恢复未完成；原内容保存在 artifacts/m5-publication-baseline.json，请先处理后再继续');
  }
  return { passed: true, checkedAt: new Date().toISOString(), postId: id, checks, originalBodyRestored: restored, realModelRequests: 3, scope: 'real Halo + website HTTP + SDK MCP + DeepSeek; client cancellation observed, provider billing cancellation not measurable' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  let report;
  try { report = await verifyPublication(); }
  catch (error) { report = { passed: false, checkedAt: new Date().toISOString(), error: error.message }; process.exitCode = 1; }
  await writeFile(new URL('m5-publication-result.json', artifacts), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
