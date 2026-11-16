import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertRuntime, runtimeInfo } from '../src/runtime.mjs';

test('unsupported Node versions fail clearly before MCP tests', () => {
  const current = runtimeInfo();
  for (const node of ['v18.20.8', 'v20.19.0', 'unknown']) assert.throws(() => assertRuntime({ ...current, node }), /不满足项目要求 >=22/);
  for (const node of ['v22.0.0', 'v24.4.0']) assert.equal(assertRuntime({ ...current, node }).node, node);
});

test('missing Web Crypto or fetch fails even on a supported Node', () => {
  const current = runtimeInfo();
  assert.throws(() => assertRuntime({ ...current, webCrypto: false }), /缺少 Web Crypto/);
  assert.throws(() => assertRuntime({ ...current, fetch: false }), /缺少 Web Crypto/);
  assert.equal(assertRuntime().node, process.version);
});

test('test entrypoint rejects missing crypto before running any SDK or content operation', () => {
  const path = fileURLToPath(new URL('../scripts/test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `delete globalThis.crypto; await import(${JSON.stringify(path)})`], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少 Web Crypto/);
  assert.ok(!result.stdout.includes('TAP version'));
  assert.ok(!result.stderr.includes('Parse error'));
});
