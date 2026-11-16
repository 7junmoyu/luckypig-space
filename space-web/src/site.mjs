import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const defaultSite = Object.freeze({ id: 'luckypig', slug: 'luckypig-space', name: 'Luckypig Space', brand: 'luckypig', owner: 'Luckypig', guide: 'Space Guide', topics: 'AI、Agent 和 DevOps',
  description: 'Luckypig Space，一处面向人与 Agent 的 AI 创作空间。',
  heroLine1: '把想象，', heroBefore: '变成', heroAccent: '可运行的', heroLast: '现实',
  heroDescription: '在 AI 创作与工程实践之间，\n让灵感成为作品，让能力可以被连接。',
  heroTags: ['GENERATIVE AI', 'AGENT', 'DEVOPS'], aboutLine1: '保持好奇。', aboutLine2: '让下一件作品发生。',
  collectionNotice: '个人作品与参考内容分开标记，具体职责与实现细节以作品说明为准。' });

export async function loadSite(id = 'luckypig') {
  if (!['luckypig', 'zyt'].includes(id)) throw new Error('SITE_ID 只能为 luckypig 或 zyt');
  if (id === 'luckypig') return { site: { ...defaultSite }, portfolioRoot: null };
  const root = new URL('../sites/zyt/', import.meta.url);
  const site = JSON.parse(await readFile(new URL('site.json', root), 'utf8'));
  if (site.id !== 'zyt' || site.slug !== 'zyt-space') throw new Error('站点预设标识无效');
  for (const key of Object.keys(defaultSite).filter((k) => k !== 'heroTags')) if (typeof site[key] !== 'string' || site[key].length > 1000) throw new Error('站点预设字段无效');
  if (!Array.isArray(site.heroTags) || site.heroTags.length !== 3 || site.heroTags.some((s) => typeof s !== 'string' || s.length > 40)) throw new Error('站点标签无效');
  return { site: publicSite({ site }), portfolioRoot: fileURLToPath(root) };
}

export function publicSite(config) {
  const site = config.site || defaultSite;
  // A strict public projection; runtime credentials and filesystem paths never enter HTML/profile.
  return Object.fromEntries(Object.keys(defaultSite).map((key) => [key, site[key] ?? defaultSite[key]]));
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function renderSiteHtml(template, config) {
  const site = publicSite(config);
  const values = { ...site, questionOne: site.id === 'zyt' ? '介绍一下你的前端项目' : '推荐一个 AI 创作案例', questionTwo: site.id === 'zyt' ? '你有哪些Linux和Docker部署经验？' : '这里有哪些 DevOps 案例？', suggestionOne: site.id === 'zyt' ? '了解前端项目 ↗' : '探索 AI 创作 ↗', suggestionTwo: site.id === 'zyt' ? '看看部署实践 ↗' : '看看 DevOps ↗', logoSvg: site.id === 'zyt' ? '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 8h18L9 24h17M16 8v16"/></svg>' : '<svg viewBox="0 0 32 32"><path d="M7 11 5 4l8 5a18 18 0 0 1 7 0l7-5-1 9c2 2 3 4 3 7 0 6-5 9-13 9S3 26 3 20c0-4 1-6 4-9Z"/><rect x="9" y="16" width="14" height="8" rx="4"/><path d="M13 19v2m6-2v2"/></svg>', favicon: site.id === 'zyt' ? '/assets/zyt-favicon.svg' : './assets/favicon.svg', ownerCommand: site.id === 'zyt' ? 'SITE_ID=zyt npm run owner:token' : 'npm run owner:token', heroDescriptionHtml: site.heroDescription.split('\n').map(escape).join('<br>'),
    heroTagsHtml: site.heroTags.map((tag) => `<span>${escape(tag)}</span>`).join('<span class="cross">×</span>'),
    siteJson: JSON.stringify(site).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') };
  const filters = site.id === 'zyt' ? [['other', '前端与鸿蒙']] : [['ai', 'AI 创作'], ['agent', 'Agent 实践'], ['devops', 'DevOps']];
  values.filterTabsHtml = '<button class="filter-tab selected" data-filter="all" aria-pressed="true">全部探索 <span id="total-projects">—</span></button>' + filters.map(([value, label]) => `<button class="filter-tab" data-filter="${value}" aria-pressed="false">${label}</button>`).join('');
  values.showcaseTitle = site.id === 'zyt' ? '从项目出发，了解我的实践。' : '先看演示，再聊实现。';
  values.showcaseDescription = site.id === 'zyt' ? '先了解项目功能与技术选择，再查看技能和部署实践，最后通过对话追问。项目以简历说明为依据，具体贡献与成果以详情为准。' : '这里仅展示标记为个人作品的公开内容。建议先播放录屏，再查看过程与贡献说明，最后通过对话追问；具体职责与成果以作品说明为准。';
  values.showcaseStepsHtml = (site.id === 'zyt' ? ['阅读项目说明', '了解技能与部署实践', '带着问题继续交流'] : ['观看功能演示', '阅读过程与贡献', '带着问题继续交流']).map((step) => `<li>${step}</li>`).join('');
  if (site.id === 'zyt' && template.includes('class="source-page"')) template = template.replace(/<main[\s\S]*<\/main>/, `<main class="source-page"><a href="/">← 返回空间</a><h1>作品与资料来源</h1><p>本空间的介绍和项目说明由站主提供，技术方向包括前端、鸿蒙应用与个人项目部署实践。具体贡献、成果和演示素材以各作品说明为准。</p><p>流程封面为本站绘制的概念图，不是实际界面截图。未提供的演示不会用其他人的录屏代替。</p><h2>对话与接入</h2><p>网页会话通过站主配置的模型服务回答；模型与可选搜索状态可在会话中查看。本站提供公开只读MCP和Skill，不执行个人工作流。</p></main>`);
  return template.replace(/%%SITE_([a-zA-Z][a-zA-Z0-9]*)%%/g, (_, key) => ['heroDescriptionHtml', 'heroTagsHtml', 'siteJson', 'logoSvg', 'filterTabsHtml', 'showcaseStepsHtml'].includes(key) ? values[key] : escape(values[key] || ''));
}
