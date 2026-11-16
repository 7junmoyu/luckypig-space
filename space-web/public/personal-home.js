const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A personal introduction layout for ZYT; the original site's sculpture layout
// remains available. Mount before canvas/event initialization to preserve controls.
export function mountPersonalHome(site) {
  if (site.id !== 'zyt') return;
  document.body.classList.add('site-zyt');
  document.title = `${site.owner}的个人博客 · ${site.name}`;
  const hero = document.querySelector('.hero');
  hero.classList.add('personal-hero');
  hero.innerHTML = `
    <div class="hero-copy personal-copy">
      <div class="eyebrow"><span class="live-dot"></span> <span id="profile-name">${escape(site.owner)}</span>的个人博客 <span class="eyebrow-line"></span> ZYT SPACE</div>
      <p class="personal-greeting">前端、鸿蒙和个人项目</p>
      <h1 id="hero-title">你好，欢迎来逛逛<span class="personal-name-mark">。</span></h1>
      <p class="personal-role">主要做 Vue 前端，也写 Python 接口。</p>
      <p class="personal-intro" id="personal-intro">这里整理了我做过的项目，主要是前端和鸿蒙应用。Python 后端、接口联调和 Linux 部署的实践，也会陆续补充在这里。</p>
      <div class="personal-actions"><a class="button button-primary" href="#about">关于我 <span aria-hidden="true">↓</span></a><a class="button button-quiet" href="#projects">看看项目 <span aria-hidden="true">↗</span></a></div>
      <div class="personal-topics"><span>Vue & Web</span><span>Python & API</span><span>HarmonyOS</span><span>Vibe Coding</span></div>
      <button type="button" class="personal-chat-link" data-open-chat>✳ 想了解技术栈或项目？可以问这里的 AI。 <span aria-hidden="true">↗</span></button>
    </div>
    <div class="hero-art personal-portrait-stage" data-hero-display="portrait" role="group" aria-label="张雨彤的照片与交互图形">
      <div class="hero-view-controls" role="group" aria-label="照片与交互图形轮播"><button type="button" data-hero-view="portrait" aria-pressed="true">照片</button><button type="button" data-hero-view="knot" aria-pressed="false">灵感纽结</button><button type="button" id="shape-toggle" data-hero-view="sphere" aria-pressed="false">连接球体</button><button type="button" data-hero-autoplay aria-label="暂停自动轮播" title="暂停自动轮播">暂停</button></div>
      <div class="art-grid" aria-hidden="true"></div><canvas id="hero-canvas" aria-hidden="true"></canvas>
      <div class="portrait-orbit orbit-outer" aria-hidden="true"></div><div class="portrait-orbit orbit-inner" aria-hidden="true"></div>
      <span class="portrait-label" aria-hidden="true">A LITTLE ABOUT ME</span>
      <figure class="personal-portrait"><img src="/assets/zyt/portrait.jpg" alt="张雨彤的个人证件照" width="840" height="1276" fetchpriority="high" decoding="async"><figcaption><div><strong>${escape(site.owner)}</strong><span>YUTONG ZHANG</span></div><span class="portrait-flower" aria-hidden="true">✳</span></figcaption></figure>
      <div class="portrait-note"><span class="portrait-note-icon" aria-hidden="true">↗</span><div>前端开发 · 个人项目<small>VUE · PYTHON · LINUX</small></div></div>
      <div class="art-coordinates" aria-hidden="true">X <span id="coord-x">0.000</span><br>Y <span id="coord-y">0.000</span></div>
      <p class="hero-scene-caption" data-hero-caption aria-live="polite" hidden></p>
    </div>`;

  const about = document.querySelector('#about');
  about.className = 'personal-about section-shell';
  about.innerHTML = `
    <div class="personal-about-heading"><p class="section-kicker">01 / ME, IN A FEW WORDS</p><h2 id="about-title">关于我<span class="small-dot">.</span></h2><p>我用过的技术、做过的项目，还有一些部署实践。</p></div>
    <div class="personal-about-grid"><div class="personal-story"><p id="profile-description" class="personal-story-lead"></p><p id="profile-biography" class="personal-story-body"></p><button class="text-button" data-question="请介绍张雨彤的教育背景、技能，以及她的项目开发与部署实践。">问问 AI 助手 <span aria-hidden="true">↗</span></button></div>
      <aside class="personal-facts" aria-label="教育背景与个人积累"><div class="personal-education"><p class="fact-label">EDUCATION / 教育背景</p><h3 id="personal-school"></h3><p id="personal-degree"></p><span id="personal-study-period"></span></div><div class="personal-honors"><p class="fact-label">HONORS / 在校荣誉</p><ul id="personal-honors"></ul></div></aside>
    </div>
    <div class="personal-practice"><article><span>01 / INTERFACE</span><h3>前端开发</h3><p>用 Vue 写页面，封装组件，处理状态管理、接口对接和权限相关交互。</p></article><article><span>02 / CONNECTION</span><h3>接口联调</h3><p>个人项目里会用 Python 写后端，对接前端页面，也用 AI 辅助开发。</p></article><article><span>03 / DEPLOYMENT</span><h3>服务部署</h3><p>在 Linux 上打包、部署服务，用 Docker Compose 组织容器，处理运行中的问题。</p></article></div>`;
  hero.after(about);
  document.querySelector('.desktop-nav').innerHTML = '<a href="#about" class="active">关于我</a><a href="#projects">我的作品</a><a href="#skills-section">技能与实践</a><button data-open-agent>连接 Agent ↗</button>';
  document.querySelector('.site-footer>span').textContent = `${site.owner}的个人博客 · 项目与实践记录`;
  document.querySelector('.section-intro').innerHTML = '项目的功能和技术栈都写在详情里。<br>封面处可以左右滑动查看录屏。';
  document.querySelector('#skills-section .section-kicker').textContent = '03 / WHAT I WORK WITH';
  document.querySelector('.projects-section .section-kicker').textContent = '02 / MY PROJECTS';
  document.querySelector('.connection-label .section-kicker').textContent = '04 / BEYOND THE BROWSER';
  document.querySelector('#connect-title').innerHTML = '也可以用你的 Agent<br><span>来了解我。</span>';
  document.querySelector('.connection-content > p').textContent = '把本站公开资料接入你自己的 Agent，查询我的技术栈、教育背景和项目说明。';
  document.querySelector('.connection-content > button').innerHTML = '查看接入方法 <span aria-hidden="true">↗</span>';
  const skills = document.querySelector('#skills-section');
  document.querySelector('#projects').after(skills);
}

export function renderPersonalProfile(site, profile) {
  if (site.id !== 'zyt') return;
  const education = profile.education || {};
  document.querySelector('#personal-intro').textContent = profile.introduction || profile.description;
  document.querySelector('#personal-school').textContent = education.school || '';
  document.querySelector('#personal-degree').textContent = [education.major, education.degree].filter(Boolean).join(' · ');
  document.querySelector('#personal-study-period').textContent = education.period || '';
  document.querySelector('#personal-honors').innerHTML = (profile.honors || []).map(({ title, detail }) => `<li><span aria-hidden="true">✳</span><div><strong>${escape(title)}</strong><p>${escape(detail)}</p></div></li>`).join('');
}
