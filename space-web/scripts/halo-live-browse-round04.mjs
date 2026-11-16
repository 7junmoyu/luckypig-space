const task = await taskSpace('luckypig-halo-live');
const page = task.page('p2');
await page.goto('http://127.0.0.1:4173/#projects');
await page.waitForFunction(async () => { try { return (await fetch('/api/health')).ok; } catch { return false; } }, undefined, { timeout: 60000 });
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 15000 });
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const first = await page.evaluate(() => ({ cards: document.querySelectorAll('.project-card').length, page: document.querySelector('#page-indicator').textContent }));
if (first.cards !== 4 || first.page !== '第 1 / 2 页') throw new Error('Real Halo first page incorrect');
console.log({step:'first-page-ready'});
await page.click('#next-page');
if (await page.evaluate(() => document.querySelectorAll('.project-card').length) !== 1) throw new Error('Real Halo second page incorrect');
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 15000 });
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (await page.evaluate(() => document.querySelector('#page-indicator').textContent) !== '第 2 / 2 页') throw new Error('Pagination URL did not survive reload');
await page.click('#previous-page');
await page.selectOption('#tag-filter', 'RAG');
if (await page.evaluate(() => document.querySelectorAll('.project-card').length) !== 1) throw new Error('Real Halo tag query incorrect');
await page.click('#clear-filters');
await page.fill('#project-search', '多媒体发布');
if (await page.evaluate(() => document.querySelectorAll('.project-card').length) !== 1) throw new Error('Real Halo search incorrect');
console.log({ realHaloPaginationReloadTagSearch: 'passed' });

// Native CDP touch events keep the emulated mobile viewport during interaction.
// High-level Ego pointer actions may restore the desktop viewport.
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
async function tap(selector) {
  const point = await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing mobile target ${selector}`);
    element.scrollIntoView({ behavior: 'instant', block: 'center' });
    const r = element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, viewport: innerWidth };
  }, selector);
  if (point.viewport !== 390) throw new Error('Mobile viewport was reset');
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
await tap('#clear-filters');
await tap('button[data-filter="ai"]');
await page.waitForFunction(() => document.querySelectorAll('.project-card').length === 2, undefined, { timeout: 5000 });
await tap('button[data-project="01a1aae5-487b-709e-8d7d-760365d6ca9f"]');
await page.waitForFunction(() => !!document.querySelector('.rich-content video'), undefined, { timeout: 10000 });
await tap('#project-dialog button[data-close="project-dialog"]');
await tap('.mobile-nav button[data-open-chat]');
await page.waitForFunction(() => document.querySelector('#chat-dialog').open, undefined, { timeout: 5000 });
await tap('#chat-suggestions button[data-question]');
await page.waitForFunction(() => document.querySelectorAll('#chat-messages .assistant').length >= 2, undefined, { timeout: 15000 });
await tap('#chat-dialog button[data-close="chat-dialog"]');
const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
if (width.viewport !== 390 || width.content > 390) throw new Error('Mobile overflow');
console.log({ mobileNativeTouchFilterDetailChat: 'passed', width });
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await page.cdp('Emulation.clearDeviceMetricsOverride');
