import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup, verifyBackup, rehearseRestore } from '../scripts/backup.mjs';
import { post } from './fixtures.mjs';

const imageId = `sha256:${'a'.repeat(64)}`;
const hashes = 'abc  ./uploads/clip.mp4\ndef  ./settings.yaml';
function engine({ failDump = false, failRestore = false, wrongHashes = false } = {}) {
  const calls = [];
  const run = async (args, options = {}) => {
    calls.push(args);
    if (args.includes('pg_dump') && failDump) throw new Error('dump failed');
    if (args.includes('pg_restore') && failRestore) throw new Error('restore failed');
    if (options.output) { await writeFile(options.output, `binary:${options.output.endsWith('.dump') ? 'database' : 'volume'}`, { mode: 0o600, flag: 'wx' }); return ''; }
    if (options.input) assert.ok((await readFile(options.input)).length);
    if (args[0] === 'inspect') return JSON.stringify([{ Image: imageId, Config: { Image: 'local-fixed-image' }, State: { Running: true }, Mounts: [{ Type: 'volume', Name: 'original-halo-data', Destination: '/root/.halo2' }] }]);
    if (args.includes('ps')) return args.at(-1) === 'halo' ? 'original-halo' : 'original-db';
    if (args.includes('--version')) return 'postgres (PostgreSQL) 17.11';
    if (args.includes('find')) return wrongHashes && args.some((s) => s.includes('luckypig-restore-')) ? 'changed' : hashes;
    if (args.includes('curl') && !args.at(-1).includes('readiness')) {
      const url = new URL(args.at(-1));
      return JSON.stringify(url.search ? { items: [post()], total: 1 } : post());
    }
    return '';
  };
  return { run, calls };
}

async function fixture(t) {
  const parent = await mkdtemp(join(tmpdir(), 'space-backup-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, 'backup');
  const mock = engine();
  await createBackup({ directory, run: mock.run });
  return { directory, ...mock };
}

test('backup packages database, all volume files and public baseline, then restarts Halo', async (t) => {
  const { directory, calls } = await fixture(t);
  const manifest = await verifyBackup(directory);
  assert.equal(manifest.files.length, 4);
  assert.ok(calls.findIndex((a) => a.includes('stop')) < calls.findIndex((a) => a.includes('pg_dump')));
  assert.ok(calls.findIndex((a) => a.includes('pg_dump')) < calls.findIndex((a) => a.includes('start')));
  assert.ok(calls.filter((a) => a[0] === 'run').every((a) => a.includes('type=volume,src=original-halo-data,dst=/data,readonly')));
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, 'database.dump'))).mode & 0o777, 0o600);
  assert.ok(!(await readFile(join(directory, 'manifest.json'), 'utf8')).includes('PASSWORD'));
  await assert.rejects(createBackup({ directory, run: engine().run }), { code: 'EEXIST' });
});

test('failed database export restarts original Halo and never creates a complete manifest', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'space-backup-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const mock = engine({ failDump: true }), directory = join(parent, 'broken');
  await assert.rejects(createBackup({ directory, run: mock.run }), /dump failed/);
  assert.ok(mock.calls.at(-1).includes('start'));
  await assert.rejects(readFile(join(directory, 'manifest.json')), { code: 'ENOENT' });
});

test('corrupt, duplicate, traversing and linked payloads are refused before Docker mutations', async (t) => {
  const { directory } = await fixture(t);
  const path = join(directory, 'manifest.json'), original = await readFile(path, 'utf8');
  for (const mutate of [
    (m) => { m.files[0].sha256 = '0'.repeat(64); },
    (m) => { m.files[0].name = '../database.dump'; },
    (m) => { m.files[0] = m.files[1]; },
    (m) => { m.complete = false; },
  ]) {
    const manifest = JSON.parse(original); mutate(manifest); await writeFile(path, JSON.stringify(manifest));
    const mock = engine();
    await assert.rejects(rehearseRestore(directory, { run: mock.run }));
    assert.equal(mock.calls.length, 0);
  }
  await writeFile(path, original);
  const file = join(directory, 'database.dump'), data = await readFile(file);
  await rm(file); await writeFile(join(directory, 'other.dump'), data); await symlink(join(directory, 'other.dump'), file);
  await assert.rejects(verifyBackup(directory), /校验失败/);
});

test('restore uses only fresh resources, imports transactionally, compares content and cleans up', async (t) => {
  const { directory } = await fixture(t);
  const mock = engine();
  const result = await rehearseRestore(directory, { run: mock.run, pause: async () => {} });
  assert.equal(result.passed, true);
  assert.equal(result.publicWorks, 1);
  assert.equal(result.volumeFileHashesMatch, true);
  assert.ok(mock.calls.find((a) => a.includes('pg_restore')).includes('--single-transaction'));
  assert.ok(mock.calls.every((a) => !a.includes('original-halo') && !a.includes('original-db') && !a.includes('original-halo-data') && !a.includes('compose')));
  assert.ok(mock.calls.filter((a) => a.includes('--name')).every((a) => !a.includes('-p') && !a.includes('--publish')));
  assert.ok(mock.calls.some((a) => a[0] === 'network' && a.includes('--internal')));
  assert.equal(mock.calls.filter((a) => a[0] === 'rm').length, 2);
  assert.equal(mock.calls.filter((a) => a[0] === 'volume' && a[1] === 'rm').length, 2);
  assert.equal(mock.calls.at(-1)[0], 'network');
});

test('failed restore or volume hash mismatch cleans up and cannot be reported as passing', async (t) => {
  const { directory } = await fixture(t);
  for (const fault of [{ failRestore: true }, { wrongHashes: true }]) {
    const mock = engine(fault);
    await assert.rejects(rehearseRestore(directory, { run: mock.run, pause: async () => {} }), /restore failed|哈希不一致/);
    assert.equal(mock.calls.filter((a) => a[0] === 'volume' && a[1] === 'rm').length, 2);
    assert.ok(mock.calls.at(-1).includes('rm'));
  }
});
