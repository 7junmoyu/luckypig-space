// Ordinary-terminal live check. Never saves settings or prints credentials.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.mjs';
import { ownerToken } from '../src/owner-auth.mjs';
import { assertRuntime } from '../src/runtime.mjs';

assertRuntime();
const config = await loadConfig();
const origin = config.publicUrl;
const report = { passed: false, checkedAt: new Date().toISOString(), site: origin, savedConfigurationChanged: false, modelTestRequested: false, searchTestRequested: false };
let stage = 'access_check';
let cookie = '';
async function request(path, body, authenticated = true) {
  const response = await fetch(`${origin}/api/admin/${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(125000) });
  return { response, data: await response.json() };
}
try {
  const forbidden = await request('settings', undefined, false); assert.equal(forbidden.response.status, 401);
  stage = 'owner_login';
  const login = await request('login', { token: await ownerToken(config.settingsDir) });
  assert.equal(login.response.status, 200, '登录失败，请确认 PUBLIC_URL 与访问地址一致');
  cookie = login.response.headers.get('set-cookie')?.split(';')[0] || ''; assert.ok(cookie);
  stage = 'read_settings';
  const { response, data } = await request('settings'); assert.equal(response.status, 200);
  assert.equal(data.llm.apiKey, undefined); assert.equal(data.search.apiKey, undefined);
  report.adminAccess = true; report.credentialsRedacted = true; report.model = data.llm.model;
  const candidate = { revision: data.revision, llm: { ...data.llm, apiKey: '' }, search: { enabled: data.search.enabled, apiKey: '' } };
  if (process.env.SETTINGS_TEST_MODEL === '1') {
    stage = 'model_connection';
    report.modelTestRequested = true;
    const tested = await request('test-model', candidate);
    assert.equal(tested.response.status, 200, tested.data.error || '模型连接测试失败');
    report.modelConnected = tested.data.ok === true;
  }
  if (process.env.SETTINGS_TEST_SEARCH === '1') {
    stage = 'search_connection';
    report.searchTestRequested = true;
    const tested = await request('test-search', candidate);
    assert.equal(tested.response.status, 200, tested.data.error || '搜索连接测试失败');
    report.searchConnected = tested.data.ok === true;
  }
  stage = 'unchanged_configuration_check';
  const after = await request('settings'); assert.deepEqual(after.data, data);
  stage = 'public_status';
  const status = await fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
  report.chatMode = status.chat.mode; report.searchAvailable = status.chat.search?.available === true;
  report.passed = true;
} catch (error) {
  // Assert messages above contain only local labels or the server's redacted errors.
  report.failureStage = stage;
  const code = error.cause?.code || error.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) report.errorCode = code;
  report.error = ['EPERM', 'EACCES'].includes(code) ? '当前执行环境禁止连接本机网站，不能据此判断服务未启动；请在普通终端运行本验收命令'
    : code === 'ECONNREFUSED' ? '站点地址未接受连接，请检查网站终端及 PUBLIC_URL 的端口'
    : error.name === 'TimeoutError' ? '请求超时，请检查网站或上游连接'
    : error instanceof TypeError ? '无法连接站点，请检查执行环境与站点地址' : error.message;
  process.exitCode = 1;
} finally {
  if (cookie) await request('logout', {}).catch(() => {});
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/model-settings-live.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
