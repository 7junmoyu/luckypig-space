export const PAGE_SIZE = 4;
const categories = new Set(['all', 'ai', 'agent', 'devops', 'other']);

export function readBrowseState(url) {
  const params = new URL(url).searchParams;
  const requestedPage = Number(params.get('page') || 1);
  return {
    scope: params.get('view') === 'interview' ? 'personal' : ['personal', 'reference'].includes(params.get('scope')) ? params.get('scope') : 'all',
    view: params.get('view') === 'interview' ? 'interview' : 'gallery',
    category: categories.has(params.get('category')) ? params.get('category') : 'all',
    q: (params.get('q') || '').slice(0, 200), tag: (params.get('tag') || '').slice(0, 80),
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function browseUrl(url, state) {
  const next = new URL(url);
  for (const key of ['category', 'q', 'tag', 'page', 'scope', 'view']) next.searchParams.delete(key);
  if (['personal', 'reference'].includes(state.scope)) next.searchParams.set('scope', state.scope);
  if (state.view === 'interview') next.searchParams.set('view', 'interview');
  if (state.category !== 'all') next.searchParams.set('category', state.category);
  if (state.q) next.searchParams.set('q', state.q);
  if (state.tag) next.searchParams.set('tag', state.tag);
  if (state.page > 1) next.searchParams.set('page', state.page);
  return `${next.pathname}${next.search}${next.hash}`;
}

export function filterProjects(projects, state) {
  const q = state.q.trim().toLocaleLowerCase();
  return projects.filter((p) => (state.scope !== 'personal' || p.demo === false)
    && (state.scope !== 'reference' || p.demo !== false)
    && (state.category === 'all' || p.category === state.category)
    && (!state.tag || p.tags.includes(state.tag))
    && `${p.title} ${p.summary} ${p.tags.join(' ')} ${p.categoryLabel}`.toLocaleLowerCase().includes(q));
}

export function showcaseUrl(url) {
  const result = new URL(browseUrl(url, { category: 'all', q: '', tag: '', page: 1, scope: 'personal', view: 'interview' }), url);
  result.hash = 'projects';
  // A presentation link carries only its public filters, not unrelated URL parameters.
  for (const key of [...result.searchParams.keys()]) if (!['scope', 'view'].includes(key)) result.searchParams.delete(key);
  return result.href;
}

export function pageProjects(projects, state) {
  const filtered = filterProjects(projects, state);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(state.page, pageCount);
  return { total: filtered.length, pageCount, page, items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}
