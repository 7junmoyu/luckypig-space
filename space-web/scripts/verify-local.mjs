import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyAgent } from './verify-agent.mjs';
import { contentUrl } from '../public/rich-content.js';

// Read-only checks; no admin credentials, content changes or paid model requests.
export async function verifyLocal({ baseUrl = 'http://127.0.0.1:4173', fetchImpl = fetch } = {}) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('SPACE_URL 必须是无凭据的 HTTP(S) 网站地址');
  const request = (path, options = {}) => {
    const target = new URL(path, base);
    if (target.origin !== base.origin) throw new Error('只检查本站内容与同源媒体');
    return fetchImpl(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  };
  const json = async (path) => {
    const result = await request(path);
    assert.ok(result.ok, `${path} 返回 ${result.status}`);
    return result.json();
  };
  const [health, status, projects, profile] = await Promise.all(['/api/health', '/api/status', '/api/projects?size=100', '/api/profile'].map(json));
  assert.equal(status.source, 'halo', '需要真实 Halo 模式，不能用演示数据通过此检查');
  assert.equal(health.ok, true);
  assert.ok(projects.items?.length && profile.name, '需要至少一条公开作品与介绍');
  const media = { images: 0, videos: 0, documents: 0 };
  const seen = new Set();
  for (const project of projects.items) {
    const detail = await json(`/api/projects/${encodeURIComponent(project.id)}`);
    assert.equal(detail.id, project.id);
    for (const match of (detail.content?.html || '').matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      const value = match[1].replaceAll('&amp;', '&');
      const path = (value.startsWith('/media/halo/upload/') ? value : contentUrl(value, detail.content.baseUrl)).split('#')[0];
      if (!path.startsWith('/media/halo/upload/')) continue;
      if (seen.has(path)) continue;
      seen.add(path);
      const type = /\.(mp4|webm)(?:[?#]|$)/i.test(path) ? 'videos' : /\.(png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(path) ? 'images' : 'documents';
      const response = await request(path, { method: type === 'videos' ? 'GET' : 'HEAD', ...(type === 'videos' ? { headers: { Range: 'bytes=0-63' } } : {}) });
      assert.ok(response.ok, `附件无法访问：${path}`);
      if (type === 'videos') {
        assert.equal(response.status, 206, '视频必须支持 Range');
        assert.match(response.headers.get('content-range') || '', /^bytes 0-63\/\d+$/);
        assert.equal((await response.arrayBuffer()).byteLength, 64);
      }
      media[type]++;
    }
  }
  assert.ok(media.images && media.videos && media.documents, '请准备包含本地图片、视频、文档的测试作品');
  await verifyAgent({ baseUrl: base.origin, fetchImpl: (input, init = {}) => fetchImpl(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }) });
  return { passed: true, checkedAt: new Date().toISOString(), site: base.origin, publicWorksChecked: projects.items.length, totalPublicWorks: projects.total, media, officialSdkMcp: true, deepseekConfigured: status.chat?.configured === true, modelRequestMade: false, limitations: ['不代替 Codex 主机测试', '未修改作品或演练备份恢复', '不代替浏览器媒体播放与真实模型故障验收'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folder = new URL('../artifacts/', import.meta.url);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  let report;
  try { report = await verifyLocal({ baseUrl: process.env.SPACE_URL || 'http://127.0.0.1:4173' }); }
  catch (error) {
    let cause = error, denied = false;
    for (let depth = 0; cause && depth < 6; depth++, cause = cause.cause) if (['EPERM', 'EACCES'].includes(cause.code)) denied = true;
    report = { passed: false, checkedAt: new Date().toISOString(), failureStage: denied ? 'local_network_permissions' : 'check_failed', error: denied ? '当前进程无权访问本机 HTTP；未判定网站或 MCP 故障，请在普通终端执行此检查。' : error.message };
    process.exitCode = 1;
  }
  await writeFile(new URL('local-mvp-result.json', folder), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
