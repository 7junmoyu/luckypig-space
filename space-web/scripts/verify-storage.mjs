import { mkdir, writeFile } from 'node:fs/promises';
import { assertRuntime, runtimeInfo } from '../src/runtime.mjs';
import { createBackup, verifyBackup, rehearseRestore } from './backup.mjs';
import { verifyLocal } from './verify-local.mjs';

// Separately retry the last M5 phase without re-running paid model calls.
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(new URL('backups/', artifacts), { recursive: true, mode: 0o700 });
const report = { passed: false, startedAt: new Date().toISOString(), runtime: runtimeInfo(), steps: {}, failureStage: null, modelRequestMade: false };
const save = () => writeFile(new URL('m5-storage-result.json', artifacts), JSON.stringify(report, null, 2), { mode: 0o600 });
async function step(name, action) {
  report.failureStage = name; await save(); console.log(`M5 存储验收：${name}…`);
  report.steps[name] = await action(); await save();
}
try {
  await step('runtime', async () => assertRuntime());
  console.log('本次只测试存储，不请求模型、不修改作品。备份时短暂停止 Halo，随后尝试启动；恢复使用独立临时容器/卷。期间请暂勿编辑、上传或管理容器。');
  await step('before', () => verifyLocal());
  let backup;
  await step('backup', async () => { backup = await createBackup(); return backup; });
  await step('integrity', async () => { await verifyBackup(backup.directory); return { passed: true }; });
  await step('restore', async () => {
    const result = await rehearseRestore(backup.directory);
    await writeFile(new URL('restore-result.json', artifacts), JSON.stringify(result, null, 2), { mode: 0o600 });
    return result;
  });
  await step('after', async () => {
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:4173/api/health', { signal: AbortSignal.timeout(3000) });
        if (response.ok) return await verifyLocal();
      } catch { /* Halo is allowed time to restart after the consistent backup. */ }
      await new Promise((done) => setTimeout(done, 2000));
    }
    throw new Error('原环境未在等待窗口内就绪，请检查 Halo；未记为通过');
  });
  report.passed = true; report.failureStage = null;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify({ passed: report.passed, failureStage: report.failureStage, error: report.error, report: 'artifacts/m5-storage-result.json' }, null, 2));
