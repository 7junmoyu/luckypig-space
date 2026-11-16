// Mutates only the dedicated integration-test work created in this session.
const task = await taskSpace('luckypig-halo-live');
// This M1 script verifies local retrieval, not paid model responses.
const chatStatus = JSON.parse((await task.page('p2').fetch('/api/status')).body).chat;
if (chatStatus !== 'local-demo' && chatStatus.mode !== 'local-demo') throw new Error('此发布验收脚本要求网站显式 CHAT_MODE=local-demo；尚未修改文章');
const admin = task.page('p1');
const front = task.page('p2');
const { readFile, writeFile } = await import('node:fs/promises');
const root = new URL('../', import.meta.url);
const { postId } = JSON.parse(await readFile(new URL('artifacts/integration-state.json', root), 'utf8'));
const baseline = JSON.parse(await readFile(new URL('artifacts/first-post-head.json', root), 'utf8'));
const api = `/apis/api.console.halo.run/v1alpha1/posts/${postId}`;
async function mutate(path, payload) {
  const result = await admin.fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  if (result.status >= 300) throw new Error(`Test work mutation failed: ${result.status} ${result.body}`);
  return JSON.parse(result.body);
}
const privateMarker = 'DRAFT_ONLY_20261105';
await mutate(`${api}/content`, { raw: `${baseline.raw}<p>${privateMarker}</p>`, content: `${baseline.content}<p>${privateMarker}</p>`, rawType: baseline.rawType });
const draftRead = await front.fetch(`/api/projects/${postId}`);
if (draftRead.status !== 200 || draftRead.body.includes(privateMarker)) throw new Error('Unpublished draft content entered public projection');
console.log({ unpublishedDraftIsolation: 'passed' });
const updateMarker = '已完成多媒体发布与更新验证';
await mutate(`${api}/content`, { raw: `${baseline.raw}<p>${updateMarker}</p>`, content: `${baseline.content}<p>${updateMarker}</p>`, rawType: baseline.rawType });
await mutate(`${api}/publish`);
await front.waitForFunction(async ({ postId, updateMarker }) => { const r = await fetch(`/api/projects/${postId}`); return r.ok && (await r.text()).includes(updateMarker); }, { postId, updateMarker }, { timeout: 10000 });
console.log({ publishedUpdateVisible: 'passed' });
await mutate(`${api}/unpublish`);
await front.waitForFunction(async (id) => (await fetch(`/api/projects/${id}`)).status === 404, postId, { timeout: 10000 });
const list = JSON.parse((await front.fetch('/api/projects')).body);
const legacy = JSON.parse((await front.fetch('/data/projects.json')).body);
const chat = JSON.parse((await front.fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '介绍一下多媒体发布链路测试（示例）' }) })).body);
if (list.items.some((p) => p.id === postId) || legacy.some((p) => p.id === postId) || chat.links.some((p) => p.id === postId)) throw new Error('Unpublished work still visible in an entry point');
await front.reload();
await front.waitForFunction(() => document.querySelector('#project-detail h2')?.textContent === '作品不存在或已下线', undefined, { timeout: 10000 });
console.log({ unpublishListDetailLegacyChat: 'passed', staleLinkMessage: 'passed' });
await mutate(`${api}/publish`);
await front.reload();
await front.waitForFunction(() => document.querySelector('.rich-content')?.textContent.includes('已完成多媒体发布与更新验证'), undefined, { timeout: 10000 });
await writeFile(new URL('artifacts/halo-publication-result.json', root), JSON.stringify({ postId, unpublishedDraftIsolation: true, publishedUpdateVisible: true, unpublishAllEntryPoints: true, staleLink: true, republished: true }, null, 2), { mode: 0o600 });
console.log({ republishedForTesting: 'passed' });
