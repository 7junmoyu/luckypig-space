// Explicit, attributed development records. Never overwrite an existing record.
const task = await taskSpace('luckypig-halo-live');
const admin = task.page('p1');
const { readFile, writeFile } = await import('node:fs/promises');
const root = new URL('../', import.meta.url);
const references = JSON.parse(await readFile(new URL('fixtures/projects.json', root), 'utf8'));
const escape = (value) => String(value).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
async function request(path, options) {
  const result = await admin.fetch(path, options);
  if (result.status >= 300) throw new Error(`Seed request failed ${result.status}: ${result.body}`);
  return JSON.parse(result.body);
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const existingTags = (await request('/apis/content.halo.run/v1alpha1/tags')).items;
const tags = new Map(existingTags.map((tag) => [tag.spec.displayName, tag.metadata.name]));
async function tagIds(names) {
  const ids = [];
  for (const name of names) {
    if (!tags.has(name)) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const tag = await request('/apis/content.halo.run/v1alpha1/tags', json('POST', { apiVersion: 'content.halo.run/v1alpha1', kind: 'Tag', metadata: { name: `space-${slug}` }, spec: { displayName: name, slug, color: '#cc785c', cover: '' } }));
      tags.set(name, tag.metadata.name);
    }
    ids.push(tags.get(name));
  }
  return ids;
}
const existing = new Set((await request('/apis/content.halo.run/v1alpha1/posts')).items.map((p) => p.metadata.name));
const ids = [];
async function create({ name, title, slug, summary, html, categories, tags, annotations }) {
  if (!existing.has(name)) {
    await request('/apis/api.console.halo.run/v1alpha1/posts', json('POST', {
      post: { apiVersion: 'content.halo.run/v1alpha1', kind: 'Post', metadata: { name, annotations: { 'content.halo.run/preferred-editor': 'default', 'space.luckypig.dev/demo': 'true', ...annotations } }, spec: { title, slug, owner: 'space-admin', publish: false, deleted: false, visible: 'PUBLIC', pinned: false, priority: 0, allowComment: false, excerpt: { autoGenerate: false, raw: summary }, categories, tags, cover: '', htmlMetas: [] } },
      content: { raw: html, content: html, rawType: 'HTML' },
    }));
    await request(`/apis/api.console.halo.run/v1alpha1/posts/${name}/publish`, { method: 'PUT' });
  }
  ids.push(name);
}
for (const p of references) {
  const html = `<p>${escape(p.authorship)}</p><p>${escape(p.description)}</p><h2>探索过程</h2>${p.steps.map((step) => `<h3>${escape(step.title)}</h3><p>${escape(step.body)}</p>`).join('')}<h2>思考</h2><p>${escape(p.learning)}</p><p><a href="${escape(p.source.url)}">${escape(p.source.name)}</a></p>`;
  await create({ name: `space-ref-${p.id}`, title: p.title, slug: p.id, summary: p.summary, html, categories: ['space-space-project', `space-${p.category}`], tags: await tagIds(p.tags), annotations: { 'space.luckypig.dev/authorship': p.authorship, 'space.luckypig.dev/subtitle': p.subtitle, 'space.luckypig.dev/format': p.format, 'space.luckypig.dev/source-name': p.source.name, 'space.luckypig.dev/source-url': p.source.url, 'space.luckypig.dev/media-credit': p.mediaCredit, 'space.luckypig.dev/seed': 'reference' } });
}
await create({ name: 'space-public-profile', title: 'Luckypig', slug: 'space-profile', summary: '面向人与 Agent 的个人 AI 创作空间。', html: '<p>这里记录 AI 创作、Agent 与 DevOps 的探索。当前展示内容包含参考案例和功能测试，个人贡献以每条作品说明为准。</p>', categories: [], tags: await tagIds(['AI', 'Agent', 'DevOps']), annotations: { 'space.luckypig.dev/authorship': '根据已确认的网站定位建立的公开介绍；未录入个人履历' } });
await writeFile(new URL('artifacts/halo-seed-result.json', root), JSON.stringify({ ids, references: references.length, publicProfile: true }, null, 2), { mode: 0o600 });
console.log({ attributedReferences: references.length, publicProfileCreated: true, ids });
