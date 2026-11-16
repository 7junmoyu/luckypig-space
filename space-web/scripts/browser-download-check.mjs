const task = await taskSpace('luckypig-halo-integration');
const page = task.page('p1');
const event = page.waitForEvent('download', { timeout: 10000 }).then((download) => ({ download }), (error) => ({ eventError: error.message }));
await page.click('loc=css:a[download="notes.md"]');
const outcome = await event;
if (outcome.download) {
  await outcome.download.saveAs('/private/tmp/luckypig-native-download.md');
  console.log({ nativeDownload: 'passed' });
} else console.log({ nativeDownload: 'unverified', reason: outcome.eventError });
const result = await page.fetch('/demo-media/notes.md', { saveAs: '/private/tmp/luckypig-http-download.md' });
const { readFile } = await import('node:fs/promises');
const expected = await readFile(new URL('../fixtures/upload-samples/notes.md', import.meta.url), 'utf8');
if (result.status !== 200 || await readFile('/private/tmp/luckypig-http-download.md', 'utf8') !== expected) throw new Error('Document HTTP bytes do not match');
console.log({ browserHttpDocumentRead: 'passed' });
await page.click('loc=css:button[data-copy-project="comfy-workflow"]');
await page.waitForFunction(() => document.querySelector('#toast').textContent === '作品链接已复制', undefined, { timeout: 3000 });
console.log({ shareLinkCopy: 'passed' });
