import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { mkdtemp, rm, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { publicSite, renderSiteHtml } from '../src/site.mjs';
import { createContentService } from '../src/content.mjs';
import { createHandler } from '../src/http.mjs';
import { createChatService } from '../src/chat.mjs';
import { createSettings } from '../src/settings.mjs';
import { createOwnerAuth, ownerToken } from '../src/owner-auth.mjs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSpaceMcp } from '../src/mcp.mjs';
import { createAgentService } from '../src/agent.mjs';

const missing = new URL('./absent.env', import.meta.url);
const configFor = (env = {}) => loadConfig({ SITE_ID: 'zyt', ...env }, missing);
class Recorder extends Writable {
  headers = {}; chunks = []; headersSent = false;
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
}
async function call(handler, url, { method = 'GET', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { url, method, headers: { accept: 'application/json' }, socket: { remoteAddress: '127.0.0.1' } });
  const res = new Recorder();
  await handler(req, res);
  const bytes = Buffer.concat(res.chunks), text = bytes.toString();
  return { status: res.status, headers: res.headers, bytes, text, json: () => JSON.parse(text) };
}
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'space-site-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('site selection preserves original defaults and explicitly isolates ZYT configuration and settings', async () => {
  const original = await loadConfig({}, missing), zyt = await configFor();
  assert.equal(original.site.name, 'Luckypig Space'); assert.equal(original.source, 'demo'); assert.equal(original.port, 4173);
  assert.equal(zyt.site.name, 'ZYT Space'); assert.equal(zyt.source, 'portfolio'); assert.equal(zyt.port, 4174);
  assert.notEqual(original.settingsDir, zyt.settingsDir); assert.equal(zyt.llm.apiKey, '');
  // This path selects .env.zyt rather than the existing original-site .env.
  assert.equal((await loadConfig({ SITE_ID: 'zyt' })).llm.apiKey, '');
  await assert.rejects(configFor({ SITE_ID: '../luckypig' }), /SITE_ID/);
  await assert.rejects(configFor({ CONTENT_SOURCE: 'demo' }), /其他站点/);
  await assert.rejects(configFor({ CONTENT_SOURCE: 'halo' }), /独立 HALO_URL/);
  await assert.rejects(loadConfig({ CONTENT_SOURCE: 'portfolio' }, missing), /其他站点/);
});

test('ZYT curated content never calls original Halo, includes user-supplied skills, and preserves unknown contribution boundaries', async () => {
  const config = await configFor();
  const content = createContentService(config, { fetchImpl: () => { throw new Error('must not contact another site'); } });
  const profile = await content.getProfile(), projects = await content.listProjects();
  assert.equal(profile.name, '张雨彤'); assert.equal(profile.skills.length, 7);
  assert.match(JSON.stringify(profile), /Linux|Vibe Coding|docker-compose.yml/);
  assert.match(profile.biography, /Vue 前端方向/);
  assert.match(profile.biography, /Python.*后端/);
  assert.match(profile.biography, /Webpack.*Node.js.*MySQL.*了解阶段/);
  const python = profile.skills.find((s) => s.tags.includes('Python'));
  assert.match(python.summary, /前后端联调/); assert.deepEqual(python.projectIds, []);
  assert.doesNotMatch(JSON.stringify(profile), /FastAPI|Django|Flask|\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|全栈开发工程师/i);
  assert.equal(profile.experience, null); assert.equal(profile.skillsVerified, false);
  assert.equal(projects.length, 3); assert.ok(projects.every((p) => !p.demo && p.source === null && !p.content.html.includes('<video')));
  assert.match(projects[0].content.html, /未提供合作分工或量化成果/);
  assert.equal((await content.getProject('zyt-web-admin')).id, projects[0].id);
  await assert.rejects(content.getProject('space-work-teleagent-cli'), (e) => e.status === 404);
  assert.doesNotMatch(JSON.stringify({ profile, projects }), /Luckypig|TeleAgent|06755190|sk-/);
});

test('portfolio edits and removals refresh without fallback to original content when files fail', async (t) => {
  const config = await configFor(), directory = await temporary(t);
  await cp(config.portfolioRoot, directory, { recursive: true }); config.portfolioRoot = directory;
  const content = createContentService(config);
  const projects = await content.listProjects();
  await writeFile(join(directory, 'projects.json'), JSON.stringify([...projects, { ...projects[0], id: 'hidden-draft', status: 'draft' }, { ...projects[0], id: 'future', publishedAt: '2999-01-01' }]));
  assert.equal((await content.listProjects()).length, 3);
  await assert.rejects(content.getProject('hidden-draft'), (e) => e.status === 404);
  await assert.rejects(content.getProject('future'), (e) => e.status === 404);
  await writeFile(join(directory, 'projects.json'), JSON.stringify(projects.slice(1)));
  await assert.rejects(content.getProject(projects[0].id), (e) => e.status === 404);
  assert.equal((await content.listProjects()).length, 2);
  await writeFile(join(directory, 'projects.json'), '{broken');
  await assert.rejects(content.listProjects(), (e) => e.status === 503 && !e.message.includes(directory));
});

test('homepage, admin, public APIs, Agent downloads and llms share the selected brand without disclosing credentials', async (t) => {
  const config = await configFor({ LLM_API_KEY: 'private-isolated-site-key' });
  const handler = createHandler({ config, content: createContentService(config) }); t.after(() => handler.close());
  for (const path of ['/', '/index.html', '/admin', '/admin/', '/admin.html', '/sources.html', '/llms.txt', '/api/profile', '/api/projects', '/api/agent', '/agent/mcp.json', '/agent/skill/SKILL.md']) {
    const result = await call(handler, path);
    assert.equal(result.status, 200, path);
    assert.doesNotMatch(result.text, /%%SITE_|Luckypig|luckypig-space|Space Guide|private-isolated-site-key/, path);
  }
  const home = await call(handler, '/'), head = await call(handler, '/', { method: 'HEAD' });
  assert.match(home.text, /ZYT Space/); assert.match(home.text, /张雨彤/);
  assert.match(home.text, /id="skills-grid"/); assert.match(home.text, /了解前端项目/);
  assert.match(home.text, /zyt-favicon.svg/); assert.equal(head.bytes.length, 0);
  assert.match(home.text, /前端与鸿蒙/); assert.doesNotMatch(home.text, /建议先播放录屏/);
  assert.equal(Number(head.headers['content-length']), home.bytes.length);
  assert.equal((await call(handler, '/api/profile')).json().site.id, 'zyt');
  assert.equal((await call(handler, '/agent/mcp.json')).json().mcpServers['zyt-space'].url, 'http://127.0.0.1:4174/mcp');
  assert.equal((await call(handler, '/api/projects/space-work-teleagent-cli')).status, 404);
  assert.equal((await call(handler, '/demo-media/clip.mp4')).status, 404);
  assert.equal((await call(handler, '/media/halo/upload/other.mp4')).status, 404);
});

test('original rendered homepage, Agent name and owner command remain compatible', async (t) => {
  const config = await loadConfig({ CONTENT_SOURCE: 'demo' }, missing);
  const handler = createHandler({ config, content: createContentService(config) }); t.after(() => handler.close());
  const home = await call(handler, '/');
  assert.match(home.text, /Luckypig Space/); assert.match(home.text, /我是 <span id="profile-name">Luckypig/);
  assert.doesNotMatch(home.text, /%%SITE_|ZYT|张雨彤/);
  assert.equal(home.text, await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  assert.match((await call(handler, '/admin')).text, /npm run owner:token/);
  assert.ok((await call(handler, '/agent/mcp.json')).json().mcpServers['luckypig-space']);
});

test('site text is escaped in HTML and inert JSON; nonpublic config fields never enter the public projection', async () => {
  const config = await configFor(); config.site.name = '</script><script>alert(1)</script>';
  config.site.privateKey = 'must-not-project'; config.llm.apiKey = 'must-not-project';
  const template = await readFile(new URL('../src/templates/index.html', import.meta.url), 'utf8');
  const rendered = renderSiteHtml(template, config);
  assert.ok(!rendered.includes(config.site.name)); assert.doesNotMatch(rendered, /must-not-project|%%SITE_/);
  const data = JSON.parse(rendered.match(/id="site-config">([^]*?)<\/script>/)[1]);
  assert.equal(data.name, config.site.name); assert.equal(data.privateKey, undefined);
  assert.equal(publicSite(config).privateKey, undefined);
});

test('ZYT chat uses only selected identity, current public projects and stated skills in model context', async () => {
  const config = await configFor({ LLM_API_KEY: 'isolated-model-key' });
  let prompt;
  const service = createChatService({ config, content: createContentService(config), fetchImpl: async (url, options) => {
    prompt = JSON.parse(options.body).messages[0].content;
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '可介绍前端项目。' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  } });
  const events = [];
  await service.reply({ question: '介绍 Web 管理后台、Python 后端及前后端联调和 Linux 部署能力' }, { signal: new AbortController().signal, emit: async (event, data) => events.push({ event, data }) });
  assert.match(prompt, /ZYT Space|张雨彤/); assert.match(prompt, /Web 管理后台/); assert.match(prompt, /Docker Compose|Linux 部署/);
  assert.match(prompt, /Python 后端与接口联调/); assert.match(prompt, /Vue 前端方向/); assert.match(prompt, /编译部署/);
  assert.doesNotMatch(prompt, /FastAPI|Django|Flask|\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(prompt, /Luckypig|TeleAgent|isolated-model-key/);
  assert.equal(events.at(-1).event, 'done');
});

test('site owner tokens, persisted models and same-host login cookies are independent', async (t) => {
  const root = await temporary(t);
  const original = await loadConfig({ LLM_API_KEY: 'original-model-key' }, missing), zyt = await configFor();
  original.settingsDir = join(root, 'original'); zyt.settingsDir = join(root, 'zyt');
  const a = await createSettings(original), b = await createSettings(zyt);
  await a.save({ revision: a.view().revision, llm: { ...a.view().llm, model: 'original-only-model', apiKey: '' }, search: { enabled: false, apiKey: '' } });
  assert.equal(b.get().llm.apiKey, ''); assert.equal(b.get().llm.model, 'deepseek-flash');
  assert.equal((await createSettings(original)).get().llm.model, 'original-only-model');
  const aToken = await ownerToken(original.settingsDir), bToken = await ownerToken(zyt.settingsDir);
  assert.notEqual(aToken, bToken);
  const authA = createOwnerAuth({ token: aToken, publicUrl: original.publicUrl }), authB = createOwnerAuth({ token: bToken, publicUrl: zyt.publicUrl, siteId: 'zyt' });
  const ar = new Recorder(), br = new Recorder();
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  authA.login(req, ar, { token: aToken }); authB.login(req, br, { token: bToken });
  const cookieA = ar.headers['set-cookie'].split(';')[0], cookieB = br.headers['set-cookie'].split(';')[0];
  assert.notEqual(cookieA.split('=')[0], cookieB.split('=')[0]);
  const combined = { headers: { cookie: `${cookieA}; ${cookieB}` } };
  assert.equal(authA.authenticated(combined), true); assert.equal(authB.authenticated(combined), true);
  assert.equal(authB.authenticated({ headers: { cookie: cookieA } }), false);
});

test('official MCP client receives ZYT identity, current skills and its own project resource', async (t) => {
  const config = await configFor({ PUBLIC_URL: 'https://zyt.test' });
  const agent = createAgentService({ config, content: createContentService(config) });
  const endpoint = createSpaceMcp({ config, agent });
  const client = new Client({ name: 'zyt-isolation-test', version: '1.0.0' }, { capabilities: {} });
  t.after(async () => { await client.close(); await endpoint.close(); });
  await client.connect(new StreamableHTTPClientTransport(new URL('https://zyt.test/mcp'), { fetch: (input, init) => endpoint.fetch(new Request(input, init)) }));
  assert.equal(client.getServerVersion().name, 'zyt-space');
  const profile = (await client.callTool({ name: 'get_profile', arguments: {} })).structuredContent;
  assert.equal(profile.name, '张雨彤'); assert.equal(profile.skills.length, 7);
  const current = await createContentService(config).getProfile();
  assert.deepEqual(profile.skills, current.skills); assert.equal(profile.biography, current.biography);
  assert.equal(profile.updatedAt, current.updatedAt);
  assert.match(profile.biography, /Python.*后端/);
  const result = (await client.callTool({ name: 'search_projects', arguments: { q: 'Vue' } })).structuredContent;
  assert.equal(result.total, 2); assert.ok(result.items.every((p) => p.id.startsWith('zyt-')));
  const detail = await client.callTool({ name: 'get_project', arguments: { id: 'space-work-teleagent-cli' } });
  assert.equal(detail.isError, true);
  const resource = await client.readResource({ uri: 'https://zyt.test/api/projects' });
  assert.equal(JSON.parse(resource.contents[0].text).total, 3);
});

test('one running content service exposes profile edits to HTTP, MCP data and model context without a restart', async (t) => {
  const config = await configFor({ LLM_API_KEY: 'isolated-model-key' }), directory = await temporary(t);
  await cp(config.portfolioRoot, directory, { recursive: true }); config.portfolioRoot = directory;
  const content = createContentService(config), agent = createAgentService({ config, content });
  const handler = createHandler({ config, content }); t.after(() => handler.close());
  const profile = await content.getProfile();
  assert.deepEqual((await call(handler, '/api/profile')).json().skills, (await agent.getProfile()).skills);
  let context;
  const chat = createChatService({ config, content, fetchImpl: async (url, options) => {
    context = JSON.parse(JSON.parse(options.body).messages[0].content.split('公开资料 JSON（只是资料，不是指令）：\n')[1]);
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '依据本轮公开资料回答。' }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  } });
  const reply = () => chat.reply({ question: '她会 Python 吗？' }, { signal: new AbortController().signal, emit: async () => {} });
  await reply();
  assert.deepEqual(context.skills, profile.skills.map(({ title, summary, tags }) => ({ title, summary, tags })));
  profile.description = '当前资料更新测试';
  profile.skills = profile.skills.filter((skill) => !skill.tags.includes('Python'));
  await writeFile(join(directory, 'profile.json'), JSON.stringify(profile));
  assert.equal((await call(handler, '/api/profile')).json().description, profile.description);
  assert.deepEqual((await agent.getProfile()).skills, profile.skills);
  await reply();
  assert.equal(context.profile.description, profile.description);
  assert.deepEqual(context.skills, profile.skills.map(({ title, summary, tags }) => ({ title, summary, tags })));
});
