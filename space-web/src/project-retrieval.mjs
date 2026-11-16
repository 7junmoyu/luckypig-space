// Small, deterministic retrieval over currently public metadata. No stored index.
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const ignore = new Set(['介绍', '一下', '这个', '那个', '哪些', '什么', '可以', '帮我', '这里', '一下子', '看看', '关于', '作品', '案例', '项目', '个人', '站主', '自己', '如何', '怎么', '一下吧', '进行', '相关', '演示', '能力']);
const terms = (text) => [...segmenter.segment(text.toLowerCase())].filter((s) => s.isWordLike && s.segment.length >= 2 && !ignore.has(s.segment)).map((s) => s.segment);
const followUp = /再|继续|上(?:一|个|面)|这(?:个|件|些|项)|它|其中|具体|详细|职责|贡献|技术栈|实现|架构|成果|难点|过程/;
const siteOnlyQuestion = /^(?:你好|您好|hi|hello|谢谢|你是谁|你叫什么|你是什么(?:模型|model)|你用的是什么模型)[？?！!。\s]*$/i;
const externalQuestion = /天气|气温|下雨|新闻|汇率|股票|比分|今天几号|现在几点/;

export function selectProjects(projects, question, history = []) {
  const q = question.toLowerCase();
  const explicit = projects.filter((p) => p.title && q.includes(p.title.toLowerCase()));
  if (!explicit.length && (siteOnlyQuestion.test(q.trim()) || externalQuestion.test(q) || /(?:什么|哪个).*(?:model|模型)|(?:model|模型).*(?:名字|型号)/i.test(q))) return [];
  const personalOnly = /个人作品|个人项目|(?:你的|站主的|自己(?:做|开发|创作)的).*(?:作品|项目|案例)|面试/.test(q);
  const candidates = personalOnly ? projects.filter((p) => p.demo === false) : projects;
  const words = [...new Set(terms(q))];
  const previous = [...history].reverse().find((m) => m.role === 'assistant')?.projectIds || [];
  const continuePrevious = !explicit.length && followUp.test(q);
  const broad = /作品|案例|项目|推荐|展示|面试/.test(q);
  const themed = /ai|创作|视觉|图片|生成|视频|agent|智能体|知识|rag|检索|问答|devops|运维|gitops|发布|监控|可观测|告警|故障|诊断/.test(q);
  const ranked = candidates.map((p, index) => {
    const title = p.title.toLowerCase(), tags = (p.tags || []).join(' ').toLowerCase();
    const summary = (p.summary || '').toLowerCase();
    let score = explicit.includes(p) ? 100 : 0;
    for (const word of words) score += title.includes(word) ? 12 : tags.includes(word) ? 7 : summary.includes(word) ? 2 : 0;
    if (/ai|创作|视觉|图片|生成/.test(q) && p.category === 'ai') score += 4;
    if (/agent|智能体|知识|rag|检索|问答/.test(q) && p.category === 'agent') score += 4;
    if (/devops|运维|gitops|发布|监控|可观测/.test(q) && p.category === 'devops') score += 4;
    if (continuePrevious && previous.includes(p.id)) score += 20;
    if (broad && !themed && !explicit.length && !continuePrevious) score += 1;
    return { p, score, index };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || Number(a.p.demo !== false) - Number(b.p.demo !== false) || a.index - b.index);
  if (explicit.length) return ranked.filter((r) => explicit.includes(r.p)).slice(0, 4).map((r) => r.p);
  return ranked.slice(0, 4).map((r) => r.p);
}
