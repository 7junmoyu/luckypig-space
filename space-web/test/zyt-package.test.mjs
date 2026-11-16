import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { packageZyt } from '../scripts/package-zyt.mjs';
import { verifyRelease } from '../scripts/release.mjs';

test('portable ZYT archive contains current profile, portrait, standalone deployment and hashes, without private runtime data', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'zyt-packet-')); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await packageZyt({ destination: join(root, 'zyt-space') });
  assert.equal(result.imageIncluded, false); assert.equal(result.privateSettingsIncluded, false);
  const digest = createHash('sha256').update(await readFile(result.archive)).digest('hex');
  assert.equal(digest, result.sha256); assert.equal(await readFile(result.checksum, 'utf8'), `${digest}  zyt-space.tar.gz\n`);
  const listed = execFileSync('tar', ['-tzf', result.archive], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  for (const name of ['app/public/personal-home.js', 'app/public/assets/zyt/portrait.jpg', 'app/sites/zyt/profile.json', 'deploy/compose.zyt.yaml', 'deploy/README-ZYT.md', 'deploy/zyt.sh', 'deploy/SHA256SUMS', 'release.json']) assert.ok(listed.includes(name), name);
  assert.equal((await stat(join(result.directory, 'deploy/zyt.sh'))).mode & 0o777, 0o755);
  assert.doesNotMatch(listed, /(?:^|\/)(?:node_modules|\.local|\.env\.zyt|owner-token|model-settings\.json|artifacts)(?:\/|$)/m);
  const env = await readFile(join(result.directory, 'deploy/zyt-standalone.env.example'), 'utf8');
  assert.ok(env.includes(`SPACE_IMAGE=${result.image}`)); assert.match(env, /TARGET_PLATFORM=linux\/amd64/);
  const profile = JSON.parse(await readFile(join(result.directory, 'app/sites/zyt/profile.json'), 'utf8'));
  assert.equal(profile.name, '张雨彤');
  assert.deepEqual(profile, JSON.parse(await readFile(new URL('../sites/zyt/profile.json', import.meta.url), 'utf8')));
  const manifest = await verifyRelease(result.directory);
  assert.ok(manifest.files.some((f) => f.path === 'deploy/compose.zyt.yaml'));
  await assert.rejects(packageZyt({ destination: result.directory }), (e) => e.code === 'EEXIST');
  await assert.rejects(packageZyt({ destination: join(root, 'bad'), platform: 'linux/unknown' }), /目标平台/);
  // The source snapshot verifies every deployed file, including its Compose recipe.
  await writeFile(join(result.directory, 'deploy/compose.zyt.yaml'), 'tampered');
  await assert.rejects(verifyRelease(result.directory), /哈希不一致/);
  await assert.rejects(access(join(root, 'bad.tar.gz')));
});

test('ARM packaging selects an ARM runtime target without executing Docker', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'zyt-arm-packet-')); t.after(() => rm(root, { recursive: true, force: true }));
  const result = await packageZyt({ destination: join(root, 'packet'), platform: 'linux/arm64' });
  const env = await readFile(join(result.directory, 'deploy/zyt-standalone.env.example'), 'utf8');
  assert.match(env, /TARGET_PLATFORM=linux\/arm64/); assert.match(result.image, /-arm64-/);
  assert.equal((await verifyRelease(result.directory)).platform, 'linux/arm64');
});
