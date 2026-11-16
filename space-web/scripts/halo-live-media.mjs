// Run through ego-browser nodejs after local Halo initialization.
const task = await taskSpace('luckypig-halo-live');
const front = task.page('p2');
const { readFile, writeFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const base = new URL('../', import.meta.url);
const state = JSON.parse(await readFile(new URL('artifacts/integration-state.json', base), 'utf8'));
await front.goto(`http://127.0.0.1:4173/#project/${state.postId}`);
await front.reload();
await front.waitForFunction(() => document.querySelector('.rich-content video')?.readyState >= 2, undefined, { timeout: 15000 });
const range = await front.evaluate(async () => {
  const response = await fetch('/media/halo/upload/clip.mp4', { headers: { Range: 'bytes=0-63' } });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, range: response.headers.get('content-range'), length: bytes.length, signature: String.fromCharCode(...bytes.slice(4, 8)) };
});
if (range.status !== 206 || range.length !== 64 || range.signature !== 'ftyp') throw new Error(`Video Range check failed: ${JSON.stringify(range)}`);
const hashes = {};
for (const file of ['cover.png', 'clip.mp4', 'notes.txt']) {
  const path = `/private/tmp/luckypig-halo-${file}`;
  const response = await front.fetch(`/media/halo/upload/${file}`, { saveAs: path });
  if (response.status !== 200) throw new Error(`Attachment ${file}: ${response.status}`);
  const bytes = await readFile(path);
  const original = await readFile(new URL(`fixtures/upload-samples/${file}`, base));
  if (!bytes.equals(original)) throw new Error(`${file} differs after Halo upload and website proxy`);
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
}
await front.evaluate(() => { const video = document.querySelector('.rich-content video'); video.currentTime = 1.4; video.muted = true; });
await front.waitForFunction(() => !document.querySelector('.rich-content video').seeking, undefined, { timeout: 5000 });
await front.evaluate(async () => document.querySelector('.rich-content video').play());
await front.waitForFunction(() => document.querySelector('.rich-content video').currentTime > 1.7, undefined, { timeout: 5000 });
await front.evaluate(() => document.querySelector('.rich-content video').pause());
await front.click('loc=css:.rich-content .image-preview-button');
await front.waitForFunction(() => document.querySelector('#image-dialog').open && document.querySelector('#image-preview').naturalWidth > 0, undefined, { timeout: 5000 });
await front.keyboard.press('Escape');
const downloadPromise = front.waitForEvent('download', { timeout: 45000 });
await front.click('loc=css:.rich-content a[download]');
const download = await downloadPromise;
await download.saveAs('/private/tmp/luckypig-halo-native-document.txt');
if (!(await readFile('/private/tmp/luckypig-halo-native-document.txt')).equals(await readFile(new URL('fixtures/upload-samples/notes.txt', base)))) throw new Error('Native download does not match uploaded file');
await writeFile(new URL('artifacts/halo-media-baseline.json', base), JSON.stringify({ postId: state.postId, hashes, range }, null, 2), { mode: 0o600 });
console.log({ realHaloUploadProxyHashes: 'passed', nativeVideoSeekPlayPause: 'passed', imageZoom: 'passed', nativeDocumentDownload: 'passed', videoRange: range });
