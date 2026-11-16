// Local test helper: use Halo's normal encrypted form login, never enable Basic auth.
import { createPublicKey, publicEncrypt, constants } from 'node:crypto';

const origin = 'http://127.0.0.1:8090';
function csrfInput(html) {
  for (const input of html.match(/<input\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...input.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] ?? m[3]]));
    if (attrs.name === '_csrf' && attrs.value) return attrs.value.replaceAll('&amp;', '&');
  }
  throw new Error('Halo 登录页缺少 CSRF 表单字段；未发送凭据');
}

export async function loginHaloAdmin({ username, password, fetchImpl = fetch }) {
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) throw new Error('本地后台凭据缺失');
  const cookies = new Map();
  const request = async (path, options = {}) => {
    if (!path.startsWith('/') || new URL(path, origin).origin !== origin) throw new Error('后台测试只允许固定本机 Halo 地址');
    let response;
    try {
      response = await fetchImpl(new URL(path, origin), { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', ...options.headers, ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) } });
    } catch (error) { throw new Error(`本机 Halo 请求失败（${error.cause?.code || error.code || error.name}）；未记录凭据`); }
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(';')[0], separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    return response;
  };
  const page = await request('/login?method=local', { headers: { Accept: 'text/html' } });
  if (!page.ok) throw new Error(`Halo 登录页不可用，HTTP ${page.status}`);
  const html = await page.text();
  const csrf = csrfInput(html);
  // Halo's shipped password form embeds this public key. Newer builds also
  // expose /login/public-key; prefer the same input as the actual login form.
  const embedded = /\bconst\s+publicKey\s*=\s*("(?:\\.|[^"\\])*")/.exec(html)?.[1];
  let base64Format = embedded ? JSON.parse(embedded) : null;
  if (!base64Format) {
    const publicKeyResponse = await request('/login/public-key');
    if (!publicKeyResponse.ok) throw new Error(`无法读取 Halo 登录公钥（HTTP ${publicKeyResponse.status}）；未发送凭据`);
    base64Format = (await publicKeyResponse.json()).base64Format;
  }
  if (typeof base64Format !== 'string' || !base64Format) throw new Error('Halo 登录公钥无效；未发送凭据');
  const key = createPublicKey({ key: Buffer.from(base64Format, 'base64'), format: 'der', type: 'spki' });
  const encrypted = publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(password)).toString('base64');
  const login = await request('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: new URLSearchParams({ username, password: encrypted, _csrf: csrf }).toString() });
  const redirect = login.headers.get('location');
  const redirectUrl = redirect ? new URL(redirect, origin) : null;
  const redirectSuccess = [302, 303].includes(login.status) && redirectUrl?.origin === origin && /^\/(?:uc|console)(?:[/?]|$)/.test(redirectUrl.pathname);
  await login.body?.cancel();
  if (!(login.ok || redirectSuccess)) throw new Error(`Halo 登录未完成（HTTP ${login.status}），请检查本地凭据或额外登录验证；未修改后台配置`);
  return {
    async json(path, options = {}) {
      if (!/^\/(?:apis|api|actuator)\//.test(path)) throw new Error('只允许 Halo 管理 API');
      const response = await request(path, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...options.headers } });
      const type = response.headers.get('content-type')?.split(';')[0] || '';
      if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) { await response.body?.cancel(); throw new Error(`Halo 管理会话未授权或已过期（HTTP ${response.status}）`); }
      if (!response.ok || !(type === 'application/json' || /^application\/[^;]+\+json$/.test(type))) { await response.body?.cancel(); throw new Error(`Halo 管理 API 返回异常（HTTP ${response.status}）`); }
      return response.json();
    },
  };
}
