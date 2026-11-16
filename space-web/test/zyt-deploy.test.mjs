import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { packageZyt } from '../scripts/package-zyt.mjs';
const exec = promisify(execFile);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zyt-deploy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packet = await packageZyt({ destination: join(root, 'packet') });
  const bin = join(root, 'bin'), log = join(root, 'docker.jsonl'); await mkdir(bin);
  await writeFile(join(bin, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'compose' && args[1] === 'version') console.log('2.39.0');
if (args[0] === 'info') console.log(process.env.DOCKER_TEST_ARCH || 'linux/x86_64');
if (args.includes('build') && process.env.DOCKER_TEST_FAIL_BUILD) process.exit(1);
`, { mode: 0o755 });
  const directory = join(packet.directory, 'deploy');
  const run = (args, env = {}) => exec('bash', [join(directory, 'zyt.sh'), ...args], {
    cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOCKER_TEST_LOG: log, ...env },
  });
  return { packet, directory, log, run };
}

test('ZYT one-command deployment prepares public-IP settings and builds before starting, without printing a token', async (t) => {
  const f = await fixture(t);
  const result = await f.run(['start', '--public-url', 'http://192.0.2.10:8084']);
  const config = await readFile(join(f.directory, '.env.zyt'), 'utf8');
  assert.match(config, /^WEB_PORT=8084$/m); assert.match(config, /^WEB_BIND=0.0.0.0$/m);
  assert.match(config, /^PUBLIC_URL=http:\/\/192\.0\.2\.10:8084$/m);
  assert.equal((await stat(join(f.directory, '.env.zyt'))).mode & 0o777, 0o600);
  const calls = (await readFile(f.log, 'utf8')).trim().split('\n').map(JSON.parse);
  const build = calls.findIndex((a) => a.includes('build')), up = calls.findIndex((a) => a.includes('up'));
  assert.ok(build >= 0 && up > build); assert.ok(calls[up].includes('--wait'));
  assert.ok(calls.some((a) => a.includes('--input-type=module')));
  assert.ok(!calls.some((a) => a.includes('scripts/owner-token.mjs')));
  assert.match(result.stdout, /http:\/\/192\.0\.2\.10:8084\/admin/);
  await f.run(['start']); assert.equal(await readFile(join(f.directory, '.env.zyt'), 'utf8'), config);
  await assert.rejects(f.run(['start', '--public-url', 'http://192.0.2.11:8084']));
  assert.equal(await readFile(join(f.directory, '.env.zyt'), 'utf8'), config);
});

test('invalid origins and architecture mismatches are rejected before creating configuration or starting services', async (t) => {
  const f = await fixture(t);
  for (const url of ['http://user:password@192.0.2.10', 'http://192.0.2.10/path', 'http://192.0.2.10?x=1', 'http://192.0.2.10:99999', 'http://192.0.2.10\nX=1']) {
    await assert.rejects(f.run(['start', '--public-url', url]));
  }
  await assert.rejects(access(join(f.directory, '.env.zyt')));
  await assert.rejects(access(f.log));
  await assert.rejects(f.run(['start', '--public-url', 'http://192.0.2.10:4184'], { DOCKER_TEST_ARCH: 'linux/aarch64' }));
  await assert.rejects(access(join(f.directory, '.env.zyt')));
  assert.ok(!(await readFile(f.log, 'utf8')).includes('"build"'));
});

test('a failed build never starts containers; modified packet files fail before calling Docker', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run(['start', '--public-url', 'http://192.0.2.10:4184'], { DOCKER_TEST_FAIL_BUILD: '1' }));
  assert.ok(!(await readFile(f.log, 'utf8')).includes('"up"'));
  await rm(f.log);
  await writeFile(join(f.packet.directory, 'app/server.mjs'), 'tampered');
  await assert.rejects(f.run(['start']));
  await assert.rejects(access(f.log));
});

test('HTTPS proxy setup stays on loopback and conflicting saved architecture blocks a rebuild', async (t) => {
  const f = await fixture(t);
  await f.run(['start', '--public-url', 'https://zyt.test', '--bind', '127.0.0.1', '--port', '4184']);
  const envPath = join(f.directory, '.env.zyt'), saved = await readFile(envPath, 'utf8');
  assert.match(saved, /^WEB_BIND=127\.0\.0\.1$/m);
  assert.match(saved, /^PUBLIC_URL=https:\/\/zyt\.test$/m);
  await writeFile(envPath, saved.replace('TARGET_PLATFORM=linux/amd64', 'TARGET_PLATFORM=linux/arm64'));
  await rm(f.log);
  await assert.rejects(f.run(['start']));
  assert.ok(!(await readFile(f.log, 'utf8')).includes('"build"'));
});
