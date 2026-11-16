const task = await taskSpace('luckypig-functional-mvp');
const page = task.page('p1');
console.log(await page.evaluate(async () => {
  const { renderRichContent } = await import('/rich-content.js');
  const container = document.createElement('div');
  container.append(renderRichContent('<h2>作品正文</h2><p>内容<strong>保留</strong></p><script>window.BAD=true</script><svg onload="bad()"></svg><img src="/upload/a.png" onerror="bad()"><a href="javascript:alert(1)">危险链接</a><video autoplay onplay="bad()"><source src="/upload/clip.mp4" type="video/mp4"></video><a href="https://example.com/demo">外部演示</a>', 'http://127.0.0.1:8090'));
  if (container.querySelector('script,svg,iframe,[onload],[onerror],[onplay],[autoplay]')) throw new Error('Unsafe content survived');
  if (container.querySelector('a').hasAttribute('href')) throw new Error('Active link survived');
  if (container.querySelector('img').getAttribute('src') !== '/media/halo/upload/a.png') throw new Error('Image URL mismatch');
  if (container.querySelector('source').getAttribute('src') !== '/media/halo/upload/clip.mp4') throw new Error('Video URL mismatch');
  if (!container.querySelector('video').controls || !container.querySelector('strong')) throw new Error('Content lost');
  return { richContentSanitization: 'passed' };
}));
const status = await page.fetch('/api/status');
const profile = await page.fetch('/api/profile');
const projects = await page.fetch('/api/projects?category=devops');
const missing = await page.fetch('/api/projects/does-not-exist');
if (![status, profile, projects].every((r) => r.status === 200) || missing.status !== 404) throw new Error('HTTP smoke failed');
console.log({ actualHttpEndpoints: 'passed', missingProjectStatus: missing.status });
