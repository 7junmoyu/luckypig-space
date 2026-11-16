// Imports only the three user-supplied recordings. Existing works are never overwritten.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loginHaloAdmin } from './halo-admin.mjs';
import { timeLabel } from '../public/recording-player.js';
import { assertRuntime } from '../src/runtime.mjs';

const assets = new URL('../artifacts/recordings/', import.meta.url);
const statePath = new URL('../artifacts/recordings-import.json', import.meta.url);
const escape = (value) => String(value).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));

export function recordingHtml(project, video, poster) {
  return `<video controls playsinline preload="metadata" poster="${escape(poster)}" src="${escape(video)}"></video><p>${escape(project.intro)}</p><h2>从问题到结果</h2><ol>${project.workflow.map((step) => `<li><strong>${escape(step.title)}</strong>：${escape(step.body)}</li>`).join('')}</ol><h2>演示片段</h2><p>${project.chapters.map((c) => `<a href="${escape(video)}#t=${c.seconds}">${timeLabel(c.seconds)} · ${escape(c.label)}</a>`).join(' ')}</p><h2>演示边界</h2><p>${escape(project.boundary)}</p><h2>关于这件作品</h2><p>站主提供的个人 AI 开发功能录屏。本文根据录屏中可见的操作整理为初版说明，具体职责、实现细节与成果数据后续由站主补充。</p>`;
}

export async function importRecordings({ fetchImpl = fetch } = {}) {
  assertRuntime();
  const projects = JSON.parse(await readFile(new URL('../content/recordings.json', import.meta.url), 'utf8'));
  const credentials = JSON.parse(await readFile(new URL('../artifacts/local-admin.json', import.meta.url), 'utf8'));
  const session = await loginHaloAdmin({ ...credentials, fetchImpl });
  let state = { media: {}, posts: [] };
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  const existing = new Set((await session.json('/apis/content.halo.run/v1alpha1/posts?size=100')).items.map((p) => p.metadata.name));
  const tags = new Map((await session.json('/apis/content.halo.run/v1alpha1/tags?size=100')).items.map((t) => [t.spec.displayName, t.metadata.name]));
  const policy = (await session.json('/apis/storage.halo.run/v1alpha1/policies?size=100')).items.find((p) => p.metadata.name === 'default-policy');
  if (!policy) throw new Error('缺少本地附件策略，尚未导入');
  async function upload(project, suffix, mime) {
    const name = `${project.slug}${suffix}`;
    const bytes = await readFile(new URL(name, assets));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (state.media[name]?.sha256 === hash) return state.media[name].path;
    const form = new FormData(); form.set('policyName', policy.metadata.name);
    form.set('file', new Blob([bytes], { type: mime }), `luckypig-${project.slug}-${hash.slice(0, 10)}${suffix}`);
    const result = await session.json('/apis/api.console.halo.run/v1alpha1/attachments/upload', { method: 'POST', body: form });
    const url = new URL(result.spec?.permalink || result.status?.permalink, 'http://127.0.0.1:8090');
    if (url.origin !== 'http://127.0.0.1:8090' || !url.pathname.startsWith('/upload/')) throw new Error('附件上传未返回预期的本地地址');
    state.media[name] = { path: url.pathname, attachmentId: result.metadata.name, sha256: hash, bytes: bytes.length };
    await save(); return url.pathname;
  }
  for (const project of projects) {
    if (existing.has(project.id)) continue;
    const video = await upload(project, '.mp4', 'video/mp4');
    const poster = await upload(project, '-cover.png', 'image/png');
    const tagIds = [];
    for (const name of project.tags) {
      if (!tags.has(name)) {
        const slug = `work-${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
        const tag = await session.json('/apis/content.halo.run/v1alpha1/tags', { method: 'POST', body: JSON.stringify({ apiVersion: 'content.halo.run/v1alpha1', kind: 'Tag', metadata: { name: `space-${slug}` }, spec: { displayName: name, slug, color: '#cc785c', cover: '' } }) });
        tags.set(name, tag.metadata.name);
      }
      tagIds.push(tags.get(name));
    }
    const html = recordingHtml(project, video, poster);
    const annotations = { 'content.halo.run/preferred-editor': 'default', 'space.luckypig.dev/demo': 'false',
      'space.luckypig.dev/authorship': '个人开发演示 · 根据录屏整理；具体职责与实现细节待补充',
      'space.luckypig.dev/subtitle': project.subtitle, 'space.luckypig.dev/format': `功能录屏 · ${project.duration}`,
      'space.luckypig.dev/media-credit': '录屏由站主提供；封面为本站绘制的统一风格概念示意，不是运行界面。文字为初版整理，具体职责待补充。',
      'space.luckypig.dev/import-batch': 'personal-recordings-v1' };
    await session.json('/apis/api.console.halo.run/v1alpha1/posts', { method: 'POST', body: JSON.stringify({
      post: { apiVersion: 'content.halo.run/v1alpha1', kind: 'Post', metadata: { name: project.id, annotations },
        spec: { title: project.title, slug: project.slug, owner: credentials.username, publish: false, deleted: false, visible: 'PUBLIC', pinned: false, priority: project.priority, allowComment: false, excerpt: { autoGenerate: false, raw: project.summary }, categories: ['space-space-project', `space-${project.category}`], tags: tagIds, cover: poster, htmlMetas: [] } },
      content: { raw: html, content: html, rawType: 'HTML' },
    }) });
    state.posts.push({ id: project.id, createdAt: new Date().toISOString(), published: false }); await save();
    await session.json(`/apis/api.console.halo.run/v1alpha1/posts/${project.id}/publish`, { method: 'PUT' });
    state.posts.find((p) => p.id === project.id).published = true; await save();
  }
  state.finishedAt = new Date().toISOString(); await save();
  return { personalRecordings: projects.length, ids: projects.map((p) => p.id), state: 'artifacts/recordings-import.json' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await mkdir(assets, { recursive: true, mode: 0o700 }); console.log(await importRecordings()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
