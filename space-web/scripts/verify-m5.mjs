import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, delimiter } from 'node:path';
import { assertRuntime, runtimeInfo } from '../src/runtime.mjs';
import { verifyLocal } from './verify-local.mjs';
import { verifyPublication } from './verify-publication.mjs';
import { createBackup, verifyBackup, rehearseRestore } from './backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(new URL('backups/', artifacts), { recursive: true, mode: 0o700 });
const report = { passed: false, startedAt: new Date().toISOString(), runtime: runtimeInfo(), steps: {}, failureStage: null };
const save = () => writeFile(new URL('m5-result.json', artifacts), JSON.stringify(report, null, 2), { mode: 0o600 });
async function step(name, action) {
  report.failureStage = name; await save(); console.log(`M5：${name}…`);
  report.steps[name] = await action(); await save();
}
function npm(script) {
  return new Promise((accept, reject) => {
    const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}` };
    const child = process.env.npm_execpath
      ? spawn(process.execPath, [process.env.npm_execpath, 'run', script], { cwd: root, env, stdio: 'inherit' })
      : spawn('npm', ['run', script], { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? accept({ passed: true }) : reject(new Error(`${script} 未通过，退出 ${code}`)));
  });
}
try {
  await save();
  await step('runtime', async () => assertRuntime());
  console.log(`M5 使用 Node ${report.runtime.node}：${report.runtime.executable}`);
  console.log('仅验收当前本地环境。会修改并恢复专用示例作品，发起 3 次真实模型请求（含一次取消），备份时短暂停止 Halo，恢复只在新容器/数据卷内演练。运行期间请暂勿编辑、上传或管理容器。');
  await step('syntax', () => npm('check'));
  await step('controlled_fault_tests', () => npm('test'));
  await step('local_http_and_mcp', () => verifyLocal());
  await step('real_publication_chat_mcp', async () => {
    const result = await verifyPublication();
    await writeFile(new URL('m5-publication-result.json', artifacts), JSON.stringify(result, null, 2), { mode: 0o600 });
    return result;
  });
  let backup;
  await step('backup', async () => { backup = await createBackup(); return backup; });
  await step('backup_integrity', async () => { await verifyBackup(backup.directory); return { passed: true }; });
  await step('isolated_restore', async () => {
    const result = await rehearseRestore(backup.directory);
    await writeFile(new URL('restore-result.json', artifacts), JSON.stringify(result, null, 2), { mode: 0o600 });
    return result;
  });
  await step('original_environment_after_restore', async () => {
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:4173/api/health', { signal: AbortSignal.timeout(3000) });
        if (response.ok) return await verifyLocal();
      } catch { /* Halo can still be restarting after the consistent backup. */ }
      await new Promise((done) => setTimeout(done, 2000));
    }
    throw new Error('备份后原网站未在 180 秒内就绪；请检查 Halo，未将 M5 记为通过');
  });
  report.passed = true; report.failureStage = null;
  report.scope = '本机 Halo/公开 HTTP/DeepSeek/SDK MCP/备份恢复；典型错误由受控上游测试覆盖。既有 Codex 主机、重启与浏览器验收记录独立保留；不代表公网或跨架构通过。';
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify({ passed: report.passed, failureStage: report.failureStage, error: report.error, report: 'artifacts/m5-result.json' }, null, 2));
