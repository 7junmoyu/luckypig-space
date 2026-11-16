import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loginHaloAdmin } from './halo-admin.mjs';

const root = new URL('../', import.meta.url);
const credit = '录屏由站主提供；封面为本站绘制的统一风格概念示意，不是运行界面。文字为初版整理，具体职责待补充。';
function replacePoster(html, videoPath, poster) {
  let changed = false;
  const result = html.replace(/<video\b[^>]*>/gi, (tag) => {
    if (!tag.includes(videoPath)) return tag;
    changed = true;
    return /\bposter\s*=/.test(tag) ? tag.replace(/\bposter\s*=\s*(["']).*?\1/i, `poster="${poster}"`) : tag.replace('<video', `<video poster="${poster}"`);
  });
  assert.ok(changed, '未找到本次录屏，未覆盖其他正文');
  return result;
}

export async function applyRecordingCovers() {
  const session = await loginHaloAdmin(JSON.parse(await readFile(new URL('artifacts/local-admin.json', root), 'utf8')));
  const works = JSON.parse(await readFile(new URL('content/recordings.json', root), 'utf8'));
  const stateFile = new URL('artifacts/recordings-import.json', root);
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const backup = [], results = [];
  // Read and validate all works before changing any published record.
  for (const work of works) {
    const post = await session.json(`/apis/content.halo.run/v1alpha1/posts/${work.id}`);
    const path = `/apis/api.console.halo.run/v1alpha1/posts/${work.id}`;
    const head = await session.json(path + '/head-content'), release = await session.json(path + '/release-content');
    assert.equal(post.metadata.annotations['space.luckypig.dev/demo'], 'false');
    assert.ok(['raw', 'content', 'rawType'].every((key) => head[key] === release[key]), '存在未发布草稿，未覆盖');
    backup.push({ work, post, head });
  }
  await writeFile(new URL(`artifacts/recording-covers-before-${Date.now()}.json`, root), JSON.stringify(backup, null, 2), { mode: 0o600 });
  for (const { work, post, head } of backup) {
    const bytes = await readFile(new URL(`artifacts/recordings/${work.slug}-cover.png`, root));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `${work.slug}-cover.png`;
    if (state.media[key]?.sha256 !== sha256) {
      const form = new FormData(); form.set('policyName', 'default-policy');
      form.set('file', new Blob([bytes], { type: 'image/png' }), `luckypig-${work.slug}-art-${sha256.slice(0, 10)}.png`);
      const uploaded = await session.json('/apis/api.console.halo.run/v1alpha1/attachments/upload', { method: 'POST', body: form });
      const url = new URL(uploaded.status?.permalink, 'http://127.0.0.1:8090');
      assert.equal(url.origin, 'http://127.0.0.1:8090'); assert.ok(url.pathname.startsWith('/upload/'));
      state.media[key] = { path: url.pathname, attachmentId: uploaded.metadata.name, sha256, bytes: bytes.length };
      await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    }
    const poster = state.media[key].path, video = state.media[`${work.slug}.mp4`].path;
    const content = { raw: replacePoster(head.raw, video, poster), content: replacePoster(head.content, video, poster), rawType: head.rawType };
    post.spec.cover = poster;
    post.metadata.annotations['space.luckypig.dev/media-credit'] = credit;
    await session.json(`/apis/content.halo.run/v1alpha1/posts/${work.id}`, { method: 'PUT', body: JSON.stringify(post) });
    const path = `/apis/api.console.halo.run/v1alpha1/posts/${work.id}`;
    await session.json(path + '/content', { method: 'PUT', body: JSON.stringify(content) });
    await session.json(path + '/publish', { method: 'PUT' });
    results.push({ id: work.id, cover: poster, videoUnchanged: true });
  }
  state.coverStyle = 'terracotta-vector-v1'; await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  const report = { applied: true, checkedAt: new Date().toISOString(), results };
  await writeFile(new URL('artifacts/recording-covers-result.json', root), JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(await applyRecordingCovers()); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
