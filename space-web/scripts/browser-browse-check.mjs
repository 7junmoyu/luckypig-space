const task = await taskSpace('luckypig-halo-integration');
const page = task.page('p1');
await page.goto('http://127.0.0.1:4173/?category=devops&tag=Kubernetes#projects');
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', undefined, { timeout: 10000 });
if (await page.evaluate(() => document.querySelectorAll('.project-card').length) !== 1) throw new Error('Shared category/tag URL was not applied');
console.log(await page.snapshot());
