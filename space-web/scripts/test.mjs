import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertRuntime } from '../src/runtime.mjs';

try {
  assertRuntime();
  const directory = fileURLToPath(new URL('../test/', import.meta.url));
  const tests = (await readdir(directory)).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => directory + name);
  if (!tests.length) throw new Error('没有找到行为测试，未标记通过');
  const child = spawn(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
  const code = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept); });
  process.exitCode = code ?? 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
