import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, chmod, writeFile, readFile, stat, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'space-handoff-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, 'packet'); await mkdir(folder); await mkdir(join(folder, 'deploy'));
  const files = ['deploy.sh', 'export-image.sh', 'deploy/.env.example'];
  for (const script of files.slice(0, 2)) {
    await copyFile(new URL(`../../deploy/release/handoff/${script}`, import.meta.url), join(folder, script));
    await chmod(join(folder, script), 0o755);
  }
  await writeFile(join(folder, 'deploy/.env.example'), 'POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_PASSWORD\n');
  let sums = '';
  for (const file of files) sums += `${createHash('sha256').update(await readFile(join(folder, file))).digest('hex')}  ${file}\n`;
  await writeFile(join(folder, 'SHA256SUMS'), sums);
  const bin = join(root, 'bin'); await mkdir(bin);
  await writeFile(join(bin, 'docker'), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$1 $2" in
  'image inspect')
    [ -f "$FAKE_BUILT" ] || exit 1
    case "$*" in *Architecture*) printf 'linux/amd64\\n' ;; *) printf '%s\\n' "\${FAKE_IMAGE_ID:-sha256:76d28ae6ceaf0d8b8e2a1c4b614957755ed7a0eada31a25712089b2cb23e9655}" ;; esac ;;
  'image save') printf 'CONTROLLED_FAKE_IMAGE_NOT_DOCKER' > "$4" ;;
  'build --platform') touch "$FAKE_BUILT" ;;
esac
`);
  await chmod(join(bin, 'docker'), 0o755);
  await writeFile(join(bin, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux ;; -m) echo x86_64 ;; esac\n'); await chmod(join(bin, 'uname'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: join(root, 'calls.log'), FAKE_BUILT: join(root, 'built') };
  const run = (script, args = [], extra = {}) => spawnSync('/bin/sh', [script, ...args], { cwd: folder, env: { ...env, ...extra }, encoding: 'utf8' });
  return { root, folder, env, run };
}

test('handoff init creates private configuration once, without starting Docker, and verify detects tampering', async (t) => {
  const { folder, run, env } = await fixture(t);
  assert.equal(run('./deploy.sh', ['verify']).status, 0);
  const initialized = run('./deploy.sh', ['init']); assert.equal(initialized.status, 0);
  const privateFile = await readFile(join(folder, 'deploy/.env'), 'utf8');
  assert.match(privateFile, /^POSTGRES_PASSWORD=[a-f0-9]{48}\n$/);
  assert.equal((await stat(join(folder, 'deploy/.env'))).mode & 0o777, 0o600);
  assert.ok(!initialized.stdout.includes(privateFile.trim().split('=')[1]));
  assert.notEqual(run('./deploy.sh', ['init']).status, 0);
  assert.equal(await readFile(join(folder, 'deploy/.env'), 'utf8'), privateFile);
  await assert.rejects(stat(env.FAKE_LOG), (e) => e.code === 'ENOENT');
  await writeFile(join(folder, 'deploy/.env.example'), 'changed');
  assert.notEqual(run('./deploy.sh', ['verify']).status, 0);
});

test('handoff export reuses exact image, excludes private/unlisted files, and produces portable checksum', async (t) => {
  const { folder, run, env } = await fixture(t);
  assert.equal(run('./deploy.sh', ['init']).status, 0);
  await writeFile(env.FAKE_BUILT, '');
  assert.notEqual(run('./export-image.sh', [], { FAKE_IMAGE_ID: 'sha256:wrong' }).status, 0);
  await writeFile(join(folder, 'unlisted-private.txt'), 'MUST_NOT_SHIP');
  const exported = run('./export-image.sh'); assert.equal(exported.status, 0, exported.stderr);
  const archive = `${folder}-with-image.tar.gz`;
  const listed = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' }); assert.equal(listed.status, 0);
  assert.ok(!listed.stdout.includes('/deploy/.env\n')); assert.ok(!listed.stdout.includes('unlisted-private.txt'));
  assert.ok(listed.stdout.includes('/images/web-amd64.tar'));
  const checksum = await readFile(`${archive}.sha256`, 'utf8');
  assert.equal(checksum.trim().slice(66), basename(archive));
  const log = await readFile(env.FAKE_LOG, 'utf8'); assert.ok(!log.includes('build ')); assert.ok(!log.includes('compose '));
  assert.notEqual(run('./export-image.sh').status, 0);
});

test('handoff up builds only when missing, verifies architecture and starts only the separate Compose project', async (t) => {
  const { run, env } = await fixture(t);
  assert.equal(run('./deploy.sh', ['init']).status, 0);
  const result = run('./deploy.sh', ['up']); assert.equal(result.status, 0, result.stderr);
  const log = await readFile(env.FAKE_LOG, 'utf8');
  assert.match(log, /build --platform linux\/amd64/);
  assert.match(log, /compose --env-file deploy\/\.env -f deploy\/compose.yaml config --quiet/);
  assert.match(log, /pull halodb halo/); assert.match(log, /up -d --pull never/);
  assert.ok(!log.includes('down')); assert.ok(!log.includes('POSTGRES_PASSWORD'));
});
