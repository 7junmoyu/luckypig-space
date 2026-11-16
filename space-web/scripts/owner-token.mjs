import { loadConfig } from '../src/config.mjs';
import { ownerToken } from '../src/owner-auth.mjs';

// Explicit local terminal command only. The web service never prints this token.
const config = await loadConfig();
console.log(`站主管理：${config.publicUrl}/admin\n访问口令（仅在本机使用）：\n${await ownerToken(config.settingsDir)}`);
