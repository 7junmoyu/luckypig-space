const $ = (selector) => document.querySelector(selector);
let revision = 0;
let demoMode = false;
function notice(message, error = false) { $('#notice').textContent = message; $('#notice').dataset.error = String(error); }
function showLogin() { $('#settings-form').hidden = true; $('#login-panel').hidden = false; for (const id of ['model-key', 'search-key']) $(`#${id}`).value = ''; }
async function api(path, body) {
  const response = await fetch(`/api/admin/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(125000) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== 'login') showLogin(); throw new Error(data.error || '请求失败，请重试'); }
  return data;
}
function render(state) {
  revision = state.revision;
  demoMode = state.demoMode;
  $('#provider').value = state.llm.provider;
  $('#base-url').value = state.llm.baseUrl;
  $('#model').value = state.llm.model;
  $('#timeout').value = state.llm.timeout / 1000;
  $('#search-enabled').checked = state.search.enabled;
  $('#model-state').textContent = state.llm.keyConfigured ? 'Key 已配置' : 'Key 未配置';
  $('#search-state').textContent = state.search.enabled && state.search.keyConfigured ? '已开启' : '未开启';
  for (const id of ['model-key', 'search-key']) { $(`#${id}`).value = ''; $(`#${id}`).placeholder = (id === 'model-key' ? state.llm.keyConfigured : state.search.keyConfigured) ? '已配置，留空保留已有 Key' : '尚未配置，请填写 Key'; }
  for (const id of ['clear-model-key', 'clear-search-key']) $(`#${id}`).checked = false;
  $('#login-panel').hidden = true; $('#settings-form').hidden = false;
}
function form() {
  return { revision, llm: { provider: $('#provider').value, baseUrl: $('#base-url').value.trim(), model: $('#model').value.trim(), timeout: Number($('#timeout').value) * 1000, apiKey: $('#model-key').value.trim(), clearKey: $('#clear-model-key').checked }, search: { enabled: $('#search-enabled').checked, apiKey: $('#search-key').value.trim(), clearKey: $('#clear-search-key').checked } };
}
async function action(work) {
  if ($('#settings-fields').disabled) return;
  const body = form();
  $('#settings-fields').disabled = true;
  try { await work(body); } catch (error) { notice(error.name === 'TimeoutError' ? '请求超时，请检查网络后重试。' : error.message, true); }
  finally { $('#settings-fields').disabled = false; }
}
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = $('#login-form button'); button.disabled = true;
  try { await api('login', { token: $('#owner-token').value.trim() }); $('#owner-token').value = ''; render(await api('settings')); notice('已登录。可以修改模型，或配置联网搜索。'); }
  catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
});
$('#settings-form').addEventListener('submit', (event) => {
  event.preventDefault(); action(async (body) => { notice('正在保存…'); render(await api('settings', body)); notice(demoMode ? '配置已保存。当前以本地演示模式启动，使用 npm start 正常启动后才会调用模型。' : '已保存并生效。下一次提问使用新配置；如尚未测试，可点击测试连接。'); });
});
for (const [id, path, label] of [['test-model', 'test-model', '模型'], ['test-search', 'test-search', '搜索']]) {
  $(`#${id}`).addEventListener('click', () => { if ($('#settings-form').reportValidity()) action(async (body) => { notice(`正在测试${label}连接…`); const result = await api(path, body); notice(`${label}连接成功，用时 ${(result.elapsedMs / 1000).toFixed(1)} 秒。测试不会自动保存；有修改时请点击保存。`); }); });
}
$('#reload-settings').addEventListener('click', () => action(async () => { render(await api('settings')); notice('已恢复保存的配置，未保存的修改已丢弃。'); }));
$('#logout').addEventListener('click', () => action(async () => { await api('logout', {}); showLogin(); notice('已退出登录。'); }));
try { const session = await api('session'); if (session.authenticated) { render(await api('settings')); notice('当前为已保存配置。'); } else { showLogin(); notice('请使用本机口令登录。'); } }
catch (error) { showLogin(); notice(error.message, true); }
