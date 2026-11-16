import test from 'node:test';
import assert from 'node:assert/strict';
import { restoredContentMatches } from '../scripts/verify-publication.mjs';

test('restoration compares editor/release sources and public text despite Halo HTML rendering', () => {
  const source = { raw: '<h2>演示</h2>', content: '<h2>演示</h2>', rawType: 'HTML' };
  const original = { id: 'test', description: '演示', content: { html: '<h2 id="demo">演示</h2>' } };
  const rendered = { ...original, content: { html: '<h2 id="demo" class="heading">演示</h2>' } };
  assert.equal(restoredContentMatches(source, source, rendered, source, original), true);
  assert.equal(restoredContentMatches(source, { ...source, raw: 'changed' }, rendered, source, original), false);
  assert.equal(restoredContentMatches(source, source, { ...rendered, description: '未恢复' }, source, original), false);
});
