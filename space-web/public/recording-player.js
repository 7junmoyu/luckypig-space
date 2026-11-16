export function timeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function chapterTime(href, source, base) {
  try {
    const link = new URL(href, base), video = new URL(source, base);
    if (!['http:', 'https:'].includes(link.protocol) || !['http:', 'https:'].includes(video.protocol)) return null;
    if (link.origin !== video.origin || link.pathname !== video.pathname || link.search !== video.search) return null;
    const match = /^#t=(\d+(?:\.\d+)?)$/.exec(link.hash);
    if (!match) return null;
    const seconds = Number(match[1]);
    return seconds <= 86400 ? seconds : null;
  } catch { return null; }
}

export function enhanceRecordingPlayers(root) {
  const videos = [...root.querySelectorAll('video')];
  for (const video of videos) {
    const toolbar = document.createElement('div');
    toolbar.className = 'recording-toolbar';
    const status = document.createElement('span');
    status.className = 'recording-time'; status.textContent = '功能录屏 · 按需加载';
    const update = () => { status.textContent = `${timeLabel(video.currentTime)} / ${timeLabel(video.duration)}`; };
    video.addEventListener('loadedmetadata', update); video.addEventListener('timeupdate', update);
    if (video.readyState >= 1) update();
    const label = document.createElement('label'); label.textContent = '播放速度';
    const speed = document.createElement('select'); speed.setAttribute('aria-label', '录屏播放速度');
    for (const rate of [1, 1.25, 1.5, 2]) {
      const option = document.createElement('option'); option.value = String(rate); option.textContent = `${rate}×`; speed.append(option);
    }
    speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
    label.append(speed);
    const fullscreen = document.createElement('button'); fullscreen.type = 'button'; fullscreen.textContent = '全屏查看 ↗';
    fullscreen.addEventListener('click', () => {
      if (video.requestFullscreen) video.requestFullscreen().catch(() => { status.textContent = '可使用播放器原生全屏按钮'; });
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else status.textContent = '可使用播放器原生全屏按钮';
    });
    toolbar.append(status, label, fullscreen); video.after(toolbar); video.classList.add('recording-video');
    const source = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
    if (!source) continue;
    for (const link of [...root.querySelectorAll('a[href]')]) {
      const at = chapterTime(link.getAttribute('href'), source, location.href);
      if (at === null) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'video-chapter'; button.textContent = link.textContent;
      button.addEventListener('click', () => {
        const seek = () => {
          video.currentTime = Math.min(at, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.1) : at);
          video.play().catch(() => { status.textContent = '已定位，请点击播放器开始播放'; });
        };
        if (video.readyState >= 1) seek(); else { video.addEventListener('loadedmetadata', seek, { once: true }); video.load(); }
        video.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      link.replaceWith(button); button.parentElement.classList.add('video-chapters');
    }
  }
}
