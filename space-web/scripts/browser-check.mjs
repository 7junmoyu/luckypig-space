// Run with ego-browser nodejs -e 'await import("file:///absolute/path/to/this/file")'
// This browser check uses the explicit demo server already listening on 4173.
const task = await taskSpace('luckypig-functional-mvp');
const page = task.page('p1');
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.goto('http://127.0.0.1:4173/#projects');
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 10000 });
await page.click("loc=css:button[data-filter='devops']");
if (await page.evaluate(() => document.querySelectorAll('#project-grid .project-card').length) !== 2) throw new Error('DevOps filter expected two projects');
await page.fill('#project-search', 'missing-test-word');
if (!await page.evaluate(() => !document.querySelector('#empty-state').hidden)) throw new Error('Empty state missing');
await page.fill('#project-search', '');
await page.click("loc=css:button[data-filter='all']");
await page.click("loc=css:button[aria-label='查看作品：让知识，拥有自己的接口']");
await page.waitForFunction(() => document.querySelector('#project-detail h2')?.textContent === '让知识，拥有自己的接口', undefined, { timeout: 10000 });
await page.reload();
await page.waitForFunction(() => document.querySelector('#project-detail h2')?.textContent === '让知识，拥有自己的接口', undefined, { timeout: 10000 });
console.log({ filterSearchDetailRefresh: 'passed', url: await page.url() });
console.log(await page.snapshot());
