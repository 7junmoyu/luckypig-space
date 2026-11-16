import { readFile, mkdir, writeFile, rename, chmod, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ContentError } from './content.mjs';

function text(value, name, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ContentError(400, `${name}格式不正确`);
  return value.trim();
}
function apiUrl(value) {
  let url;
  try { url = new URL(text(value, 'API 地址')); } catch { throw new ContentError(400, 'API 地址格式不正确'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && local) || url.username || url.password || url.search || url.hash) throw new ContentError(400, 'API 地址须使用 HTTPS（本机地址可使用 HTTP），且不能含凭据、查询或片段');
  return url.href.replace(/\/$/, '');
}
function secret(value, previous, clear, name) {
  if (clear === true) return '';
  if (value === '' || value === undefined) return previous || '';
  return text(value, name, 4096);
}

export function candidateSettings(body, current) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContentError(400, '配置格式不正确');
  const input = body.llm;
  if (!input || !['deepseek', 'openai-compatible'].includes(input.provider)) throw new ContentError(400, '请选择支持的模型接口类型');
  const baseUrl = apiUrl(input.baseUrl);
  if (new URL(baseUrl).origin !== new URL(current.llm.baseUrl).origin && !input.apiKey?.trim() && !input.clearKey) throw new ContentError(400, '更换 API 服务地址时请填写新 Key，避免将旧 Key 发送给其他服务');
  const timeout = Number(input.timeout);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new ContentError(400, '超时须为 1000–120000 毫秒');
  const search = body.search;
  if (!search || typeof search.enabled !== 'boolean') throw new ContentError(400, '搜索配置格式不正确');
  const result = { revision: current.revision, llm: { mode: input.provider, provider: input.provider, baseUrl,
    model: text(input.model, '模型名称', 200), timeout, apiKey: secret(input.apiKey, current.llm.apiKey, input.clearKey, '模型 Key') },
  search: { enabled: search.enabled, apiKey: secret(search.apiKey, current.search.apiKey, search.clearKey, '搜索 Key') } };
  if (result.search.enabled && !result.search.apiKey) throw new ContentError(400, '开启联网前请填写 Tavily 搜索 Key');
  return result;
}

export function settingsView(state) {
  const { apiKey, ...llm } = state.llm;
  return { revision: state.revision, llm: { ...llm, keyConfigured: Boolean(apiKey) }, search: { enabled: state.search.enabled, keyConfigured: Boolean(state.search.apiKey), provider: 'tavily' } };
}

export async function createSettings(config, { directory = config.settingsDir } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = resolve(directory, 'model-settings.json');
  let current = { revision: 0, llm: { ...config.llm, provider: config.llm.provider || (config.llm.mode === 'deepseek' ? 'deepseek' : 'openai-compatible') }, search: { enabled: false, apiKey: '', ...config.search } };
  try {
    const stored = JSON.parse(await readFile(file, 'utf8'));
    if (!Number.isSafeInteger(stored.revision) || stored.revision < 1) throw new Error('Invalid revision');
    current = { ...candidateSettings(stored, stored), revision: stored.revision };
    await chmod(file, 0o600);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('模型配置文件无法读取，请检查本机私有配置文件');
  }
  let saving = false;
  const demoMode = config.llm.mode === 'local-demo';
  return {
    get: () => structuredClone(demoMode ? { ...current, llm: { ...current.llm, mode: 'local-demo' } } : current),
    view: () => ({ ...settingsView(current), demoMode }),
    candidate: (body) => candidateSettings(body, current),
    async save(body) {
      if (!body || typeof body !== 'object') throw new ContentError(400, '配置格式不正确');
      if (saving || body.revision !== current.revision) throw new ContentError(409, '配置已变化，请刷新后再保存');
      const next = candidateSettings(body, current);
      next.revision++;
      saving = true;
      const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        await rename(temporary, file);
        current = next;
        return { ...settingsView(current), demoMode };
      } catch { throw new ContentError(500, '配置保存失败，当前运行配置未改变'); }
      finally { saving = false; await unlink(temporary).catch(() => {}); }
    },
  };
}
