// Local Compose backup and isolated restore rehearsal. Never restores in-place.
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, lstat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../src/config.mjs';
import { createContentService } from '../src/content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const deploy = fileURLToPath(new URL('../../deploy/', import.meta.url));
const compose = ['compose', '--env-file', join(deploy, '.env'), '-f', join(deploy, 'compose.yaml')];
const payloads = ['database.dump', 'halo-data.tar.gz', 'volume-files.json', 'public-content.json'];

// Streams large archives to disk; no shell interpolation, no credentials in errors.
export async function docker(args, { output, input, timeout = 300000 } = {}) {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  child.stderr.resume();
  if (!output) child.stdout.on('data', (chunk) => { stdout += chunk; });
  const closed = new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? accept() : reject(new Error(`Docker 操作失败（${args[0]}，退出 ${code}）；未输出可能包含配置的诊断。`)));
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
  const transfers = [];
  if (output) transfers.push(pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })));
  if (input) transfers.push(pipeline(createReadStream(input), child.stdin));
  else child.stdin.end();
  try { await Promise.all([closed, ...transfers]); return stdout.trim(); }
  catch (error) { child.kill('SIGKILL'); await Promise.allSettled([closed, ...transfers]); throw error; }
  finally { clearTimeout(timer); }
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyBackup(directory) {
  const folder = resolve(directory);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.complete !== true || !Array.isArray(manifest.files)
      || manifest.files.length !== payloads.length || new Set(manifest.files.map((f) => f.name)).size !== payloads.length
      || !['halo', 'postgres'].every((key) => /^sha256:[a-f0-9]{64}$/.test(manifest.images?.[key]?.id || ''))) {
    throw new Error('备份清单不完整或版本不支持');
  }
  for (const file of manifest.files) {
    if (!payloads.includes(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('备份文件清单无效');
    const path = join(folder, file.name);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.bytes || await digest(path) !== file.sha256) throw new Error(`备份校验失败：${file.name}`);
  }
  return manifest;
}

async function inspect(run, id) { return JSON.parse(await run(['inspect', id]))[0]; }
function volume(container, destination) {
  const item = container.Mounts?.find((m) => m.Destination === destination && m.Type === 'volume');
  if (!item || !/^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(item.Name)) throw new Error('需要当前 Compose 的命名数据卷');
  return item.Name;
}
function image(container) {
  if (!/^sha256:[a-f0-9]{64}$/.test(container.Image)) throw new Error('无法读取固定镜像 ID');
  return { id: container.Image, reference: container.Config.Image };
}
async function publicContent(run, container) {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo', HALO_URL: 'http://localhost:8090' }, new URL('./absent.env', import.meta.url));
  const service = createContentService(config, { fetchImpl: async (url) => {
    const data = await run(['exec', container, 'curl', '-fsS', '--max-time', '20', String(url)]);
    return new Response(data, { headers: { 'content-type': 'application/json' } });
  } });
  const projects = await service.listProjects();
  const details = [];
  for (const project of projects) details.push(await service.getProject(project.id));
  return { profile: await service.getProfile(), projects: details.sort((a, b) => a.id.localeCompare(b.id)) };
}
async function volumeHashes(run, imageId, name) {
  const text = await run(['run', '--rm', '--network', 'none', '--mount', `type=volume,src=${name},dst=/data,readonly`, '--workdir', '/data', '--entrypoint', 'find', imageId, '.', '-type', 'f', '-exec', 'sha256sum', '{}', '+']);
  return text.split('\n').filter(Boolean).sort();
}

export async function createBackup({ run = docker, directory } = {}) {
  await run(['info', '--format', '{{.ServerVersion}}']);
  const haloId = await run([...compose, 'ps', '-q', 'halo']);
  const dbId = await run([...compose, 'ps', '-q', 'halodb']);
  if (!haloId || !dbId) throw new Error('请先启动当前 Halo 与数据库');
  const halo = await inspect(run, haloId), db = await inspect(run, dbId);
  if (!halo.State?.Running || !db.State?.Running) throw new Error('后台与数据库必须处于运行状态');
  if (!/^postgres \(PostgreSQL\) 17\./.test(await run(['exec', dbId, 'postgres', '--version']))) throw new Error('此工具仅适用于当前 PostgreSQL 17 本地部署');
  const images = { halo: image(halo), postgres: image(db) };
  const dataVolume = volume(halo, '/root/.halo2');
  const snapshot = await publicContent(run, haloId);
  const folder = resolve(directory || join(root, 'artifacts', 'backups', new Date().toISOString().replace(/[:.]/g, '-')));
  await mkdir(folder, { mode: 0o700 }); // No overwrite of any existing backup.
  let failure;
  try {
    // Quiesce uploads and writes so database and filesystem form one backup.
    await run([...compose, 'stop', 'halo']);
    await run([...compose, 'exec', '-T', 'halodb', 'pg_dump', '-U', 'halo', '-d', 'halo', '--format=custom', '--no-owner', '--no-acl'], { output: join(folder, 'database.dump') });
    await run(['run', '--rm', '--network', 'none', '--mount', `type=volume,src=${dataVolume},dst=/data,readonly`, '--entrypoint', 'tar', images.postgres.id, '-C', '/data', '-czf', '-', '.'], { output: join(folder, 'halo-data.tar.gz') });
    await writeFile(join(folder, 'volume-files.json'), JSON.stringify(await volumeHashes(run, images.postgres.id, dataVolume)), { mode: 0o600 });
    await writeFile(join(folder, 'public-content.json'), JSON.stringify(snapshot), { mode: 0o600 });
  } catch (error) { failure = error; }
  finally {
    try { await run([...compose, 'start', 'halo']); }
    catch { throw new Error('后台重新启动失败，请在 deploy/ 执行 docker compose start halo；此次备份未标记完成'); }
  }
  if (failure) throw failure;
  const files = [];
  for (const name of payloads) files.push({ name, bytes: (await stat(join(folder, name))).size, sha256: await digest(join(folder, name)) });
  const manifest = { version: 1, complete: true, createdAt: new Date().toISOString(), images, files };
  await writeFile(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  await verifyBackup(folder);
  return { directory: folder, files: files.length, publicWorks: snapshot.projects.length };
}

async function waitFor(run, args, attempts, pause) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { await run(args); return; } catch { if (attempt === attempts - 1) throw new Error('临时恢复环境等待就绪超时'); }
    await pause(2000);
  }
}

export async function rehearseRestore(directory, { run = docker, pause = (ms) => new Promise((done) => setTimeout(done, ms)) } = {}) {
  // Verify every payload BEFORE issuing any Docker mutation.
  const folder = resolve(directory);
  const manifest = await verifyBackup(folder);
  const prefix = `luckypig-restore-${randomBytes(8).toString('hex')}`;
  const names = { network: prefix, db: `${prefix}-db`, halo: `${prefix}-halo`, data: `${prefix}-data`, pg: `${prefix}-pg` };
  const cleanup = [];
  let report, failure;
  const password = randomBytes(24).toString('hex');
  try {
    // IDs deliberately use already installed source images; no implicit upgrade.
    for (const item of Object.values(manifest.images)) await run(['image', 'inspect', item.id]);
    await run(['network', 'create', '--internal', names.network]); cleanup.unshift(['network', 'rm', names.network]);
    for (const name of [names.data, names.pg]) { await run(['volume', 'create', name]); cleanup.unshift(['volume', 'rm', name]); }
    await run(['run', '--rm', '-i', '--network', 'none', '--mount', `type=volume,src=${names.data},dst=/data`, '--entrypoint', 'tar', manifest.images.postgres.id, '-C', '/data', '-xzf', '-'], { input: join(folder, 'halo-data.tar.gz') });
    const hashes = await volumeHashes(run, manifest.images.postgres.id, names.data);
    if (JSON.stringify(hashes) !== await readFile(join(folder, 'volume-files.json'), 'utf8')) throw new Error('恢复后数据卷文件哈希不一致');
    // Register containers for cleanup before run: Docker can create then fail to start.
    cleanup.unshift(['rm', '-f', names.db]);
    await run(['run', '-d', '--name', names.db, '--network', names.network, '--mount', `type=volume,src=${names.pg},dst=/var/lib/postgresql/data`, '-e', 'POSTGRES_USER=halo', '-e', 'POSTGRES_DB=halo', '-e', `POSTGRES_PASSWORD=${password}`, manifest.images.postgres.id]);
    // TCP avoids mistaking PostgreSQL's temporary initdb Unix-socket server for readiness.
    await waitFor(run, ['exec', names.db, 'pg_isready', '-h', '127.0.0.1', '-U', 'halo', '-d', 'halo'], 60, pause);
    await run(['exec', '-i', names.db, 'pg_restore', '-U', 'halo', '-d', 'halo', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction'], { input: join(folder, 'database.dump') });
    cleanup.unshift(['rm', '-f', names.halo]);
    await run(['run', '-d', '--name', names.halo, '--network', names.network, '--mount', `type=volume,src=${names.data},dst=/root/.halo2`, '-e', 'JVM_OPTS=-Xms256m -Xmx512m', '-e', `SPRING_R2DBC_URL=r2dbc:pool:postgresql://${names.db}:5432/halo`, '-e', 'SPRING_R2DBC_USERNAME=halo', '-e', `SPRING_R2DBC_PASSWORD=${password}`, '-e', 'SPRING_SQL_INIT_PLATFORM=postgresql', '-e', 'HALO_EXTERNAL_URL=http://localhost:8090', manifest.images.halo.id]);
    await waitFor(run, ['exec', names.halo, 'curl', '-fsS', '--max-time', '5', 'http://localhost:8090/actuator/health/readiness'], 150, pause);
    const actual = await publicContent(run, names.halo);
    if (JSON.stringify(actual) !== await readFile(join(folder, 'public-content.json'), 'utf8')) throw new Error('恢复后公开内容与备份基线不一致');
    report = { passed: true, checkedAt: new Date().toISOString(), publicWorks: actual.projects.length, publicContentMatches: true, volumeFileHashesMatch: true, originalEnvironmentUntouched: true };
  } catch (error) { failure = error; }
  finally {
    const failedCleanup = [];
    for (const command of cleanup) { try { await run(command); } catch { failedCleanup.push(command); } }
    if (failedCleanup.length) throw new Error(`临时资源清理未完成，请检查：${failedCleanup.map((args) => `docker ${args.join(' ')}`).join('；')}`);
  }
  if (failure) throw failure;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rehearsalReport = join(root, 'artifacts', 'restore-result.json');
  let rehearsing = false;
  try {
    const [action, directory, ...extra] = process.argv.slice(2);
    if (extra.length || !['create', 'check', 'rehearse'].includes(action) || action !== 'create' && !directory) throw new Error('用法：backup.mjs create [新目录] | check 备份目录 | rehearse 备份目录');
    if (action === 'create') {
      await mkdir(join(root, 'artifacts', 'backups'), { recursive: true, mode: 0o700 });
      console.log('备份期间会短暂停止 Halo，完成或失败后均尝试重新启动；请暂勿编辑或上传。');
    }
    if (action === 'rehearse') {
      rehearsing = true;
      await mkdir(join(root, 'artifacts'), { recursive: true, mode: 0o700 });
      await writeFile(rehearsalReport, JSON.stringify({ passed: false, state: 'running', startedAt: new Date().toISOString() }), { mode: 0o600 });
    }
    const result = action === 'create' ? await createBackup({ directory }) : action === 'check' ? { verified: true, ...(await verifyBackup(directory)).files.reduce((r, f) => ({ ...r, [f.name]: f.bytes }), {}) } : await rehearseRestore(directory);
    if (action === 'rehearse') {
      await writeFile(rehearsalReport, JSON.stringify(result, null, 2), { mode: 0o600 });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (rehearsing) await writeFile(rehearsalReport, JSON.stringify({ passed: false, state: 'failed', checkedAt: new Date().toISOString(), error: error.message }, null, 2), { mode: 0o600 });
    console.error(error.message); process.exitCode = 1;
  }
}
