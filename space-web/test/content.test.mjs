import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseEnv } from '../src/config.mjs';
import { createContentService, isPublicPost, mediaUrl } from '../src/content.mjs';
import { contentUrl } from '../public/rich-content.js';

import { post } from './fixtures.mjs';

test('publication guard excludes drafts, recycled, private, scheduled and malformed records', () => {
  for (const value of [null, false, [], { metadata: null }, { spec: null }]) assert.equal(isPublicPost(value), false);
  assert.equal(isPublicPost(post()), true);
  const original = post();
  for (const changes of [{ publish: false }, { visible: 'PRIVATE' }, { deleted: true }, { releaseSnapshot: null }, { publishTime: '2999-01-01' }, { publishTime: 'invalid' }]) assert.equal(isPublicPost(post({ spec: { ...original.spec, ...changes } })), false);
  for (const changes of [{ deletionTimestamp: '2026-01-01' }, { labels: {} }, { labels: { 'content.halo.run/published': 'false' } }, { labels: { 'content.halo.run/published': 'true', 'content.halo.run/deleted': 'true' } }]) assert.equal(isPublicPost(post({ metadata: { ...original.metadata, ...changes } })), false);
});

test('profile rechecks publication before returning its biography', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const profile = post({ spec: { ...post().spec, title: 'Public name', slug: 'space-profile' } });
  const service = createContentService(config, { fetchImpl: async (url) => {
    if (new URL(url).search) return Response.json({ items: [profile], total: 1 });
    return Response.json({ ...profile, spec: { ...profile.spec, publish: false }, content: { content: 'private biography' } });
  } });
  const result = await service.getProfile();
  assert.equal(result.biography, '');
  assert.notEqual(result.name, 'Public name');
});

test('adapter uses public endpoints, returns published body and drops internal metadata', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const calls = [];
  const service = createContentService(config, { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json(new URL(url).pathname.endsWith('/work-123') ? post() : { items: [post(), post({ spec: { ...post().spec, publish: false } })], total: 2 });
  } });
  const items = await service.listProjects();
  const detail = await service.getProject('work-123');
  assert.equal(items.length, 1);
  assert.equal(detail.cover, '/media/halo/upload/cover.png');
  assert.equal(detail.demo, false);
  assert.match(detail.content.html, /已发布正文/);
  const result = JSON.stringify(detail);
  assert.ok(!/never-export|headSnapshot|draft-private|annotations|releaseSnapshot/.test(result));
  assert.ok(calls.every(({ url, options }) => url.startsWith(`${config.haloUrl}/apis/api.content.halo.run/v1alpha1/posts`) && !options.headers.Authorization));
});

test('unpublishing or removing the portfolio category invalidates old detail URLs', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  let current = post();
  const service = createContentService(config, { fetchImpl: async () => Response.json(current) });
  assert.equal((await service.getProject('work-123')).id, 'work-123');
  current.spec.publish = false;
  await assert.rejects(service.getProject('work-123'), { status: 404 });
  current = post({ categories: [] });
  await assert.rejects(service.getProject('work-123'), { status: 404 });
});

test('Halo failure stays an error instead of returning reference data', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const service = createContentService(config, { fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(service.listProjects(), { status: 503 });
  await assert.rejects(service.getProject('work-123'), { status: 503 });
});

test('pagination continues beyond Halo first page', async () => {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo' }, new URL('./absent.env', import.meta.url));
  const pages = [];
  const service = createContentService(config, { fetchImpl: async (url) => {
    const page = Number(new URL(url).searchParams.get('page')); pages.push(page);
    return Response.json({ items: page === 1 ? Array.from({ length: 100 }, (_, i) => post({ metadata: { ...post().metadata, name: `work-${i}` } })) : [post()], total: 101 });
  } });
  assert.equal((await service.listProjects()).length, 101);
  assert.deepEqual(pages, [1, 2]);
});

test('safe media paths reject active schemes and credentials, and encode Halo uploads through the proxy', () => {
  const base = 'http://127.0.0.1:8090';
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', '//user:secret@example.com/a', 'java\nscript:alert(1)', '\\example.com/a']) {
    assert.equal(contentUrl(value, base), '');
    assert.equal(mediaUrl(value, base), '');
  }
  assert.equal(contentUrl('/upload/my%20video.mp4', base), '/media/halo/upload/my%20video.mp4');
  assert.equal(contentUrl('https://example.com/demo', base), 'https://example.com/demo');
});

test('environment parsing never evaluates text and process variables take precedence', async () => {
  assert.equal(parseEnv('KEY="$(echo example)"\n# comment').KEY, '$(echo example)');
  assert.equal((await loadConfig({ CONTENT_SOURCE: 'demo' }, new URL('../.env.example', import.meta.url))).source, 'demo');
  await assert.rejects(loadConfig({ CONTENT_SOURCE: 'unknown' }, new URL('./absent.env', import.meta.url)));
  await assert.rejects(loadConfig({ HALO_URL: 'https://user:secret@example.com' }, new URL('./absent.env', import.meta.url)));
});
