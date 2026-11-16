import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowseState, browseUrl, pageProjects, showcaseUrl } from '../public/browse-state.js';

const project = (id, category, tags) => ({ id, title: `作品 ${id}`, summary: '多媒体创作与工程', category, categoryLabel: category, tags });
const projects = [project('a', 'ai', ['生成图像']), project('b', 'devops', ['Kubernetes']), project('c', 'ai', ['生成图像']), project('d', 'agent', ['RAG']), project('e', 'devops', ['Kubernetes']), project('f', 'ai', ['生成图像'])];
const all = { scope: 'all', view: 'gallery', category: 'all', q: '', tag: '', page: 1 };

test('filtered URLs preserve Chinese tags, keywords and detail location across refresh', () => {
  const state = { scope: 'all', view: 'gallery', category: 'ai', q: '创作 & 工程', tag: '生成图像', page: 2 };
  const path = browseUrl('https://example.com/?utm_source=share#project/work-123', state);
  const url = new URL(path, 'https://example.com');
  assert.deepEqual(readBrowseState(url), state);
  assert.equal(url.hash, '#project/work-123');
  assert.equal(url.searchParams.get('utm_source'), 'share');
});

test('category, tag and keyword constraints combine rather than overwrite each other', () => {
  const result = pageProjects(projects, { ...all, category: 'ai', tag: '生成图像', q: '作品 c' });
  assert.deepEqual(result.items.map((p) => p.id), ['c']);
  assert.equal(result.total, 1);
  assert.equal(pageProjects(projects, { ...all, category: 'devops', tag: '生成图像' }).total, 0);
});

test('pagination adjusts when a work is removed, without duplicating or hiding others', () => {
  const first = pageProjects(projects, all);
  const second = pageProjects(projects, { ...all, page: 2 });
  assert.deepEqual([...first.items, ...second.items].map((p) => p.id), projects.map((p) => p.id));
  const removed = pageProjects(projects.slice(0, 3), { ...all, page: 2 });
  assert.equal(removed.page, 1);
  assert.equal(removed.items.length, 3);
  assert.equal(pageProjects([], { ...all, page: 2 }).page, 1);
});

test('invalid share parameters normalize and clearing filters removes obsolete state', () => {
  const normalized = readBrowseState('https://example.com/?category=unknown&page=-3');
  assert.deepEqual(normalized, all);
  const cleared = new URL(browseUrl('https://example.com/?category=ai&q=test&tag=RAG&page=2#projects', all), 'https://example.com');
  assert.equal(cleared.search, '');
  assert.equal(cleared.hash, '#projects');
});

test('personal and reference filters combine with theme, tags and pagination; missing authorship never counts as personal', () => {
  const items = [
    { ...projects[0], demo: false }, { ...projects[1], demo: false },
    { ...projects[2], demo: true }, projects[3],
  ];
  assert.deepEqual(pageProjects(items, { ...all, scope: 'personal' }).items.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(pageProjects(items, { ...all, scope: 'reference' }).items.map((p) => p.id), ['c', 'd']);
  assert.deepEqual(pageProjects(items, { ...all, scope: 'personal', category: 'ai', tag: '生成图像' }).items.map((p) => p.id), ['a']);
  assert.equal(pageProjects(items.slice(2), { ...all, scope: 'personal', page: 9 }).total, 0);
});

test('interview links preserve only the presentation route and always select personal works', () => {
  const link = new URL(showcaseUrl('https://space.example/?q=private-query&utm_source=test&page=8#project/other'));
  assert.equal(link.origin, 'https://space.example'); assert.equal(link.hash, '#projects');
  assert.deepEqual([...link.searchParams.keys()].sort(), ['scope', 'view']);
  const state = readBrowseState(link);
  assert.deepEqual(state, { ...all, scope: 'personal', view: 'interview' });
  const detail = new URL(browseUrl(link, { ...state, q: '告警' }), link); detail.hash = 'project/alert';
  assert.equal(readBrowseState(detail).scope, 'personal'); assert.equal(readBrowseState(detail).q, '告警');
  assert.equal(readBrowseState('https://space.example/?scope=reference&view=interview').scope, 'personal');
  assert.deepEqual(readBrowseState('https://space.example/?scope=invalid&view=invalid'), all);
  assert.equal(new URL(browseUrl(detail, all), detail).search, '');
});
