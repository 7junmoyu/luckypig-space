import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease, verifyRelease, checkEnvironment, buildArguments } from '../scripts/release.mjs';

const source = new URL('../', import.meta.url).pathname;
const deploy = new URL('../../deploy/release/', import.meta.url).pathname;
async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'space-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const good = { TARGET_PLATFORM: 'linux/amd64', SPACE_IMAGE: 'luckypig-space-web:0.3.0-amd64', POSTGRES_PASSWORD: 'a'.repeat(48), WEB_PORT: '4183', HALO_PORT: '8190', PUBLIC_URL: 'https://space.test', HALO_EXTERNAL_URL: 'https://cms.test', CHAT_MODE: 'deepseek', LLM_BASE_URL: 'https://api.deepseek.com', LLM_MODEL: 'deepseek-flash', LLM_TIMEOUT_MS: '60000', WEB_SEARCH_ENABLED: 'false', LLM_API_KEY: '' };

test('release snapshots contain runnable sources, template deployment and exact file hashes, without development/private directories', async (t) => {
  const root = await temporary(t);
  const { manifest, directory } = await prepareRelease({ destination: join(root, 'packet') });
  assert.ok(manifest.files.some((f) => f.path === 'app/src/project-retrieval.mjs'));
  assert.ok(manifest.files.some((f) => f.path === 'app/src/templates/index.html'));
  assert.ok(manifest.files.some((f) => f.path === 'app/sites/zyt/profile.json'));
  assert.ok(manifest.files.some((f) => f.path === 'app/sites/zyt/projects.json'));
  assert.ok(!manifest.files.some((f) => /\.(?:pdf|jpe?g)$/i.test(f.path) && /张雨彤|简历|证件照/.test(f.path)));
  assert.ok(manifest.files.some((f) => f.path === 'app/scripts/owner-token.mjs'));
  assert.ok(manifest.files.some((f) => f.path === 'app/scripts/container-health.mjs'));
  assert.ok(manifest.files.some((f) => f.path === 'deploy/.env.example'));
  assert.ok(!manifest.files.some((f) => /(?:^|\/)(?:node_modules|\.env|\.local|artifacts|test)(?:\/|$)/.test(f.path)));
  assert.deepEqual(await verifyRelease(directory), manifest);
  await assert.rejects(prepareRelease({ destination: directory }), (e) => e.code === 'EEXIST');
  await writeFile(join(directory, 'app/public/index.html'), 'corrupted');
  await assert.rejects(verifyRelease(directory), /哈希不一致/);
});

test('undeclared files, path traversal, manifest links and duplicate records are rejected', async (t) => {
  const root = await temporary(t);
  const { directory, manifest } = await prepareRelease({ destination: join(root, 'packet') });
  await writeFile(join(directory, 'unlisted.txt'), 'not allowed');
  await assert.rejects(verifyRelease(directory), /未登记/);
  await rm(join(directory, 'unlisted.txt'));
  for (const files of [[...manifest.files, manifest.files[0]], [...manifest.files, { path: '../escape', bytes: 0, sha256: 'a'.repeat(64) }]]) {
    await writeFile(join(directory, 'release.json'), JSON.stringify({ ...manifest, files }));
    await assert.rejects(verifyRelease(directory));
  }
  await writeFile(join(root, 'external.json'), JSON.stringify(manifest));
  await rm(join(directory, 'release.json')); await symlink(join(root, 'external.json'), join(directory, 'release.json'));
  await assert.rejects(verifyRelease(directory), /普通文件/);
});

test('linked or credential-bearing public sources stop packaging before creating output', async (t) => {
  const root = await temporary(t), fake = join(root, 'source');
  await mkdir(fake);
  for (const file of ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'server.mjs', 'scripts', 'src', 'public', 'fixtures', 'sites', 'agent-skills']) await cp(join(source, file), join(fake, file), { recursive: true });
  await writeFile(join(fake, '.env'), 'PRIVATE_ENV_MUST_NOT_SHIP=true');
  await mkdir(join(fake, '.local')); await writeFile(join(fake, '.local', 'owner-token'), 'PRIVATE_TOKEN_MUST_NOT_SHIP');
  const packet = await prepareRelease({ source: fake, deploy, destination: join(root, 'safe') });
  const text = await Promise.all(packet.manifest.files.map((f) => readFile(join(packet.directory, f.path), 'utf8')));
  assert.ok(!text.join('').includes('PRIVATE_ENV_MUST_NOT_SHIP')); assert.ok(!text.join('').includes('PRIVATE_TOKEN_MUST_NOT_SHIP'));
  await symlink(join(fake, '.env'), join(fake, 'public', 'linked.txt'));
  await assert.rejects(prepareRelease({ source: fake, deploy, destination: join(root, 'linked') }), /符号链接/);
  await rm(join(fake, 'public', 'linked.txt'));
  const key = 'sk-' + 'z'.repeat(24);
  await writeFile(join(fake, 'public', 'oops.js'), `const key = '${key}';`);
  await assert.rejects(prepareRelease({ source: fake, deploy, destination: join(root, 'secret') }), (e) => /凭据/.test(e.message) && !e.message.includes(key));
  assert.ok(!(await readdir(root)).includes('secret'));
});

test('build arguments use one explicit architecture and load locally, with no push or private environment propagation', async (t) => {
  const root = await temporary(t);
  for (const platform of ['linux/amd64', 'linux/arm64']) {
    const packet = await prepareRelease({ platform, destination: join(root, platform.split('/')[1]) });
    const args = buildArguments(packet.directory, packet.manifest);
    assert.equal(args[args.indexOf('--platform') + 1], platform); assert.ok(args.includes('--load'));
    assert.ok(!args.includes('--push')); assert.ok(!args.join(' ').includes('.env'));
    assert.equal(args.at(-1), join(packet.directory, 'app'));
    assert.throws(() => buildArguments(packet.directory, { ...packet.manifest, image: 'luckypig-space-web:0.3.0-incorrect' }), /参数无效/);
  }
  await assert.rejects(prepareRelease({ platform: 'linux/unknown', destination: join(root, 'bad') }), /目标平台/);
  assert.throws(() => buildArguments(root, { platform: 'linux/amd64', nodeImage: 'x;echo secret', image: 'latest' }), /参数无效/);
});

test('preflight refuses placeholders, insecure production origins, shared ports, demo and missing search auth without leaking values', () => {
  assert.equal(checkEnvironment(good, { production: true, platform: 'linux/amd64' }).passed, true);
  for (const patch of [{ POSTGRES_PASSWORD: 'REPLACE_WITH_RANDOM_PASSWORD' }, { PUBLIC_URL: 'http://space.test' }, { PUBLIC_URL: 'https://space.example.com' }, { PUBLIC_URL: 'https://space.test/subpath' }, { HALO_PORT: '04183' }, { CHAT_MODE: 'local-demo' }, { WEB_SEARCH_ENABLED: 'true' }, { SPACE_IMAGE: 'web:latest' }, { LLM_BASE_URL: 'https://user:private@api.test' }, { TARGET_PLATFORM: 'linux/arm64' }, { LLM_TIMEOUT_MS: '500000' }]) {
    assert.throws(() => checkEnvironment({ ...good, ...patch }, { production: true, platform: 'linux/amd64' }));
  }
  const result = checkEnvironment({ ...good, LLM_API_KEY: 'PRIVATE_MODEL_KEY', TAVILY_API_KEY: 'PRIVATE_SEARCH_KEY' });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_MODEL_KEY')); assert.ok(!JSON.stringify(result).includes('PRIVATE_SEARCH_KEY'));
  assert.equal(checkEnvironment({ ...good, PUBLIC_URL: 'http://127.0.0.1:4183', HALO_EXTERNAL_URL: 'http://127.0.0.1:8190' }).passed, true);
});
