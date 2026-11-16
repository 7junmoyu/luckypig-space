export function post(overrides = {}) {
  return {
    metadata: { name: 'work-123', labels: { 'content.halo.run/published': 'true' }, annotations: { 'space.luckypig.dev/demo': 'false', private: 'never-export-this' } },
    spec: { title: 'AI 多媒体发布测试', slug: 'ai-demo', publish: true, releaseSnapshot: 'release-1', headSnapshot: 'draft-private', visible: 'PUBLIC', publishTime: '2026-01-01T00:00:00Z', cover: '/upload/cover.png' },
    status: { excerpt: '图片、录屏与文档' },
    categories: [{ spec: { slug: 'space-project' } }, { spec: { slug: 'ai' } }],
    tags: [{ spec: { displayName: 'AI' } }],
    content: { content: '<p>已发布正文</p><img src="/upload/cover.png"><video controls src="/upload/clip.mp4"></video><a href="/upload/notes.pdf">下载文档</a>', raw: 'never-export-raw' },
    ...overrides,
  };
}
