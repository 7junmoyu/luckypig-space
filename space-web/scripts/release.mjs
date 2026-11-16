import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from '../src/config.mjs';
import { assertRuntime } from '../src/runtime.mjs';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const deployRoot = fileURLToPath(new URL('../../deploy/release/', import.meta.url));
const appFiles = ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json', 'server.mjs', 'scripts/owner-token.mjs', 'scripts/container-health.mjs'];
const appTrees = ['src', 'public', 'fixtures', 'sites', 'agent-skills'];
const deployFiles = ['compose.yaml', '.env.example', 'zyt.env.example', 'nginx.conf.example', 'README.md'];
const extraDeployFiles = ['compose.zyt.yaml', 'zyt-standalone.env.example', 'README-ZYT.md', 'zyt.sh'];
const platforms = new Set(['linux/amd64', 'linux/arm64']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const secret = /\b(?:sk-[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{16,}|pat_[A-Za-z0-9_-]{20,})\b/;
function validMetadata(manifest) {
  return platforms.has(manifest.platform) && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version || '')
    && /^[a-zA-Z0-9][a-zA-Z0-9./:_@-]{0,255}$/.test(manifest.nodeImage || '')
    && manifest.image === `luckypig-space-web:${manifest.version}-${manifest.platform.split('/')[1]}`;
}
function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.split('/').some((part) => !part || part === '..' || part === '.' || part.startsWith('.') && !['.dockerignore', '.env.example'].includes(part))) return false;
  return name.startsWith('app/') || name.startsWith('deploy/');
}
async function walk(directory, prefix = '') {
  const result = [];
  for (const item of (await readdir(directory)).sort()) {
    const path = join(directory, item), name = prefix ? `${prefix}/${item}` : item;
    const info = await lstat(path);
    if (info.isDirectory() && !info.isSymbolicLink()) result.push(...await walk(path, name));
    else if (info.isFile() && !info.isSymbolicLink()) result.push(name);
    else throw new Error('发布源或发布包含符号链接/特殊文件，已拒绝');
  }
  return result;
}
function scan(name, bytes) {
  if (!safeName(name) || /(?:^|\/)(?:node_modules|artifacts|test|\.local|\.git)(?:\/|$)/.test(name) || /\.(?:key|pem|p12|dump|tar|gz)$/i.test(name)) throw new Error('发布包含非运行文件或私有路径');
  if (bytes.length > 32 * 1024 * 1024) throw new Error('发布源中存在过大的文件；作品媒体应留在 Halo 附件存储');
  if (/\.(?:mjs|js|sh|html|css|json|md|txt|yaml|example|svg)$|(?:Dockerfile|\.dockerignore)$/.test(name) && (secret.test(bytes.toString('utf8')) || /https?:\/\/[^/\s"<>]+@/.test(bytes.toString('utf8')))) throw new Error('发布源检测到疑似凭据，已拒绝打包（未输出内容）');
}

export async function prepareRelease({ source = appRoot, deploy = deployRoot, destination, platform = 'linux/amd64', nodeImage = 'node:24-bookworm-slim' } = {}) {
  if (!platforms.has(platform)) throw new Error('目标平台只能为 linux/amd64 或 linux/arm64');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9./:_@-]{0,255}$/.test(nodeImage)) throw new Error('基础镜像引用格式无效');
  const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('应用版本无效');
  const names = [...appFiles];
  for (const tree of appTrees) {
    if (!(await lstat(join(source, tree))).isDirectory() || (await lstat(join(source, tree))).isSymbolicLink()) throw new Error('发布源目录必须是普通目录');
    names.push(...(await walk(join(source, tree), tree)));
  }
  const entries = [...names.map((name) => ({ name: `app/${name}`, source: join(source, name) })), ...[...deployFiles, ...extraDeployFiles].map((name) => ({ name: `deploy/${name}`, source: join(deploy, name) }))];
  // Validate every source before creating a destination. Never copy links or secrets.
  const files = [];
  for (const entry of entries) {
    if (!(await lstat(entry.source)).isFile() || (await lstat(entry.source)).isSymbolicLink()) throw new Error('发布源文件必须是普通文件');
    const bytes = await readFile(entry.source); scan(entry.name, bytes);
    files.push({ ...entry, bytes });
  }
  const directory = resolve(destination || join(source, 'artifacts', 'releases', `${version}-${platform.split('/')[1]}-${Date.now()}-${randomBytes(4).toString('hex')}`));
  await mkdir(resolve(directory, '..'), { recursive: true });
  await mkdir(directory, { mode: 0o700 }); // No overwrite of an existing packet.
  for (const file of files) {
    await mkdir(resolve(directory, file.name, '..'), { recursive: true });
    await writeFile(join(directory, file.name), file.bytes, { flag: 'wx', mode: file.name.endsWith('.sh') ? 0o755 : 0o644 });
  }
  const manifest = { format: 1, version, platform, nodeImage, image: `luckypig-space-web:${version}-${platform.split('/')[1]}`, createdAt: new Date().toISOString(),
    files: files.map((file) => ({ path: file.name, bytes: file.bytes.length, sha256: hash(file.bytes) })).sort((a, b) => a.path.localeCompare(b.path)) };
  await writeFile(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  await verifyRelease(directory);
  return { directory, manifest };
}

export async function verifyRelease(directory) {
  const rootInfo = await lstat(directory);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('发布包必须是普通目录');
  const manifestPath = join(directory, 'release.json');
  const info = await lstat(manifestPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('发布清单必须是普通文件');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.format !== 1 || !validMetadata(manifest) || !Array.isArray(manifest.files) || manifest.files.length < 10 || new Set(manifest.files.map((f) => f.path)).size !== manifest.files.length) throw new Error('发布清单无效');
  for (const required of [...appFiles.map((f) => `app/${f}`), ...deployFiles.map((f) => `deploy/${f}`)]) if (!manifest.files.some((f) => f.path === required)) throw new Error('发布包缺少必需文件');
  const actual = (await walk(directory)).filter((name) => name !== 'release.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files.map((f) => f.path).sort())) throw new Error('发布包包含未登记文件或缺失文件');
  for (const file of manifest.files) {
    if (!safeName(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('发布文件记录无效');
    const bytes = await readFile(join(directory, file.path)); scan(file.path, bytes);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error('发布包文件哈希不一致');
  }
  return manifest;
}

export function checkEnvironment(values, { production = false, platform } = {}) {
  if (values.SITE_ID && !['luckypig', 'zyt'].includes(values.SITE_ID)) throw new Error('SITE_ID 无效');
  if (values.CONTENT_SOURCE && !(values.CONTENT_SOURCE === 'halo' || values.SITE_ID === 'zyt' && values.CONTENT_SOURCE === 'portfolio')) throw new Error('发布内容源无效');
  if (!platforms.has(values.TARGET_PLATFORM) || platform && values.TARGET_PLATFORM !== platform) throw new Error('TARGET_PLATFORM 与发布包平台不一致或不支持');
  if (!values.SPACE_IMAGE || /(?:^|:)latest$/.test(values.SPACE_IMAGE)) throw new Error('SPACE_IMAGE 必须指定版本标签或摘要');
  if (!values.POSTGRES_PASSWORD || values.POSTGRES_PASSWORD.length < 32 || /REPLACE|CHANGE|EXAMPLE/i.test(values.POSTGRES_PASSWORD)) throw new Error('请设置至少32字符的随机数据库密码');
  for (const field of ['PUBLIC_URL', 'HALO_EXTERNAL_URL']) {
    let url;
    try { url = new URL(values[field]); } catch { throw new Error(`${field} 无效`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || production && url.protocol !== 'https:' || /example\.(com|org|net)$/.test(url.hostname)) throw new Error(`${field} 必须是实际站点根地址，生产环境使用 HTTPS`);
  }
  for (const field of ['WEB_PORT', 'HALO_PORT']) if (!Number.isInteger(Number(values[field])) || Number(values[field]) < 1 || Number(values[field]) > 65535) throw new Error(`${field} 无效`);
  if (Number(values.WEB_PORT) === Number(values.HALO_PORT)) throw new Error('网站与 Halo 端口不能相同');
  if (!['deepseek', 'openai-compatible'].includes(values.CHAT_MODE)) throw new Error('发布环境必须使用模型模式，不能启用本地演示');
  let llm;
  try { llm = new URL(values.LLM_BASE_URL); } catch { throw new Error('LLM_BASE_URL 无效'); }
  if (!['http:', 'https:'].includes(llm.protocol) || llm.username || llm.password || llm.search || llm.hash || production && llm.protocol !== 'https:') throw new Error('LLM_BASE_URL 格式或协议不符合发布要求');
  if (!values.LLM_MODEL?.trim()) throw new Error('LLM_MODEL 不能为空');
  const timeout = Number(values.LLM_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new Error('LLM_TIMEOUT_MS 必须为1000–120000');
  if (!['true', 'false'].includes(values.WEB_SEARCH_ENABLED)) throw new Error('WEB_SEARCH_ENABLED 只能为 true/false');
  if (values.WEB_SEARCH_ENABLED === 'true' && !values.TAVILY_API_KEY?.trim()) throw new Error('环境配置开启了搜索但没有搜索 Key');
  return { passed: true, production, platform: values.TARGET_PLATFORM, modelKeyInEnvironment: Boolean(values.LLM_API_KEY), searchEnabledInEnvironment: values.WEB_SEARCH_ENABLED === 'true', note: '未读取运行数据卷；已保存的模型/搜索设置优先于环境值。未验证端口、证书或上游连通。' };
}

export function buildArguments(directory, manifest) {
  if (!validMetadata(manifest)) throw new Error('构建参数无效');
  return ['buildx', 'build', '--platform', manifest.platform, '--load', '--build-arg', `NODE_IMAGE=${manifest.nodeImage}`, '--metadata-file', `${resolve(directory)}.image-metadata.json`, '--tag', manifest.image, join(resolve(directory), 'app')];
}

export async function main(args = process.argv.slice(2)) {
  assertRuntime();
  const [action, ...rest] = args;
  const allowed = action === 'prepare' ? new Set(['--platform', '--output', '--node-image']) : new Set(['--directory', '--env-file']);
  const options = {}; let production = false;
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key === '--production' && action === 'check') { production = true; continue; }
    if (!allowed.has(key) || !rest[i + 1] || rest[i + 1].startsWith('--') || options[key]) throw new Error('发布命令参数不正确');
    options[key] = rest[++i];
  }
  if (action === 'prepare') {
    const result = await prepareRelease({ platform: options['--platform'], destination: options['--output'], nodeImage: options['--node-image'] });
    console.log(JSON.stringify({ passed: true, directory: result.directory, platform: result.manifest.platform, image: result.manifest.image, files: result.manifest.files.length, built: false }, null, 2));
    return result;
  }
  if (action !== 'check' || !options['--directory']) throw new Error('用法：release.mjs prepare [--platform linux/amd64|linux/arm64] [--output 新目录] [--node-image 镜像] | check --directory 发布包 [--env-file 私有配置] [--production]');
  const manifest = await verifyRelease(resolve(options['--directory']));
  const environment = options['--env-file'] ? checkEnvironment(parseEnv(await readFile(resolve(options['--env-file']), 'utf8')), { production, platform: manifest.platform }) : null;
  if (production && !environment) throw new Error('生产配置检查需要 --env-file');
  console.log(JSON.stringify({ passed: true, integrity: true, built: false, environment, note: '源码及配置检查，不代表镜像构建或部署通过' }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) { console.error(error.code ? '发布文件操作失败，请检查路径、权限与文件是否存在（未打印文件内容）' : error.message); process.exitCode = 1; }
}
