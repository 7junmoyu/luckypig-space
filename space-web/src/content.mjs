import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicSite } from './site.mjs';

export class ContentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function safeUrl(value, base) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function mediaUrl(value, haloUrl) {
  const safe = safeUrl(value, haloUrl);
  if (!safe) return '';
  const url = new URL(safe);
  if (url.origin === haloUrl && url.pathname.startsWith('/upload/')) return `/media/halo${url.pathname}${url.search}`;
  return safe;
}

export function isPublicPost(post, now = Date.now()) {
  if (!post || typeof post !== 'object' || Array.isArray(post)) return false;
  const { metadata = {}, spec = {} } = post;
  if (!metadata || !spec) return false;
  return metadata.labels?.['content.halo.run/published'] === 'true'
    && spec.publish === true && Boolean(spec.releaseSnapshot)
    && !metadata.deletionTimestamp && spec.deleted !== true
    && metadata.labels?.['content.halo.run/deleted'] !== 'true'
    && (spec.visible == null || spec.visible === 'PUBLIC')
    && (!spec.publishTime || Number.isFinite(Date.parse(spec.publishTime)) && Date.parse(spec.publishTime) <= now);
}

const text = (value) => String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const annotation = (post, key) => post.metadata?.annotations?.[`space.luckypig.dev/${key}`] || '';
const hasCategory = (post, slug) => (post.categories || []).some((c) => c.spec?.slug === slug);

export function toProject(post, config, index = 0) {
  const id = post.metadata?.name;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/.test(id) || !post.spec?.title) throw new ContentError(502, '作品字段不完整，请检查 Halo 内容');
  const category = ['ai', 'devops', 'agent'].find((slug) => hasCategory(post, slug)) || 'other';
  const demo = annotation(post, 'demo') !== 'false';
  const sourceUrl = safeUrl(annotation(post, 'source-url'));
  const html = typeof post.content?.content === 'string' ? post.content.content : '';
  return {
    id, number: String(index + 1).padStart(2, '0'), title: post.spec.title,
    subtitle: annotation(post, 'subtitle'), category,
    categoryLabel: { ai: 'AI 创作', devops: 'DevOps', agent: 'Agent 实践', other: '其他作品' }[category],
    format: annotation(post, 'format') || '作品 / 多媒体',
    visual: { ai: 'creative', devops: 'pipeline', agent: 'knowledge', other: 'metrics' }[category],
    tags: (post.tags || []).map((tag) => tag.spec?.displayName).filter((v) => typeof v === 'string'),
    summary: text(post.status?.excerpt || post.spec.excerpt?.raw || '').slice(0, 1500),
    description: text(html).slice(0, 20_000), content: { html, baseUrl: config.haloUrl },
    cover: mediaUrl(post.spec.cover, config.haloUrl), steps: [], learning: '',
    source: sourceUrl ? { name: annotation(post, 'source-name') || '参考来源', url: sourceUrl } : null,
    demo, authorship: annotation(post, 'authorship') || (demo ? '测试或参考内容，非站主个人成果' : '站主标记为个人作品'),
    mediaCredit: annotation(post, 'media-credit'), status: 'published', publishedAt: post.spec.publishTime || null,
    updatedAt: post.metadata.updateTimestamp || post.spec.publishTime || post.metadata.creationTimestamp || null,
    url: `/#project/${encodeURIComponent(id)}`,
  };
}

export function createContentService(config, { fetchImpl = fetch } = {}) {
  const site = publicSite(config);
  async function portfolio(file) {
    if (!config.portfolioRoot) throw new ContentError(503, '站点资料尚未配置');
    try { return JSON.parse(await readFile(join(config.portfolioRoot, file), 'utf8')); }
    catch { throw new ContentError(503, '本站资料暂时无法读取'); }
  }
  async function portfolioProjects() {
    const items = await portfolio('projects.json');
    if (!Array.isArray(items)) throw new ContentError(503, '本站作品列表格式不正确');
    return items.filter((p) => p.status === 'published' && (!p.publishedAt || Number.isFinite(Date.parse(p.publishedAt)) && Date.parse(p.publishedAt) <= Date.now()))
      .map((p) => ({ ...p, content: { ...p.content, baseUrl: config.publicUrl } }));
  }
  const api = '/apis/api.content.halo.run/v1alpha1/posts';
  async function halo(path) {
    try {
      // Anonymous public endpoints only: never load admin drafts or snapshots.
      const response = await fetchImpl(`${config.haloUrl}${path}`, {
        headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(config.requestTimeout),
      });
      if (response.status === 404) throw new ContentError(404, '作品不存在或已下线');
      if (!response.ok) throw new ContentError(502, '内容服务暂时不可用');
      const result = await response.json();
      if (!result || typeof result !== 'object') throw new ContentError(502, '内容服务返回了无效数据');
      return result;
    } catch (error) {
      if (error instanceof ContentError) throw error;
      throw new ContentError(503, '无法连接内容后台，请稍后重试');
    }
  }
  async function allPosts() {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const result = await halo(`${api}?page=${page}&size=100&sort=spec.priority,desc&sort=spec.publishTime,desc`);
      if (!Array.isArray(result.items)) throw new ContentError(502, '内容列表格式不正确');
      items.push(...result.items.filter((p) => isPublicPost(p)));
      if (result.items.length < 100 || page * 100 >= result.total) return items;
    }
    throw new ContentError(502, '内容量超过当前读取范围，请调整分页配置');
  }
  async function demos() {
    const items = JSON.parse(await readFile(join(config.fixtureRoot, 'projects.json'), 'utf8'));
    return items.map((p, index) => ({ ...p, status: 'published', url: `/#project/${p.id}`, cover: '', updatedAt: '2026-11-05',
      ...(index === 0 ? { testMedia: { image: '/demo-media/cover.png', video: '/demo-media/clip.mp4', document: '/demo-media/notes.md' } } : {}),
    }));
  }
  async function listProjects() {
    if (config.source === 'portfolio') return portfolioProjects();
    if (config.source === 'demo') return demos();
    return (await allPosts()).filter((p) => hasCategory(p, config.projectCategory) && p.spec.slug !== config.profileSlug).map((p, index) => toProject(p, config, index));
  }
  async function getProject(id) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/.test(id)) throw new ContentError(404, '作品不存在或已下线');
    if (config.source === 'portfolio') {
      const project = (await portfolioProjects()).find((p) => p.id === id);
      if (!project) throw new ContentError(404, '作品不存在或已下线');
      return project;
    }
    if (config.source === 'demo') {
      const project = (await demos()).find((p) => p.id === id);
      if (!project) throw new ContentError(404, '作品不存在或已下线');
      return project;
    }
    const post = await halo(`${api}/${encodeURIComponent(id)}`);
    if (!isPublicPost(post) || !hasCategory(post, config.projectCategory) || post.spec.slug === config.profileSlug) throw new ContentError(404, '作品不存在或已下线');
    return toProject(post, config);
  }
  async function getProfile() {
    if (config.source === 'portfolio') return portfolio('profile.json');
    const base = JSON.parse(await readFile(join(config.fixtureRoot, 'profile.json'), 'utf8'));
    if (config.source === 'demo') return { ...base, projects: '/api/projects', stage: '功能开发测试版' };
    let post = (await allPosts()).find((p) => p.spec.slug === config.profileSlug);
    let biography = '';
    if (post) {
      const detail = await halo(`${api}/${encodeURIComponent(post.metadata.name)}`);
      if (isPublicPost(detail) && detail.spec.slug === config.profileSlug) biography = text(detail.content?.content);
      else post = undefined;
    }
    return {
      name: post?.spec.title || site.owner, space: site.name, stage: '功能开发测试版',
      description: text(post?.status?.excerpt || post?.spec.excerpt?.raw || '面向人与 Agent 的个人 AI 创作空间。'),
      biography,
      interests: (post?.tags || []).map((t) => t.spec?.displayName).filter(Boolean), experience: null, skillsVerified: false,
      contentNotice: '作品的来源与个人贡献以各作品说明为准。', projects: '/api/projects',
      chat: { mode: 'local-demo', llmConnected: false },
      agent: { publicContent: true, mcpAvailable: false, skillAvailable: false },
      updatedAt: post?.metadata.updateTimestamp || post?.metadata.creationTimestamp || null,
    };
  }
  return { listProjects, getProject, getProfile };
}
