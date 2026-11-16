// Requires the user to restart the containers and the admin page to be signed in.
const task = await taskSpace('luckypig-halo-live');
const admin = task.page('p1');
const front = task.page('p2');
const { readFile, writeFile, stat } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const root = new URL('../', import.meta.url);
const baselinePath = new URL('artifacts/before-restart.json', root);
const before = JSON.parse(await readFile(baselinePath, 'utf8'));
const media = JSON.parse(await readFile(new URL('artifacts/halo-media-baseline.json', root), 'utf8'));
const startupResponse = await admin.fetch('/actuator/startup');
const startupType = startupResponse.headers['content-type']?.split(';')[0].trim().toLowerCase() || '';
const startupIsJson = startupType === 'application/json' || startupType.startsWith('application/') && startupType.endsWith('+json');
if (startupResponse.status !== 200 || !startupIsJson) throw new Error('请先重新登录本地 Halo 管理员，再检查启动时间');
const startup = JSON.parse(startupResponse.body).timeline?.startTime;
if (!startup || Date.parse(startup) <= (await stat(baselinePath)).mtimeMs) throw new Error('未观察到晚于验收基线的 Halo 启动时间；还不能将重启持久化标记为通过');
const projects = JSON.parse((await front.fetch('/api/projects?size=100')).body);
const ids = new Set(projects.items.map((p) => p.id));
if (!before.ids.every((id) => ids.has(id))) throw new Error('重启后有基线作品未恢复');
const profile = JSON.parse((await front.fetch('/api/profile')).body);
if (['name', 'description', 'biography'].some((key) => profile[key] !== before.profile[key])) throw new Error('重启后公开介绍与基线不一致，请确认期间是否编辑过资料');
for (const [file, hash] of Object.entries(media.hashes)) {
  const destination = `/private/tmp/luckypig-after-restart-${file}`;
  const response = await front.fetch(`/media/halo/upload/${file}`, { saveAs: destination });
  if (response.status !== 200 || createHash('sha256').update(await readFile(destination)).digest('hex') !== hash) throw new Error(`重启后附件校验不一致：${file}`);
}
const policyResponse = await admin.fetch('/api/v1alpha1/configmaps/default-policy-config');
if (policyResponse.status !== 200 || !JSON.parse(JSON.parse(policyResponse.body).data.default).allowedFileTypes.includes('DOCUMENT')) throw new Error('文档上传配置未恢复');
await writeFile(new URL('artifacts/after-restart.json', root), JSON.stringify({ startup, restoredWorks: before.ids.length, profile: true, attachmentHashes: true, documentPolicy: true }, null, 2), { mode: 0o600 });
console.log({ confirmedNewHaloStartup: startup, restoredWorks: before.ids.length, profilePersisted: true, allAttachmentHashesMatch: true, documentPolicyPersisted: true });
