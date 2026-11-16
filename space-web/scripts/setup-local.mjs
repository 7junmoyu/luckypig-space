import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const deployRoot = fileURLToPath(new URL('../../deploy/', import.meta.url));

export async function setup() {
  for (const [target, template, replace] of [
    [new URL('../../deploy/.env', import.meta.url), new URL('../../deploy/.env.example', import.meta.url), true],
    [new URL('../.env', import.meta.url), new URL('../.env.example', import.meta.url), false],
  ]) {
    let contents = await readFile(template, 'utf8');
    if (replace) contents = contents.replace('replace-with-a-local-random-password', randomBytes(24).toString('hex'));
    try {
      await writeFile(target, contents, { flag: 'wx', mode: 0o600 });
      console.log(`已创建 ${fileURLToPath(target)}（本地配置，不提交）`);
    } catch (error) { if (error.code !== 'EEXIST') throw error; console.log(`保留已有配置 ${fileURLToPath(target)}`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await setup();
