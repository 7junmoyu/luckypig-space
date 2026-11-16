import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSite } from './site.mjs';

// A small .env format without shell evaluation or variable expansion.
export function parseEnv(text) {
  const entries = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) throw new Error('环境配置必须使用 KEY=value 格式');
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    entries[match[1]] = value;
  }
  return entries;
}

export async function loadConfig(env = process.env, path) {
  if (env.SITE_ID && !['luckypig', 'zyt'].includes(env.SITE_ID)) throw new Error('SITE_ID 只能为 luckypig 或 zyt');
  path ??= new URL(env.SITE_ID === 'zyt' ? '../.env.zyt' : '../.env', import.meta.url);
  let file = {};
  try { file = parseEnv(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const values = { ...file, ...env };
  const { site, portfolioRoot } = await loadSite(values.SITE_ID || 'luckypig');
  const source = values.CONTENT_SOURCE || (site.id === 'zyt' ? 'portfolio' : 'demo');
  if (!['demo', 'halo', 'portfolio'].includes(source)) throw new Error('CONTENT_SOURCE 只能为 demo、halo 或 portfolio');
  if (site.id === 'zyt' && source === 'demo' || source === 'portfolio' && !portfolioRoot) throw new Error('该站点不能使用其他站点的示例内容');
  if (site.id === 'zyt' && source === 'halo' && !values.HALO_URL) throw new Error('ZYT 的 Halo 模式需要明确配置独立 HALO_URL');
  const haloUrl = new URL(values.HALO_URL || 'http://127.0.0.1:8090');
  if (!['http:', 'https:'].includes(haloUrl.protocol) || haloUrl.username || haloUrl.password || haloUrl.search || haloUrl.hash || haloUrl.pathname !== '/') throw new Error('HALO_URL 必须是无凭据的 HTTP(S) 源地址');
  const port = Number(values.PORT || (site.id === 'zyt' ? 4174 : 4173));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 无效');
  const publicUrl = new URL(values.PUBLIC_URL || `http://127.0.0.1:${port || 4173}`);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/') throw new Error('PUBLIC_URL 必须是无凭据的 HTTP(S) 站点根地址');
  const chatMode = values.CHAT_MODE || 'deepseek';
  if (!['local-demo', 'deepseek', 'openai-compatible'].includes(chatMode)) throw new Error('CHAT_MODE 只能为 local-demo、deepseek 或 openai-compatible');
  const llmUrl = new URL(values.LLM_BASE_URL || 'https://api.deepseek.com');
  if (!['http:', 'https:'].includes(llmUrl.protocol) || llmUrl.username || llmUrl.password || llmUrl.search || llmUrl.hash) throw new Error('LLM_BASE_URL 必须是无凭据的 HTTP(S) API 地址');
  const timeout = Number(values.LLM_TIMEOUT_MS || 60000);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error('LLM_TIMEOUT_MS 必须为 1000–120000');
  const appVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
  return {
    source, site, portfolioRoot, port, host: values.HOST || '127.0.0.1', haloUrl: haloUrl.origin, publicUrl: publicUrl.origin, appVersion,
    projectCategory: values.HALO_PROJECT_CATEGORY || 'space-project', profileSlug: values.HALO_PROFILE_SLUG || 'space-profile',
    publicRoot: fileURLToPath(new URL('../public/', import.meta.url)),
    fixtureRoot: fileURLToPath(new URL('../fixtures/', import.meta.url)), requestTimeout: 10_000,
    settingsDir: fileURLToPath(new URL(site.id === 'zyt' ? '../.local/zyt/' : '../.local/', import.meta.url)),
    search: { enabled: values.WEB_SEARCH_ENABLED === 'true', apiKey: values.TAVILY_API_KEY?.trim() || '' },
    llm: { mode: chatMode, provider: chatMode === 'deepseek' ? 'deepseek' : 'openai-compatible', baseUrl: llmUrl.href.replace(/\/$/, ''), model: values.LLM_MODEL || 'deepseek-flash', apiKey: (values.LLM_API_KEY || values.DEEPSEEK_API_KEY)?.trim() || '', timeout },
  };
}
