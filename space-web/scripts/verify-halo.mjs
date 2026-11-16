import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.mjs';
import { createContentService, safeUrl } from '../src/content.mjs';

const config = await loadConfig({ ...process.env, CONTENT_SOURCE: 'halo' });
const content = createContentService(config);
const projects = await content.listProjects();
assert.ok(projects.length, '请先在 Halo 后台发布一篇选择了 space-project 分类的测试作品');
let project, detail;
for (const candidate of process.env.SMOKE_PROJECT_ID ? projects.filter((p) => p.id === process.env.SMOKE_PROJECT_ID) : projects) {
  const current = await content.getProject(candidate.id);
  if (process.env.SMOKE_PROJECT_ID || /<img\b/i.test(current.content.html) && /<video\b/i.test(current.content.html) && /\.(?:md|txt|pdf|docx?|pptx?)(?:["'?#])/i.test(current.content.html)) { project = candidate; detail = current; break; }
}
assert.ok(project, '找不到含本地图片、视频和文档的公开测试作品；可指定 SMOKE_PROJECT_ID');
assert.ok(detail.content.html, '作品正文为空');
assert.match(detail.content.html, /<img\b/i, '正文需要包含图片');
assert.match(detail.content.html, /<video\b/i, '正文需要包含视频');
assert.match(detail.content.html, /<a\b/i, '正文需要包含文档或演示链接');

const image = detail.content.html.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
const video = detail.content.html.match(/<(?:video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
const document = [...detail.content.html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]).find((href) => /\.(md|txt|pdf|docx?|pptx?)(?:[?#]|$)/i.test(href));
assert.ok(image && video && document, '需要一张图片、一个视频来源和一个带文档扩展名的下载链接');
for (const [name, value] of [['图片', image], ['视频', video], ['文档', document]]) {
  const url = safeUrl(value.replaceAll('&amp;', '&'), config.haloUrl);
  assert.ok(url, `${name}地址无效`);
  assert.equal(new URL(url).origin, config.haloUrl, `${name}需使用这次上传到本地 Halo 的样本`);
  assert.ok(new URL(url).pathname.startsWith('/upload/'), `${name}不是 Halo 本地附件路径`);
  const head = await fetch(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(config.requestTimeout) });
  assert.ok(head.ok, `${name}无法通过 HTTP 读取：${head.status}`);
  if (name === '视频') {
    const range = await fetch(url, { headers: { Range: 'bytes=0-63' }, redirect: 'error', signal: AbortSignal.timeout(config.requestTimeout) });
    try {
      assert.equal(range.status, 206, '本地视频需要支持 Range 请求，以便拖动播放进度');
      assert.match(range.headers.get('content-range') || '', /^bytes 0-63\/\d+$/);
      assert.equal((await range.arrayBuffer()).byteLength, 64);
    } finally { if (!range.bodyUsed) await range.body?.cancel(); }
  }
}
console.log(`真实 Halo 读取通过：${project.id}；${projects.length} 条公开作品；本地图片/视频/文档可读，视频 Range 返回 206。浏览器播放、下线与重启仍需分别验收。`);
