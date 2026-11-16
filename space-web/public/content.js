export function answerFromContent(projects, question, profile = {}) {
  const q = question.toLocaleLowerCase();
  if (/mcp|skill|接入|连接|读取/.test(q)) return { text: profile.agent?.mcpAvailable
    ? '这个空间提供公开资料查询 MCP、可下载的 Skill 和 llms.txt 索引。打开 Agent 接入说明即可复制 MCP 地址或下载 Skill。\n\n当前仅支持读取介绍、搜索作品和获取详情，尚不执行个人创作工作流。'
    : '这个空间已经提供公开的介绍、案例 JSON 和 llms.txt 索引。你可以把它们交给支持网页读取的 Agent。\n\n当前还没有运行 MCP 服务，也没有可安装的 Skill；公开资料里也会说明这些边界。', links: [{ title: '打开 Agent 接入说明' }] };
  // A concrete case title wins over a generic request such as "介绍一下".
  const exact = projects.find((project) => q.includes(project.title.toLocaleLowerCase()));
  if (exact) return describe([exact]);
  if (/你是谁|本人|履历|经历|工作经历|个人能力|个人技能|擅长|介绍你|介绍自己|luckypig|薪资|面试/.test(q)) return { text: `${profile.description || '这里是 Luckypig 的个人 AI 创作空间。'}\n\n${profile.biography || '目前没有录入可核实的个人经历，请以作品中的来源与贡献说明为准，不将参考案例当作个人成果。'}`, links: projects.slice(0, 2).map((p) => ({ id: p.id, title: p.title })) };
  const scored = projects.map((project) => {
    const tokens = [...project.tags.map((tag) => tag.toLowerCase()), project.categoryLabel.toLowerCase(), project.title.toLowerCase()];
    let score = tokens.reduce((sum, token) => sum + (q.includes(token) ? 5 : 0), 0);
    if (/devops|发布|集群|运维|gitops|监控|可观测/.test(q) && project.category === 'devops') score += 3;
    if (/ai|创作|生成|图片|视觉/.test(q) && project.category === 'ai') score += 3;
    if (/agent|知识|检索|问答|rag/.test(q) && project.category === 'agent') score += 3;
    return { project, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { text: '我目前只掌握这个空间里的公开参考案例。你可以问我 AI 创作、知识助手、GitOps 或可观测性，也可以让我介绍 Agent 接入方式。\n\n其他问题还没有足够资料回答。', links: projects.slice(0, 3).map((p) => ({ id: p.id, title: p.title })) };
  return describe(scored.slice(0, 2).map((item) => item.project));
}

function describe(matches) {
  return { text: `可以查看这些公开内容：\n\n${matches.map((p) => `${p.title}\n${p.summary}\n${p.authorship}`).join('\n\n')}\n\n请打开作品查看详细过程与来源。当前回答为本地检索演示。`, links: matches.map((p) => ({ id: p.id, title: p.title })) };
}
