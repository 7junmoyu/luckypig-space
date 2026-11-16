import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ContentError } from './content.mjs';

export async function ownerToken(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = resolve(directory, 'owner-token');
  try { await writeFile(path, randomBytes(32).toString('base64url') + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await chmod(path, 0o600);
  const token = (await readFile(path, 'utf8')).trim();
  if (token.length < 32) throw new Error('站主访问口令文件无效');
  return token;
}

export function createOwnerAuth({ token, publicUrl, siteId = 'luckypig', now = Date.now }) {
  const digest = (text) => createHash('sha256').update(text).digest();
  const expected = digest(token);
  const sessions = new Map(), failures = new Map();
  const secure = new URL(publicUrl).protocol === 'https:';
  const cookieName = `${secure ? '__Secure-space_owner' : 'space_owner'}${siteId === 'zyt' ? '_zyt' : ''}`;
  const sessionId = (request) => (request.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  const prune = () => {
    for (const [key, expiry] of sessions) if (now() >= expiry) sessions.delete(key);
    for (const [key, record] of failures) if (now() >= record.until) failures.delete(key);
  };
  return {
    origin(request) {
      // Exact configured origin prevents CSRF and Host/DNS rebinding tricks.
      if (request.headers.origin !== new URL(publicUrl).origin || request.headers.host !== new URL(publicUrl).host) throw new ContentError(403, '请从站点配置的地址访问管理页面');
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw new ContentError(415, '请使用 JSON 请求');
    },
    authenticated(request) { prune(); return sessions.has(digest(sessionId(request)).toString('hex')); },
    require(request) { if (!this.authenticated(request)) throw new ContentError(401, '请先登录站主管理'); },
    login(request, response, body) {
      prune();
      const ip = request.socket?.remoteAddress || 'unknown';
      const record = failures.get(ip) || { count: 0, until: now() + 60000 };
      if (record.count >= 6 || failures.size >= 1024 && !failures.has(ip)) throw new ContentError(429, '登录尝试过多，请一分钟后重试');
      record.count++; failures.set(ip, record);
      if (typeof body?.token !== 'string' || body.token.length > 256 || !timingSafeEqual(digest(body.token), expected)) throw new ContentError(401, '访问口令不正确');
      failures.delete(ip);
      if (sessions.size >= 16) sessions.delete(sessions.keys().next().value);
      const id = randomBytes(32).toString('base64url');
      sessions.set(digest(id).toString('hex'), now() + 8 * 3600000);
      response.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${secure ? '; Secure' : ''}`);
    },
    logout(request, response) {
      sessions.delete(digest(sessionId(request)).toString('hex'));
      response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0${secure ? '; Secure' : ''}`);
    },
  };
}
