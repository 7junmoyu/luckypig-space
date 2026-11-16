import { spawnSync } from 'node:child_process';
import { setup, deployRoot } from './setup-local.mjs';
import { start } from '../server.mjs';

await setup();
const engine = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15_000 });
if (engine.status !== 0 || !/^\d+\.\d+\.\d+/.test(engine.stdout?.trim() || '')) {
  console.error('无法连接 Docker 引擎。请启动 Docker Desktop / OrbStack / Colima，然后重新运行 npm run dev。\n只看演示界面可运行 npm run demo。');
  process.exitCode = 1;
} else {
  const compose = spawnSync('docker', ['compose', '--env-file', `${deployRoot}.env`, '-f', `${deployRoot}compose.yaml`, 'up', '-d'], { stdio: 'inherit' });
  if (compose.status !== 0) process.exitCode = 1;
  else {
    console.log('后台首次启动后，请访问 http://127.0.0.1:8090/console 完成初始化。');
    process.env.CONTENT_SOURCE = 'halo';
    await start();
  }
}
