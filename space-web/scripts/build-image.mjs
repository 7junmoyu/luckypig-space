import { spawn } from 'node:child_process';
import { main, verifyRelease, buildArguments } from './release.mjs';

try {
  const packet = await main(['prepare', ...process.argv.slice(2)]);
  const manifest = await verifyRelease(packet.directory);
  const child = spawn('docker', buildArguments(packet.directory, manifest), { stdio: 'inherit', shell: false });
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('close', accept); });
  if (code !== 0) throw new Error('镜像构建未通过；源码发布包已保留，未推送镜像或启动服务');
  console.log(JSON.stringify({ built: true, image: manifest.image, platform: manifest.platform, source: packet.directory, metadata: `${packet.directory}.image-metadata.json`, pushed: false, deployed: false }, null, 2));
} catch (error) { console.error(error.code ? '无法执行 Docker，请在可访问 Docker 的普通终端运行构建' : error.message); process.exitCode = 1; }
