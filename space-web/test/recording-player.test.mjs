import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterTime, timeLabel } from '../public/recording-player.js';
import { contentUrl } from '../public/rich-content.js';
import { recordingHtml } from '../scripts/import-recordings.mjs';

test('chapter navigation preserves Halo media fragments and only seeks the matching video', () => {
  const source = '/media/halo/upload/demo.mp4', base = 'http://127.0.0.1:4173';
  assert.equal(contentUrl('/upload/demo.mp4#t=40', 'http://127.0.0.1:8090'), `${source}#t=40`);
  assert.equal(chapterTime(`${source}#t=40`, source, base), 40);
  assert.equal(chapterTime(`${source}#t=1.5`, source, base), 1.5);
  for (const href of [`${source}#t=-1`, `${source}#t=NaN`, `${source}#t=999999`, '/media/halo/upload/other.mp4#t=40', `https://other.example${source}#t=40`, `${source}?private=1#t=40`, `${source}#heading`]) assert.equal(chapterTime(href, source, base), null);
  assert.equal(timeLabel(174.43), '02:54');
  assert.equal(timeLabel(NaN), '--:--');
});

test('recording drafts include visible steps, chapters and limits, and escape authored markup', () => {
  const project = { intro: '<script>bad()</script>', workflow: [{ title: '步骤', body: '<img onerror=bad()>' }], chapters: [{ seconds: 12, label: '查看结果' }], boundary: '职责待补充' };
  const html = recordingHtml(project, '/upload/demo.mp4', '/upload/poster.jpg');
  assert.match(html, /<video controls playsinline/);
  assert.match(html, /demo.mp4#t=12/);
  assert.match(html, /职责待补充/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
});
