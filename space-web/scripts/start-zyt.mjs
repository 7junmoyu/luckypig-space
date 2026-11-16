import { start } from '../server.mjs';
import { assertRuntime } from '../src/runtime.mjs';

assertRuntime();
// loadConfig selects .env.zyt for this site, never the original site's .env.
await start({ env: { ...process.env, SITE_ID: 'zyt' } });
