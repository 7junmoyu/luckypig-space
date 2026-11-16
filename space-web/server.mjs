import { pathToFileURL } from 'node:url';
import { loadConfig } from './src/config.mjs';
import { createContentService } from './src/content.mjs';
import { createApp } from './src/http.mjs';
import { createSettings } from './src/settings.mjs';
import { createOwnerAuth, ownerToken } from './src/owner-auth.mjs';

export async function start({ env = process.env, envPath } = {}) {
  const config = await loadConfig(env, envPath);
  const settings = await createSettings(config);
  const owner = createOwnerAuth({ token: await ownerToken(config.settingsDir), publicUrl: config.publicUrl, siteId: config.site.id });
  const server = createApp({ config, content: createContentService(config), settings, owner });
  server.on('error', (error) => { console.error(`网站启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(config.port, config.host, () => console.log(`${config.site.name}: http://${config.host}:${config.port} (content: ${config.source})`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await start();
