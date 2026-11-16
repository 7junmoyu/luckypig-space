import { readFile, writeFile } from 'node:fs/promises';
import { renderSiteHtml } from '../src/site.mjs';

// Preserve runnable static Luckypig pages for legacy previews; server templates
// remain the shared source for both brands. Never place unresolved tokens in public/.
for (const file of ['index.html', 'admin.html', 'sources.html']) {
  const rendered = renderSiteHtml(await readFile(new URL(`../src/templates/${file}`, import.meta.url), 'utf8'), {});
  const target = new URL(`../public/${file}`, import.meta.url);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== rendered) throw new Error(`默认站点页面未同步：${file}，请运行 npm run site:sync`);
  } else await writeFile(target, rendered);
}
