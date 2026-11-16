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
      <p class="personal-greeting">一些作品，一些还在继续的尝试。</p>
      <h1 id="hero-title">欢迎来坐坐<span class="personal-name-mark">。</span></h1>
      <p class="personal-role">写 Vue 前端，也把接口和部署一起跑通。</p>
      <p class="personal-intro" id="personal-intro">这里放着我做过的一些项目，也记着把想法慢慢做出来的过程。随便逛逛，有感兴趣的，我们可以接着聊。</p>
      <div class="personal-actions"><a class="button button-primary" href="#about">多了解一点 <span aria-hidden="true">↓</span></a><a class="button button-quiet" href="#projects">逛逛作品 <span aria-hidden="true">↗</span></a></div>
      <div class="personal-topics"><span>Vue & Web</span><span>Python & API</span><span>HarmonyOS</span><span>Vibe Coding</span></div>
      <button type="button" class="personal-chat-link" data-open-chat>✳ 想找点什么？也可以问问这里的 AI。 <span aria-hidden="true">↗</span></button>
    </div>
    <div class="hero-art personal-portrait-stage" data-hero-display="portrait" role="group" aria-label="张雨彤的照片与交互图形">
      <div class="hero-view-controls" role="group" aria-label="照片与交互图形轮播"><button type="button" data-hero-view="portrait" aria-pressed="true">照片</button><button type="button" data-hero-view="knot" aria-pressed="false">灵感纽结</button><button type="button" id="shape-toggle" data-hero-view="sphere" aria-pressed="false">连接球体</button><button type="button" data-hero-autoplay aria-label="暂停自动轮播" title="暂停自动轮播">暂停</button></div>
      <div class="art-grid" aria-hidden="true"></div><canvas id="hero-canvas" aria-hidden="true"></canvas>
      <div class="portrait-orbit orbit-outer" aria-hidden="true"></div><div class="portrait-orbit orbit-inner" aria-hidden="true"></div>
      <span class="portrait-label" aria-hidden="true">A LITTLE ABOUT ME</span>
      <figure class="personal-portrait"><img src="/assets/zyt/portrait.jpg" alt="张雨彤的个人证件照" width="840" height="1276" fetchpriority="high" decoding="async"><figcaption><div><strong>${escape(site.owner)}</strong><span>YUTONG ZHANG</span></div><span class="portrait-flower" aria-hidden="true">✳</span></figcaption></figure>
      <div class="portrait-note"><span class="portrait-note-icon" aria-hidden="true">↗</span><div>一点点，把想法做出来。<small>IDEAS → CODE → REAL LIFE</small></div></div>
      <div class="art-coordinates" aria-hidden="true">X <span id="coord-x">0.000</span><br>Y <span id="coord-y">0.000</span></div>
      <p class="hero-scene-caption" data-hero-caption aria-live="polite" hidden></p>
    </div>`;

  const about = document.querySelector('#about');
  about.className = 'personal-about section-shell';
  about.innerHTML = `
    <div class="personal-about-heading"><p class="section-kicker">01 / ME, IN A FEW WORDS</p><h2 id="about-title">关于我<span class="small-dot">.</span></h2><p>除了作品，也聊聊我平时在做什么。</p></div>
    <div class="personal-about-grid"><div class="personal-story"><p id="profile-description" class="personal-story-lead"></p><p id="profile-biography" class="personal-story-body"></p><button class="text-button" data-question="请介绍张雨彤的教育背景、技能，以及她的项目开发与部署实践。">让 AI 带你逛逛 <span aria-hidden="true">↗</span></button></div>
      <aside class="personal-facts" aria-label="教育背景与个人积累"><div class="personal-education"><p class="fact-label">EDUCATION / 教育背景</p><h3 id="personal-school"></h3><p id="personal-degree"></p><span id="personal-study-period"></span></div><div class="personal-honors"><p class="fact-label">MILESTONES / 学习与积累</p><ul id="personal-honors"></ul></div></aside>
    </div>
    <div class="personal-practice"><article><span>01 / INTERFACE</span><h3>把页面做好</h3><p>写组件，理清页面里的交互，也把权限和数据流转接起来。</p></article><article><span>02 / CONNECTION</span><h3>让前后端接起来</h3><p>用 Python 写后端、联调接口，也借助 AI 推进个人项目的功能实现。</p></article><article><span>03 / DEPLOYMENT</span><h3>写完，还要跑起来</h3><p>自己部署到 Linux，用 Docker Compose 组织服务，遇到问题就接着排查。</p></article></div>`;
  hero.after(about);
  document.querySelector('.desktop-nav').innerHTML = '<a href="#about" class="active">关于我</a><a href="#projects">我的作品</a><a href="#skills-section">技能与实践</a><button data-open-agent>连接 Agent ↗</button>';
  document.querySelector('.site-footer>span').textContent = `${site.owner}的个人博客 · 一些作品，一些学习中的小收获`;
  document.querySelector('.section-intro').innerHTML = '这些是做过的一些尝试，<br>点开看看它们的样子。';
  document.querySelector('#skills-section .section-kicker').textContent = '03 / WHAT I WORK WITH';
  document.querySelector('.projects-section .section-kicker').textContent = '02 / MY PROJECTS';
  document.querySelector('.connection-label .section-kicker').textContent = '04 / BEYOND THE BROWSER';
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
