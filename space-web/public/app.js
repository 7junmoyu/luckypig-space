import { readSse } from './chat-stream.js';
import { media } from './assets/media.js';
import { renderRichContent } from './rich-content.js';
import { enhanceRecordingPlayers } from './recording-player.js';
import { readBrowseState, browseUrl, pageProjects, filterProjects, showcaseUrl } from './browse-state.js';
import { mountPersonalHome, renderPersonalProfile } from './personal-home.js';
import { mountHeroCarousel } from './hero-carousel.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const site = JSON.parse(document.getElementById('site-config').textContent);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let projects = [];
let browse = readBrowseState(location.href);
let activeDetailCleanup = null;
let toastTimer;
let detailRequest;
let chatPending = false;
let chatController;
let chatGeneration = 0;
let chatHistory = [];
let lastChatAttempt;
let agentManifest;
let refreshing = false;

async function getJson(url, options = {}) {
  let response;
  try { response = await fetch(url, { cache: 'no-store', ...options }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new Error('资料暂时无法读取，请检查连接后重试'); }
  let body;
  try { body = await response.json(); }
  catch { throw new Error('内容服务返回异常，请稍后重试'); }
  if (!response.ok) { const error = new Error(body.error || '资料暂时无法加载'); error.status = response.status; throw error; }
  return body;
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

const artwork = {
  pipeline: `<svg viewBox="0 0 640 310" role="img" aria-label="从 Git 提交到集群的交付流程概念示意"><defs><pattern id="pipeline-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#a48170" opacity=".2"/></pattern><radialGradient id="pipeline-glow"><stop stop-color="#493129"/><stop offset="1" stop-color="#211b18"/></radialGradient><linearGradient id="pipeline-line"><stop stop-color="#bd826b"/><stop offset="1" stop-color="#e5b39d"/></linearGradient></defs><rect width="640" height="310" fill="url(#pipeline-glow)"/><rect width="640" height="310" fill="url(#pipeline-grid)"/><g stroke="#c48d74" fill="none" stroke-width="1.1"><path d="M157 151H262M338 151H445"/><path d="M300 115V72H490V116" opacity=".3" stroke-dasharray="4 5"/><path d="M119 186V234H487V188" opacity=".3" stroke-dasharray="4 5"/></g><g stroke="#aa7a65" fill="#34251f"><rect x="79" y="114" width="79" height="75" rx="13"/><rect x="261" y="114" width="79" height="75" rx="13"/><rect x="444" y="114" width="79" height="75" rx="13"/></g><g stroke="#e8c1ab" fill="none" stroke-width="1.5"><path d="m105 141 14-8 14 8v19l-14 8-14-8Zm0 0 14 9 14-9m-14 9v18"/><path d="m285 147 15-9 15 9v17l-15 8-15-8Zm0 0 15 8 15-8m-15 8v17M300 129v9"/><path d="m483 132 16 10v20l-16 9-16-9v-20Zm-16 10 16 9 16-9m-16 9v20"/></g><g font-family="monospace" font-size="10" text-anchor="middle" letter-spacing="1.5" fill="#cfb2a1"><text x="119" y="212">COMMIT</text><text x="301" y="212">BUILD</text><text x="484" y="212">SYNC</text></g><g fill="#e9a77e"><circle cx="187" cy="151" r="3"><animate attributeName="cx" values="163;253" dur="2s" repeatCount="indefinite"/></circle><circle cx="369" cy="151" r="3"><animate attributeName="cx" values="346;437" dur="2s" begin=".6s" repeatCount="indefinite"/></circle></g><g font-family="monospace" font-size="7" letter-spacing="1" fill="#9c7b68"><text x="440" y="45">DECLARATIVE DELIVERY</text><text x="85" y="75">GIT → CLUSTER</text></g></svg>`,
  knowledge: `<svg viewBox="0 0 640 310" role="img" aria-label="资料与知识助手的连接概念示意"><defs><radialGradient id="knowledge-glow"><stop stop-color="#423a4c"/><stop offset="1" stop-color="#1e1b28"/></radialGradient></defs><rect width="640" height="310" fill="url(#knowledge-glow)"/><g fill="none" stroke="#b5a1d0" opacity=".2"><circle cx="324" cy="157" r="91"/><circle cx="324" cy="157" r="123" stroke-dasharray="2 7"/><path d="m169 87 155 70 156-84M160 238l164-81 158 78"/></g><g transform="translate(278 111)"><rect width="92" height="92" rx="23" fill="#3a3346" stroke="#a78cb4" stroke-width=".8"/><path d="M46 23v46M23 46h46M30 30l32 32m0-32L30 62" stroke="#e0d0ed" stroke-width="2"/><circle cx="46" cy="46" r="10" fill="#d2bce3"/></g><g fill="#292535" stroke="#7e6c91" stroke-width=".7"><rect x="103" y="63" width="115" height="48" rx="6"/><rect x="433" y="50" width="115" height="48" rx="6"/><rect x="97" y="213" width="115" height="48" rx="6"/><rect x="430" y="211" width="115" height="48" rx="6"/></g><g font-family="monospace" font-size="10" text-anchor="middle" fill="#d7c7e2"><text x="161" y="92">documents.md</text><text x="491" y="79">projects.json</text><text x="155" y="243">creative.mp4</text><text x="488" y="241">profile.json</text></g><g fill="#c1a8d5"><circle cx="242" cy="121" r="2"/><circle cx="410" cy="113" r="2"/><circle cx="237" cy="202" r="2"/><circle cx="404" cy="199" r="2"/></g><text x="324" y="284" fill="#897499" text-anchor="middle" font-family="monospace" font-size="8" letter-spacing="2">CONTEXT → CONNECTION → ANSWER</text></svg>`,
  metrics: `<svg viewBox="0 0 640 310" role="img" aria-label="使用演示数据绘制的可观测性图表"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#cc785c" stop-opacity=".25"/><stop offset="1" stop-color="#cc785c" stop-opacity="0"/></linearGradient></defs><rect width="640" height="310" fill="#241f1b"/><g stroke="#856c5a" opacity=".17"><path d="M70 99H565M70 137H565M70 175H565M70 213H565M120 80V231M200 80V231M280 80V231M360 80V231M440 80V231M520 80V231"/></g><g font-family="monospace" font-size="8" fill="#b79c86" letter-spacing="1.2"><text x="75" y="52">SYSTEM SIGNALS</text><text x="470" y="52">SAMPLE DATA</text></g><path d="m75 203 20-13 21 8 16-38 19 11 20-28 15 12 22-45 20 25 16-12 20 32 21-11 17 23 20-32 15 10 22-41 20 11 22-33 20 20 15-9 20 26 20-17 15 14 20-38 15 8 19-20 20 16v94H75Z" fill="url(#chart-fill)"/><path d="m75 203 20-13 21 8 16-38 19 11 20-28 15 12 22-45 20 25 16-12 20 32 21-11 17 23 20-32 15 10 22-41 20 11 22-33 20 20 15-9 20 26 20-17 15 14 20-38 15 8 19-20 20 16" fill="none" stroke="#dc9677" stroke-width="1.7"/><path d="m75 220 35-5 25 6 30-14 30 8 25-20 40 9 30-10 35 12 30-15 30 8 30-24 40 8 40-17 35 9" fill="none" stroke="#7c9fb3" stroke-width="1.2" opacity=".8"/><g font-family="monospace" font-size="7" fill="#9b7d68"><text x="73" y="253">00:00</text><text x="282" y="253">12:00</text><text x="520" y="253">24:00</text></g><g fill="#dc9677"><circle cx="80" cy="276" r="2"/></g><text x="90" y="279" font-family="monospace" font-size="7" fill="#bca18b">METRICS</text><circle cx="171" cy="276" r="2" fill="#7c9fb3"/><text x="182" y="279" font-family="monospace" font-size="7" fill="#8297a1">TRACES</text><text x="445" y="279" font-family="monospace" font-size="7" fill="#9b7d68">NOT LIVE TELEMETRY</text></svg>`
};

function artworkHtml(project, detail = false) {
  if (project.cover) return `<div class="project-art"><img class="project-cover" src="${escapeHtml(project.cover)}" alt="${escapeHtml(project.title)}的封面" loading="lazy"></div>`;
  if (project.visual === 'creative') {
    return `<div class="project-art creative-art"><img class="texture-layer" src="${escapeHtml(media.texture)}" data-remote="https://images.unsplash.com/photo-1663335468790-cf7e8a1e0e73?auto=format&fit=crop&w=1100&q=80" alt="and machines 创作的虹彩抽象纹理参考图" loading="lazy"><canvas class="creative-canvas" data-creative-canvas aria-label="原创生成式视觉示意"></canvas><span class="art-watermark">PROCEDURAL STUDY / ${detail ? 'EXPANDED VIEW' : 'NO. 001'}</span></div>`;
  }
  // Avoid duplicate SVG definition IDs when a preview and detail coexist.
  const suffix = detail ? '-detail' : `-${project.id}`;
  return `<div class="project-art">${(artwork[project.visual] || artwork.metrics).replace(/id="([^"]+)"/g, (_, id) => `id="${id}${suffix}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}${suffix})`)}</div>`;
}

function prepareImages(root) {
  $$('img[data-remote]', root).forEach((image) => {
    image.addEventListener('error', () => {
      if (image.dataset.triedRemote || image.src === new URL(image.dataset.remote, location.href).href) { image.hidden = true; const note = image.nextElementSibling; if (note?.classList.contains('media-error')) note.hidden = false; return; }
      image.dataset.triedRemote = 'true';
      image.src = image.dataset.remote;
    });
    if (image.complete && image.naturalWidth === 0) image.dispatchEvent(new Event('error'));
  });
}

function renderProjects() {
  const result = pageProjects(projects, browse);
  const visible = result.items;
  const pageChanged = browse.page !== result.page;
  browse.page = result.page;
  if (pageChanged) history.replaceState(null, '', browseUrl(location.href, browse));
  $$('.filter-tab').forEach((tab) => { const selected = tab.dataset.filter === browse.category; tab.classList.toggle('selected', selected); tab.setAttribute('aria-pressed', selected); });
  if ($('#project-search').value !== browse.q) $('#project-search').value = browse.q;
  const tags = [...new Set([...projects.flatMap((p) => p.tags), ...(browse.tag ? [browse.tag] : [])])].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if ($('#tag-filter').dataset.options !== JSON.stringify(tags)) {
    $('#tag-filter').innerHTML = `<option value="">全部标签</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join('')}`;
    $('#tag-filter').dataset.options = JSON.stringify(tags);
  }
  $('#tag-filter').value = browse.tag;
  $('#scope-filter').value = browse.scope;
  $('#showcase-intro').hidden = browse.view !== 'interview';
  $('#clear-filters').hidden = browse.category === 'all' && !browse.q && !browse.tag && browse.scope === 'all' && browse.view === 'gallery';
  $('#pagination').hidden = result.pageCount <= 1;
  $('#page-indicator').textContent = `第 ${result.page} / ${result.pageCount} 页`;
  $('#previous-page').disabled = result.page <= 1;
  $('#next-page').disabled = result.page >= result.pageCount;
  $('#project-grid').innerHTML = visible.map((p) => `<article class="project-card"><button data-project="${escapeHtml(p.id)}" aria-label="查看作品：${escapeHtml(p.title)}"><div class="project-visual">${artworkHtml(p)}<span class="project-number">${escapeHtml(p.number)}</span><span class="project-format">${escapeHtml(p.format)}</span><span class="project-open" aria-hidden="true">↗</span></div><div class="project-meta"><span class="project-category">${escapeHtml(p.categoryLabel)} / ${escapeHtml(p.category.toUpperCase())}</span><span class="project-ref">${p.demo !== false ? '测试 / 参考内容' : '个人作品'}</span></div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.summary)}</p><div class="project-tags">${p.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div></button></article>`).join('');
  $('#empty-state').hidden = visible.length > 0;
  $('#total-projects').textContent = String(filterProjects(projects, { category: 'all', q: '', tag: '', scope: browse.scope }).length).padStart(2, '0');
  $('#result-count').textContent = `${String(result.total).padStart(2, '0')} EXPLORATIONS`;
  prepareImages($('#project-grid'));
  $$('[data-creative-canvas]', $('#project-grid')).forEach(drawCreativeStudy);
  if (reducedMotion.matches) $$('svg', $('#project-grid')).forEach((svg) => svg.pauseAnimations?.());
}

function changeBrowse(patch, mode = 'push') {
  browse = { ...browse, page: 1, ...patch };
  const url = browseUrl(location.href, browse);
  if (url !== `${location.pathname}${location.search}${location.hash}`) history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', url);
  renderProjects();
}

function showDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
  if (id === 'chat-dialog') setTimeout(() => $('#chat-input').focus(), 60);
}

async function openProject(id) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  activeDetailCleanup?.();
  const detail = $('#project-detail');
  detail.innerHTML = '<div class="detail-inner"><p role="status">正在读取作品…</p></div>';
  showDialog('project-dialog');
  let project;
  try { project = await getJson(`/api/projects/${encodeURIComponent(id)}`, { signal: controller.signal }); }
  catch (error) {
    if (controller.signal.aborted && !timedOut) return;
    detail.innerHTML = `<div class="detail-inner"><h2>${error.status === 404 ? '作品不存在或已下线' : '作品暂时无法加载'}</h2><p>${escapeHtml(timedOut ? '读取作品超时，请重试' : error.message)}</p><button class="button button-quiet" data-project="${escapeHtml(id)}">重试</button></div>`;
    if (error.status === 404) { projects = projects.filter((p) => p.id !== id); renderProjects(); }
    return;
  } finally { clearTimeout(timeout); }
  if (controller.signal.aborted) return;
  if (project.content) { renderPublishedProject(project, detail); return; }
  detail.innerHTML = `<div class="detail-visual">${artworkHtml(project, true)}</div><div class="detail-inner"><p class="detail-kicker">${project.number} / ${escapeHtml(project.categoryLabel)} / OPEN-SOURCE REFERENCE</p><h2>${escapeHtml(project.title)}</h2><p class="detail-subtitle">${escapeHtml(project.subtitle)}</p><div class="detail-notice">${escapeHtml(project.authorship)}。当前页面用于体验个人作品的展示形式。</div><p class="detail-description">${escapeHtml(project.description)}</p><div class="project-tags">${project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="detail-steps">${project.steps.map((step, index) => `<div class="detail-step"><span>0${index + 1}</span><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.body)}</p></div>`).join('')}</div>${project.referenceMedia ? `<p class="detail-media-label">官方动态素材参考 · Argo CD 官网演示（网络加载）</p><img class="detail-media" src="${escapeHtml(media.argo)}" data-remote="${escapeHtml(project.referenceMedia)}" alt="Argo CD 官方界面的动态演示" loading="lazy">` : ''}<p class="detail-learning">${escapeHtml(project.learning)}</p><div class="detail-source"><div class="detail-credit">资料来源：${escapeHtml(project.source.name)}<br>${escapeHtml(project.mediaCredit)}</div><a class="button button-primary" href="${escapeHtml(project.source.url)}" target="_blank" rel="noopener noreferrer">查看原项目 <span aria-hidden="true">↗</span></a></div><button class="text-button" data-project-chat="${escapeHtml(project.title)}">向 Space Guide 了解这个案例 <span aria-hidden="true">↗</span></button></div>`;
  if (project.referenceMedia) {
    const image = $('.detail-media', detail);
    image.src = media.argo;
    image.insertAdjacentHTML('afterend', '<p class="detail-media-label media-error" hidden>官方动图暂时无法加载，你仍可以通过下方链接查看原项目。</p>');
  }
  if (project.category === 'ai' && !project.testMedia) {
    $('.detail-learning', detail).insertAdjacentHTML('beforebegin', `<p class="detail-media-label">视频播放体验 · Pexels 公开素材（非站主创作，按需加载）</p><video class="detail-media" controls playsinline preload="none" aria-label="Pexels 公开视频素材播放示例"><source src="${escapeHtml(media.video)}" type="video/mp4">你的浏览器不支持视频播放。</video><p class="detail-media-label media-error" hidden>视频暂时无法加载。可以稍后重试，或在<a href="https://www.pexels.com/download/video/8084494/" target="_blank" rel="noopener noreferrer">来源页面</a>查看素材。</p>`);
    const video = $('video', detail);
    const showMediaError = () => { video.nextElementSibling.hidden = false; };
    video.addEventListener('error', showMediaError);
    $('source', video).addEventListener('error', showMediaError);
  }
  if (project.testMedia) {
    $('.detail-learning', detail).insertAdjacentHTML('beforebegin', `<p class="detail-media-label">本地多媒体测试样本 · 非 AI 创作或个人工作成果</p><img class="detail-media" src="${escapeHtml(project.testMedia.image)}" alt="本地多媒体测试图"><video class="detail-media" controls playsinline preload="metadata" aria-label="本地三秒视频播放测试"><source src="${escapeHtml(project.testMedia.video)}" type="video/mp4">你的浏览器不支持视频播放。</video><a class="text-button" href="${escapeHtml(project.testMedia.document)}" download="notes.md">下载本地测试文档 ↓</a>`);
  }
  showDialog('project-dialog');
  detail.parentElement.scrollTop = 0;
  prepareImages(detail);
  $$('[data-creative-canvas]', detail).forEach(drawCreativeStudy);
  if (reducedMotion.matches) $$('svg', detail).forEach((svg) => svg.pauseAnimations?.());
  $('.detail-source', detail).insertAdjacentHTML('afterend', '<a class="text-button" href="./data/reference-notes.md" download="luckypig-reference-notes.md">下载案例说明文档 ↓</a>');
  $('.detail-source', detail).insertAdjacentHTML('afterend', `<button class="text-button" data-copy-project="${escapeHtml(project.id)}">复制作品链接 ↗</button>`);
  enhanceImages(detail);
  activeDetailCleanup = () => { $$('video', detail).forEach((video) => video.pause()); };
}

function renderPublishedProject(project, detail) {
  const content = renderRichContent(project.content.html, project.content.baseUrl);
  const firstVideo = !project.demo && content.querySelector('video');
  detail.innerHTML = `${firstVideo ? '' : `<div class="detail-visual">${artworkHtml(project, true)}</div>`}<div class="detail-inner${firstVideo ? ' recording-detail' : ''}"><p class="detail-kicker">${escapeHtml(project.categoryLabel)} / ${project.demo ? 'REFERENCE' : 'PERSONAL WORK'}</p><h2>${escapeHtml(project.title)}</h2><p class="detail-subtitle">${escapeHtml(project.subtitle)}</p><div class="detail-notice">${escapeHtml(project.authorship)}</div><p class="detail-description">${escapeHtml(project.summary)}</p><div class="project-tags">${project.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>${firstVideo ? '<div class="recording-stage"></div>' : ''}<div class="rich-content"></div><div class="detail-credit">${escapeHtml(project.mediaCredit)}</div>${project.source ? `<a class="text-button" href="${escapeHtml(project.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(project.source.name)} ↗</a>` : ''}<div class="detail-actions"><button class="text-button" data-copy-project="${escapeHtml(project.id)}">复制作品链接 ↗</button><button class="text-button" data-project-chat="${escapeHtml(project.title)}">通过对话了解这件作品 ↗</button></div></div>`;
  const rich = $('.rich-content', detail);
  if (firstVideo) $('.recording-stage', detail).append(firstVideo);
  rich.append(content);
  enhanceRecordingPlayers(detail);
  $$('img, video', detail).forEach((element) => {
    const error = document.createElement('p');
    error.className = 'detail-media-label'; error.hidden = true; error.textContent = '素材暂时无法加载，请稍后重试。';
    element.after(error);
    element.addEventListener('error', () => { error.hidden = false; });
    $$('source', element).forEach((source) => source.addEventListener('error', () => { error.hidden = false; }));
  });
  enhanceImages(rich);
  $$('[data-creative-canvas]', detail).forEach(drawCreativeStudy);
  detail.parentElement.scrollTop = 0;
  activeDetailCleanup = () => { $$('video', detail).forEach((video) => video.pause()); };
}

function enhanceImages(root) {
  $$('img', root).filter((image) => !image.closest('button, a') && !image.classList.contains('texture-layer')).forEach((image) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'image-preview-button';
    button.setAttribute('aria-label', `放大查看：${image.alt || '作品图片'}`);
    image.replaceWith(button); button.append(image);
    button.addEventListener('click', () => {
      if (!image.naturalWidth) { notify('图片尚未加载成功，请稍后重试'); return; }
      $('#image-preview').src = image.currentSrc || image.src;
      $('#image-preview').alt = image.alt;
      $('#image-title').textContent = image.alt || '作品图片';
      showDialog('image-dialog');
    });
  });
}

async function copyProject(id) {
  const base = new URL('/', location.href);
  const share = new URL(browseUrl(base, browse), base);
  share.hash = `project/${encodeURIComponent(id)}`;
  const url = share.href;
  try { await navigator.clipboard.writeText(url); notify('作品链接已复制'); }
  catch {
    const input = document.createElement('textarea');
    input.value = url; input.readOnly = true; input.className = 'clipboard-fallback';
    ($('#project-dialog').open ? $('#project-dialog') : document.body).append(input);
    input.select(); const copied = document.execCommand('copy'); input.remove();
    notify(copied ? '作品链接已复制' : '请复制浏览器地址栏中的作品链接');
  }
}

function routeProject() {
  const match = location.hash.match(/^#project\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,200})$/);
  if (match) openProject(match[1]);
  else if ($('#project-dialog').open) $('#project-dialog').close();
}

function messageLinks(message, links) {
  $('.message-links', message)?.remove();
  if (!links?.length) return;
  const actions = document.createElement('div');
  actions.className = 'message-links';
  const label = document.createElement('span');
  label.className = 'message-sources-label';
  label.textContent = '本轮检索依据';
  actions.append(label);
  for (const link of links) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${link.title} ↗`;
    if (link.id) button.dataset.project = link.id;
    else button.dataset.openAgent = '';
    if (link.kind === 'web') {
      const anchor = document.createElement('a');
      try { const url = new URL(link.url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue; anchor.href = url.href; } catch { continue; }
      anchor.textContent = `网页 · ${link.title} ↗`; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; actions.append(anchor);
    } else actions.append(button);
  }
  message.append(actions);
}

function appendMessage(role, text, links = []) {
  const message = document.createElement('div');
  message.className = `message ${role}`;
  const name = document.createElement('span');
  name.className = 'message-name';
  name.textContent = role === 'user' ? 'YOU' : site.guide.toUpperCase();
  const content = document.createElement('p');
  content.textContent = text;
  message.append(name, content);
  messageLinks(message, links);
  $('#chat-messages').append(message);
  message.scrollIntoView({ block: 'nearest' });
  return message;
}

function chatBusy(busy) {
  chatPending = busy;
  $('#chat-form button[type="submit"]').disabled = busy;
  $('#chat-stop').hidden = !busy;
  $('#chat-web-search').disabled = busy || $('#chat-web-search').dataset.available !== 'true';
  $('#chat-form').setAttribute('aria-busy', String(busy));
}

async function loadChatStatus() {
  try {
    const { chat } = await getJson('/api/status', { signal: AbortSignal.timeout(10000) });
    $('#chat-mode').textContent = chat.mode === 'local-demo' ? '公开内容 · 本地检索演示' : chat.configured ? `${chat.mode === 'deepseek' ? 'DeepSeek' : 'LLM'} · ${chat.model}` : '模型尚未配置';
    const search = $('#chat-web-search');
    search.dataset.available = String(Boolean(chat.search?.available));
    search.disabled = chatPending || !chat.search?.available;
    if (!chat.search?.available) search.checked = false;
    $('#chat-search-state').textContent = chat.search?.available ? '联网搜索' : '联网搜索 · 站主尚未开启';
    $('#chat-footnote').textContent = chat.mode === 'local-demo' ? '当前为本地检索，未调用 LLM。按 Esc 关闭。' : chat.configured ? '问题与相关公开资料将发送给模型；会话仅保留在当前页面。' : '请站主配置模型；作品浏览仍可使用。';
  } catch { $('#chat-mode').textContent = '会话配置暂时无法读取'; $('#chat-web-search').disabled = true; $('#chat-web-search').checked = false; }
}

async function ask(question, retry = false) {
  const input = $('#chat-input');
  const text = question.trim();
  if (!text || chatPending) return;
  showDialog('chat-dialog');
  $$('.message-retry').forEach((button) => button.remove());
  const history = retry && lastChatAttempt ? lastChatAttempt.history : chatHistory.slice(-8);
  const webSearch = $('#chat-web-search').checked;
  if (retry) lastChatAttempt?.message.remove();
  else appendMessage('user', text);
  input.value = '';
  input.style.height = '';
  const message = appendMessage('assistant', webSearch ? '正在搜索网络并读取公开资料…' : '正在读取公开资料…');
  const output = $('p', message);
  lastChatAttempt = { question: text, history, message, webSearch };
  const generation = ++chatGeneration;
  const controller = new AbortController();
  chatController = controller;
  chatBusy(true);
  let answer = '', links = [], done = false;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ question: text, history, webSearch }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(125000)]),
    });
    if (!response.ok) {
      let error;
      try { error = await response.json(); } catch { /* Use the generic message. */ }
      throw new Error(error?.error || '会话服务暂时不可用，请重试');
    }
    for await (const frame of readSse(response.body)) {
      if (generation !== chatGeneration) return;
      const data = JSON.parse(frame.data);
      if (frame.event === 'meta') {
        links = data.links || []; messageLinks(message, links);
        if (data.model) $('#chat-mode').textContent = `${data.model}${data.webSearch ? ' · 已联网' : ''}`;
        if (data.webSearch && !data.searchResultCount) output.textContent = '未找到网页依据，正在结合公开资料回答…';
      }
      if (frame.event === 'delta') {
        answer += data.text;
        output.textContent = answer;
        const container = $('#chat-messages');
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 160) message.scrollIntoView({ block: 'end' });
      }
      if (frame.event === 'error') throw new Error(data.error);
      if (frame.event === 'done') {
        done = true;
        if (data.finishReason === 'length') {
          const note = document.createElement('small'); note.textContent = '回答达到长度上限，可以继续追问。'; message.append(note);
        }
        break;
      }
    }
    if (!done || !answer) throw new Error('回答未完整结束，请重试');
    chatHistory = [...history, { role: 'user', content: text }, { role: 'assistant', content: answer.slice(0, 2500), projectIds: links.filter((link) => link.id).map((link) => link.id).slice(0, 4) }].slice(-8);
  } catch (error) {
    if (generation !== chatGeneration) return;
    if (!answer) output.textContent = '';
    const notice = document.createElement('span');
    notice.className = 'message-status';
    notice.textContent = controller.signal.aborted ? '已停止生成。' : error.name === 'TimeoutError' ? '请求超时，请重试。' : error.message || '连接中断，请重试。';
    if (answer) notice.textContent += ' 已保留收到的内容。';
    message.append(notice);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button message-retry'; button.dataset.chatRetry = ''; button.textContent = '重新生成 ↗'; message.append(button);
  } finally { if (generation === chatGeneration) { chatBusy(false); chatController = null; } }
}

function newChat() {
  chatController?.abort();
  chatGeneration++;
  chatHistory = [];
  lastChatAttempt = null;
  chatBusy(false);
  $('#chat-messages').replaceChildren();
  appendMessage('assistant', site.id === 'zyt' ? '你好，欢迎来逛逛。想了解雨彤做过什么，或者找找前端、鸿蒙、AI 辅助开发和部署相关的项目，都可以问我。我会根据这里已经公开的内容回答。' : `你好，我是 ${site.guide}。可以根据公开资料介绍这个空间，或帮你了解${site.topics}。作品来源和个人贡献以详情说明为准。`);
  $('#chat-input').value = '';
  $('#chat-input').focus();
  loadChatStatus();
}

function drawCreativeStudy(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const w = Math.round(rect.width * Math.min(devicePixelRatio, 1.5));
  const h = Math.round(rect.height * Math.min(devicePixelRatio, 1.5));
  canvas.width = w;
  canvas.height = h;
  context.clearRect(0, 0, w, h);
  const cx = w * 0.51;
  const cy = h * 0.5;
  const scale = Math.min(w * .31, h * .62);
  const points = [];
  for (let i = 0; i < 220; i++) {
    const t = i / 220 * Math.PI * 2;
    for (let j = 0; j < 40; j++) {
      const b = j / 40 * Math.PI * 2;
      const r = 1 + .31 * Math.cos(3 * t + .4);
      const x = (r + .18 * Math.cos(b)) * Math.cos(2 * t);
      const y = (r + .18 * Math.cos(b)) * Math.sin(2 * t);
      const z = .4 * Math.sin(3 * t) + .18 * Math.sin(b);
      const yy = y * .5 - z * .87;
      const zz = y * .87 + z * .5;
      points.push({ x: cx + x * scale, y: cy + yy * scale, z: zz, hue: 18 + (Math.cos(t) + 1) * 9 + Math.sin(b) * 8, light: 44 + (zz + 1) * 13 });
    }
  }
  points.sort((a, b) => a.z - b.z);
  for (const p of points) {
    context.fillStyle = `hsla(${p.hue}, 57%, ${p.light}%, ${.45 + (p.z + 1) * .2})`;
    context.beginPath();
    context.arc(p.x, p.y, Math.max(.8, scale * .006), 0, Math.PI * 2);
    context.fill();
  }
}

function startHeroSculpture() {
  const canvas = $('#hero-canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  const parent = canvas.parentElement;
  let width = 500, height = 550, frame = 0, time = 0, targetX = -.16, targetY = .15, pointerX = -.16, pointerY = .15, mode = 0, visible = true, lastTime = 0;
  let points = [];
  function generate() {
    points = [];
    const count = width < 500 ? 150 : 195;
    for (let i = 0; i < count; i++) {
      const t = i / count * Math.PI * 2;
      for (let j = 0; j < 19; j++) {
        const v = j / 19 * Math.PI * 2;
        if (mode === 0) {
          const r = 1.27 + .36 * Math.cos(3 * t);
          points.push({ x: (r + .2 * Math.cos(v)) * Math.cos(2 * t), y: (r + .2 * Math.cos(v)) * Math.sin(2 * t), z: .55 * Math.sin(3 * t) + .2 * Math.sin(v), hue: 18 + 10 * Math.sin(t) + 9 * Math.cos(v), seed: i + j });
        } else {
          const r = 1.27 + .11 * Math.sin(t * 9 + v * 2);
          points.push({ x: r * Math.sin(v) * Math.cos(t), y: r * Math.sin(v) * Math.sin(t), z: r * Math.cos(v), hue: 21 + 9 * Math.sin(v) + 8 * Math.sin(t), seed: i + j });
        }
      }
    }
  }
  function resize() {
    const rect = parent.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const dpr = Math.min(devicePixelRatio, 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    generate();
    if (reducedMotion.matches) draw(0);
  }
  function draw(timestamp) {
    if (!visible || document.hidden) return;
    if (timestamp && timestamp - lastTime < 32) return;
    lastTime = timestamp;
    if (!reducedMotion.matches) time += .003;
    pointerX += (targetX - pointerX) * .045;
    pointerY += (targetY - pointerY) * .045;
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width * .22, height * .23);
    const centerX = width * .5, centerY = height * .48;
    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, scale * 2.1);
    glow.addColorStop(0, '#cc785c18'); glow.addColorStop(.6, '#a9583e0c'); glow.addColorStop(1, '#18171500');
    context.fillStyle = glow; context.fillRect(0, 0, width, height);
    const ay = time + pointerX * .9 + .4, ax = -.7 + pointerY * .6;
    const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(ax), sb = Math.sin(ax);
    const transformed = points.map((point) => {
      const x = point.x * ca + point.z * sa, z = -point.x * sa + point.z * ca;
      const y = point.y * cb - z * sb, depth = point.y * sb + z * cb;
      const perspective = 4.6 / (4.6 - depth);
      return { x: centerX + x * scale * perspective, y: centerY + y * scale * perspective, depth, hue: point.hue, seed: point.seed, perspective };
    }).sort((a, b) => a.depth - b.depth);
    context.strokeStyle = '#cc785c28'; context.lineWidth = .7;
    context.beginPath(); context.ellipse(centerX, centerY, scale * 2.06, scale * .8, -.32, 0, Math.PI * 2); context.stroke();
    for (const p of transformed) {
      const brightness = Math.min(87, 43 + (p.depth + 1.8) * 9 + Math.sin(p.seed * .15) * 7);
      context.fillStyle = `hsla(${p.hue}, 59%, ${brightness}%, ${Math.max(.17, .48 + p.depth * .17)})`;
      context.beginPath(); context.arc(p.x, p.y, (width < 500 ? .83 : 1.05) * p.perspective, 0, Math.PI * 2); context.fill();
    }
    context.strokeStyle = '#d89b7c1c'; context.beginPath();context.ellipse(centerX, centerY, scale * 2.35, scale * 1.75, .45, 0, Math.PI * 2);context.stroke();
  }
  function animate(timestamp) { draw(timestamp); frame = requestAnimationFrame(animate); }
  parent.addEventListener('pointermove', (event) => { const r = parent.getBoundingClientRect(); targetX = (event.clientX - r.left) / r.width - .5; targetY = (event.clientY - r.top) / r.height - .5; $('#coord-x').textContent = targetX.toFixed(3); $('#coord-y').textContent = targetY.toFixed(3); if (reducedMotion.matches) draw(0); });
  parent.addEventListener('pointerleave', () => { targetX = -.16; targetY = .15; });
  const viewControls = $$('[data-hero-view]', parent);
  if (viewControls.length) {
    const labels = { portrait: '个人照片', knot: '灵感纽结', sphere: '连接球体' };
    mountHeroCarousel(parent, { reducedMotion, selectView(view, reason) {
      if (!Object.hasOwn(labels, view)) return;
      parent.dataset.heroDisplay = view;
      parent.setAttribute('aria-label', `张雨彤的${labels[view]}`);
      for (const control of viewControls) control.setAttribute('aria-pressed', String(control.dataset.heroView === view));
      canvas.setAttribute('aria-hidden', String(view === 'portrait'));
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', labels[view]);
      const caption = parent.querySelector('[data-hero-caption]');
      caption.setAttribute('aria-live', reason === 'auto' ? 'off' : 'polite');
      caption.hidden = view === 'portrait';
      caption.textContent = `${labels[view]} · 移动指针，探索不同角度`;
      if (view !== 'portrait') mode = view === 'sphere' ? 1 : 0;
      generate(); draw(0);
    } });
  } else $('#shape-toggle').addEventListener('click', () => { mode = 1 - mode; generate(); draw(0); notify(mode ? '已切换为连接球体' : '已切换为灵感纽结'); });
  new ResizeObserver(resize).observe(parent);
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible && reducedMotion.matches) draw(0); }).observe(parent);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && reducedMotion.matches) draw(0); });
  reducedMotion.addEventListener('change', () => { cancelAnimationFrame(frame); if (reducedMotion.matches) draw(0); else frame = requestAnimationFrame(animate); });
  resize();
  if (!reducedMotion.matches) frame = requestAnimationFrame(animate);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('[data-open-showcase]')) {
    changeBrowse({ scope: 'personal', view: 'interview', category: 'all', q: '', tag: '' });
    $('#projects').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    $('#project-grid').focus({ preventScroll: true });
  }
  if (target.matches('[data-open-chat]')) { showDialog('chat-dialog'); loadChatStatus(); }
  if (target.matches('[data-open-agent]')) { if ($('#chat-dialog').open) $('#chat-dialog').close(); showDialog('agent-dialog'); loadAgentStatus(); }
  if (target.dataset.close) document.getElementById(target.dataset.close).close();
  if (target.dataset.filter) {
    changeBrowse({ category: target.dataset.filter });
  }
  if (target.dataset.project) {
    if ($('#chat-dialog').open) $('#chat-dialog').close();
    if (location.hash === `#project/${target.dataset.project}`) openProject(target.dataset.project);
    else location.hash = `project/${target.dataset.project}`;
  }
  if (target.dataset.question) ask(target.dataset.question);
  if (target.dataset.projectChat) { $('#project-dialog').close(); ask(`介绍一下${target.dataset.projectChat}`); }
  if (target.dataset.copyProject) copyProject(target.dataset.copyProject);
  if (target.matches('[data-retry-content]')) refreshContent();
  if (target.id === 'clear-filters' || target.id === 'exit-showcase') changeBrowse({ category: 'all', q: '', tag: '', scope: 'all', view: 'gallery' });
  if (target.id === 'previous-page' || target.id === 'next-page') {
    changeBrowse({ page: browse.page + (target.id === 'next-page' ? 1 : -1) });
    $('#project-grid').focus({ preventScroll: true });
    $('#projects').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }
});

$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); }));
$('#project-dialog').addEventListener('close', () => { detailRequest?.abort(); activeDetailCleanup?.(); if (location.hash.startsWith('#project/')) history.replaceState(null, '', '#projects'); });
$('#image-dialog').addEventListener('close', () => { $('#image-preview').removeAttribute('src'); });
$('#project-search').addEventListener('input', (event) => { changeBrowse({ q: event.target.value.slice(0, 200) }, 'replace'); });
$('#scope-filter').addEventListener('change', (event) => { changeBrowse({ scope: event.target.value, view: event.target.value === 'personal' ? browse.view : 'gallery' }); });
$('#copy-showcase').addEventListener('click', async () => {
  const link = showcaseUrl(location.href);
  try { await navigator.clipboard.writeText(link); notify('面试展示链接已复制，仅包含个人作品'); }
  catch {
    const input = document.createElement('textarea'); input.value = link; input.readOnly = true; input.className = 'clipboard-fallback';
    document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove();
    if (!copied) { changeBrowse({ scope: 'personal', view: 'interview', category: 'all', q: '', tag: '' }); notify('复制未成功，请复制当前地址栏链接'); }
    else notify('面试展示链接已复制，仅包含个人作品');
  }
});
$('#tag-filter').addEventListener('change', (event) => { changeBrowse({ tag: event.target.value }); });
$('#chat-stop').addEventListener('click', () => chatController?.abort());
$('#chat-new').addEventListener('click', newChat);
$('#chat-dialog').addEventListener('close', () => chatController?.abort());
$('#chat-messages').addEventListener('click', (event) => { if (event.target.closest('[data-chat-retry]') && lastChatAttempt) ask(lastChatAttempt.question, true); });
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); ask($('#chat-input').value); });
$('#chat-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#chat-input').addEventListener('input', (event) => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(100, event.target.scrollHeight)}px`; });
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if ($('#chat-dialog').open) $('#chat-dialog').close(); else showDialog('chat-dialog'); } });
async function loadAgentStatus() {
  $('#copy-mcp').disabled = true;
  try {
    agentManifest = await getJson('/api/agent', { signal: AbortSignal.timeout(10000) });
    $('#agent-endpoint').textContent = agentManifest.mcp.url;
    $('#agent-state').textContent = agentManifest.notice;
    $('#copy-mcp').disabled = false;
  } catch {
    agentManifest = null;
    $('#agent-endpoint').textContent = '连接地址暂时无法读取，请稍后重新打开。';
  }
}

async function copyAgentText(text, success) {
  try { await navigator.clipboard.writeText(text); notify(success); }
  catch {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    $('#agent-dialog').append(area); area.select();
    const copied = document.execCommand('copy'); area.remove();
    notify(copied ? success : '复制未成功，请使用上方公开资料地址');
  }
}
$('#copy-mcp').addEventListener('click', () => {
  if (agentManifest) copyAgentText(agentManifest.mcp.url, 'MCP 地址已复制');
});
$('#copy-agent').addEventListener('click', async () => {
  if (!agentManifest) await loadAgentStatus();
  if (!agentManifest) { notify('接入信息暂时无法读取，请稍后重试'); return; }
  const base = agentManifest.website;
  const instruction = `请了解 ${site.name}：若已配置 MCP，使用 ${agentManifest.mcp.url} 的 get_profile、search_projects、get_project 和 list_capabilities；否则读取 ${base}/llms.txt、${base}/api/profile 和 ${base}/api/projects，按我的问题查找相关案例并读取详情。保留作品链接、参考标记、来源和个人贡献，不编造经历。当前仅支持公开只读查询，不能执行创作工作流。Skill：${agentManifest.skill.url}`;
  copyAgentText(instruction, '探索指令已复制，粘贴给你的 Agent 即可');
});
window.addEventListener('hashchange', routeProject);
window.addEventListener('popstate', () => { browse = readBrowseState(location.href); renderProjects(); routeProject(); });
window.addEventListener('resize', () => $$('[data-creative-canvas]').forEach(drawCreativeStudy), { passive: true });

async function refreshContent(initial = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const result = await getJson(`/api/projects?size=100&page=${page}`, { signal: AbortSignal.timeout(15000) });
      items.push(...result.items);
      if (items.length >= result.total) break;
      if (page === 100) throw new Error('作品数量超过当前读取范围');
    }
    if (initial || JSON.stringify(projects) !== JSON.stringify(items)) {
      projects = items;
      renderProjects();
    }
    const owned = projects.filter((p) => p.demo === false).length;
    $('#content-notice').textContent = owned ? `${owned} 件个人项目已收录。${site.collectionNotice}` : '部分内容为测试或参考案例，来源与作者贡献见作品详情。';
    if (initial) { routeProject(); document.documentElement.dataset.ready = 'true'; }
  } catch (error) {
    projects = []; renderProjects(); $('#empty-state').hidden = true;
    $('#project-grid').innerHTML = `<div class="art-loading" role="alert"><p>${escapeHtml(error.message)}</p><button class="text-button" data-retry-content>重新加载 ↗</button></div>`;
    if (initial) routeProject();
  } finally { refreshing = false; }
  try {
    const profile = await getJson('/api/profile', { signal: AbortSignal.timeout(15000) });
    $('#profile-name').textContent = profile.name;
    $('#profile-description').textContent = profile.description;
    $('#profile-biography').textContent = profile.biography || profile.contentNotice;
    renderPersonalProfile(site, profile);
    const skills = Array.isArray(profile.skills) ? profile.skills.slice(0, 12) : [];
    const markup = skills.map((skill) => `<article class="skill-card"><h3>${escapeHtml(skill.title)}</h3><p>${escapeHtml(skill.summary)}</p><div class="project-tags">${(skill.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="skill-projects">${(skill.projectIds || []).filter((id) => projects.some((p) => p.id === id)).map((id) => `<button class="text-button" data-project="${escapeHtml(id)}">查看相关项目 ↗</button>`).join('')}</div></article>`).join('');
    if ($('#skills-grid').innerHTML !== markup) $('#skills-grid').innerHTML = markup;
    $('#skills-section').hidden = skills.length === 0;
  } catch {
    $('#skills-section').hidden = true;
    $('#skills-grid').replaceChildren();
    $('#profile-description').textContent = '个人介绍暂时无法读取';
    $('#profile-biography').textContent = '请稍后重试。';
  }
}

mountPersonalHome(site);
startHeroSculpture();
newChat();
refreshContent(true);
setInterval(() => { if (!document.hidden && !$('#project-dialog').open) refreshContent(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshContent(); });
