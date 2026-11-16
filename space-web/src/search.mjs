import { ContentError } from './content.mjs';

// Only call the configured search service; never fetch visitor-supplied URLs.
export async function searchWeb(search, query, { signal, fetchImpl = fetch }) {
  if (!search?.enabled || !search.apiKey) throw new ContentError(503, '联网搜索尚未开启或未配置搜索 Key，请关闭联网后重试');
  let response;
  try {
    response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${search.apiKey}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: 4, include_answer: false, include_raw_content: false }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ContentError(502, '联网搜索连接失败，请稍后重试或关闭联网');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ContentError(response.status === 429 ? 429 : 502, [401, 403].includes(response.status) ? '搜索服务认证失败，请站主检查搜索 Key' : [429, 432, 433].includes(response.status) ? '搜索服务达到限额，请稍后重试或关闭联网' : '搜索服务暂时不可用，请关闭联网后重试');
  }
  // Bound an untrusted upstream response before parsing or adding it to context.
  let text = '', size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new ContentError(502, '搜索服务返回格式异常');
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) throw new ContentError(502, '搜索结果过大，请缩小问题范围');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  let payload;
  try { payload = JSON.parse(text); } catch { throw new ContentError(502, '搜索服务返回格式异常'); }
  if (!Array.isArray(payload.results)) throw new ContentError(502, '搜索服务返回格式异常');
  const seen = new Set();
  return payload.results.slice(0, 20).flatMap((item) => {
    try {
      const url = new URL(item.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048 || seen.has(url.href)) return [];
      if (typeof item.content !== 'string' || !item.content.trim()) return [];
      seen.add(url.href);
      return [{ title: String(item.title || url.hostname).slice(0, 180), url: url.href, content: item.content.slice(0, 2200), publishedDate: typeof item.published_date === 'string' ? item.published_date.slice(0, 80) : null }];
    } catch { return []; }
  }).slice(0, 4);
}
