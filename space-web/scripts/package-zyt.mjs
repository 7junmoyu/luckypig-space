import { readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { prepareRelease, verifyRelease } from './release.mjs';
import { assertRuntime } from '../src/runtime.mjs';

const run = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function packageZyt({ destination, platform = 'linux/amd64' } = {}) {
  assertRuntime();
  const app = new URL('../', import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', app), 'utf8'));
  const stamp = Date.now();
  const arch = platform.split('/')[1];
  const target = destination || fileURLToPath(new URL(`artifacts/delivery/zyt-space-${version}-${arch}-${stamp}`, app));
  const { directory, manifest } = await prepareRelease({ destination: target, platform });
  const image = `zyt-space-web:${version}-${arch}-${stamp}`;
  const envPath = 'deploy/zyt-standalone.env.example';
  const env = Buffer.from((await readFile(resolve(directory, envPath), 'utf8'))
    .replace(/^TARGET_PLATFORM=.*$/m, `TARGET_PLATFORM=${platform}`)
    .replace(/^SPACE_IMAGE=.*$/m, `SPACE_IMAGE=${image}`));
  await writeFile(resolve(directory, envPath), env);
  Object.assign(manifest.files.find((f) => f.path === envPath), { bytes: env.length, sha256: hash(env) });
  const sums = Buffer.from(manifest.files.map((f) => `${f.sha256}  ../${f.path}\n`).join(''));
  await writeFile(resolve(directory, 'deploy/SHA256SUMS'), sums, { flag: 'wx', mode: 0o644 });
  manifest.files.push({ path: 'deploy/SHA256SUMS', bytes: sums.length, sha256: hash(sums) });
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(resolve(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  await verifyRelease(directory);

  const archive = `${directory}.tar.gz`, checksum = `${archive}.sha256`;
  // Refuse to replace a previously delivered archive, even with --output.
  await writeFile(archive, '', { flag: 'wx', mode: 0o600 });
  try {
    await run('tar', ['-czf', archive, '-C', dirname(directory), '--', basename(directory)], { env: { ...process.env, LC_ALL: 'C', COPYFILE_DISABLE: '1' } });
    const digest = hash(await readFile(archive));
    await writeFile(checksum, `${digest}  ${basename(archive)}\n`, { flag: 'wx', mode: 0o644 });
    return { directory, archive, checksum, sha256: digest, platform, image, site: 'zyt', contentSource: 'portfolio', imageIncluded: false, privateSettingsIncluded: false };
  } catch (error) {
    await rm(archive, { force: true });
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { platform: { type: 'string', default: 'linux/amd64' }, output: { type: 'string' } }, strict: true, allowPositionals: false });
  console.log(JSON.stringify(await packageZyt({ destination: values.output, platform: values.platform }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
