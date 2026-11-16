import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../src/config.mjs';

const config = await loadConfig();
const seconds = Number(process.env.HALO_WAIT_SECONDS || 180);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) throw new Error('HALO_WAIT_SECONDS 必须为 1–600');
const deadline = Date.now() + seconds * 1000;
let nextNotice = 0;
let ready = false;
let accessDenied = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${config.haloUrl}/actuator/health/readiness`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
    const health = response.ok ? await response.json() : null;
    if (health?.status === 'UP') { ready = true; break; }
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code) || ['EPERM', 'EACCES'].includes(error.cause?.code)) { accessDenied = true; break; }
    // A new container may still be starting.
  }
  if (Date.now() >= nextNotice) { console.log('等待 Halo HTTP 服务就绪…'); nextNotice = Date.now() + 15000; }
  await delay(Math.min(2000, Math.max(0, deadline - Date.now())));
}
if (accessDenied) { console.error('当前进程无权连接 Halo HTTP 地址；请在本机终端运行或通过浏览器检查。此结果不代表后台未启动。'); process.exitCode = 1; }
else if (ready) console.log(`Halo 已就绪：${config.haloUrl}/console`);
else { console.error(`等待 ${seconds} 秒后 Halo 仍未就绪。请检查容器启动结果；未将此检查标记为通过。`); process.exitCode = 1; }
