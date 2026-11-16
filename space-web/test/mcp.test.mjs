import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSpaceMcp } from '../src/mcp.mjs';
import { createAgentService } from '../src/agent.mjs';
import { createContentService } from '../src/content.mjs';
import { loadConfig } from '../src/config.mjs';
import { post } from './fixtures.mjs';

async function fixture(t, source) {
  const config = await loadConfig({ CONTENT_SOURCE: 'halo', PUBLIC_URL: 'https://portfolio.example' }, new URL('./absent.env', import.meta.url));
  let current = post();
  const content = source || createContentService(config, { fetchImpl: async (url) => Response.json(new URL(url).pathname.endsWith('/work-123') ? current : { items: [current], total: 1 }) });
  const agent = createAgentService({ config, content });
  const endpoint = createSpaceMcp({ config, agent });
  const client = new Client({ name: 'space-mcp-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL('https://portfolio.example/mcp'), { fetch: (input, init) => endpoint.fetch(new Request(input, init)) });
  t.after(async () => { await client.close(); await endpoint.close(); });
  await client.connect(transport);
  return { client, agent, unpublish: () => { current.spec.publish = false; } };
}

test('official SDK client discovers four read-only tools and reads profile, search, detail and resources', async (t) => {
  const { client } = await fixture(t);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ['get_profile', 'get_project', 'list_capabilities', 'search_projects']);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint));
  const profile = (await client.callTool({ name: 'get_profile', arguments: {} })).structuredContent;
  assert.equal(profile.agent.mcpUrl, 'https://portfolio.example/mcp');
  const found = (await client.callTool({ name: 'search_projects', arguments: { category: 'ai', q: 'AI' } })).structuredContent;
  assert.equal(found.total, 1);
  assert.equal(found.items[0].url, 'https://portfolio.example/#project/work-123');
  const detail = (await client.callTool({ name: 'get_project', arguments: { id: 'work-123' } })).structuredContent;
  assert.match(detail.description, /已发布正文/);
  assert.equal(detail.demo, false);
  assert.ok(!('metadata' in detail)); assert.ok(!('content' in detail));
  const capabilities = (await client.callTool({ name: 'list_capabilities', arguments: {} })).structuredContent;
  assert.deepEqual(capabilities.executableWorkflows, []);
  const resources = (await client.listResources()).resources;
  assert.equal(resources.length, 3);
  const read = await client.readResource({ uri: 'https://portfolio.example/api/projects' });
  assert.equal(JSON.parse(read.contents[0].text).total, 1);
});

test('unpublishing invalidates MCP search, detail and resources on the same client', async (t) => {
  const { client, unpublish } = await fixture(t);
  assert.equal((await client.callTool({ name: 'search_projects', arguments: {} })).structuredContent.total, 1);
  unpublish();
  assert.equal((await client.callTool({ name: 'search_projects', arguments: {} })).structuredContent.total, 0);
  const detail = await client.callTool({ name: 'get_project', arguments: { id: 'work-123' } });
  assert.equal(detail.isError, true); assert.match(detail.content[0].text, /不存在或已下线/);
  const index = await client.readResource({ uri: 'https://portfolio.example/api/projects' });
  assert.equal(JSON.parse(index.contents[0].text).total, 0);
});

test('tool schemas reject arbitrary URLs, oversized queries and unknown writes; backend errors are redacted', async (t) => {
  const { client } = await fixture(t, {
    getProfile: async () => { throw new Error('PRIVATE_BACKEND_SECRET'); },
    listProjects: async () => [], getProject: async () => { throw new Error('PRIVATE_BACKEND_SECRET'); },
  });
  const privateError = await client.callTool({ name: 'get_profile', arguments: {} });
  assert.equal(privateError.isError, true); assert.ok(!JSON.stringify(privateError).includes('PRIVATE_BACKEND_SECRET'));
  for (const call of [
    { name: 'search_projects', arguments: { q: 'x'.repeat(201) } },
    { name: 'search_projects', arguments: { size: 1000 } },
    { name: 'get_project', arguments: { id: 'http://localhost/admin' } },
    { name: 'publish_project', arguments: { id: 'work-123' } },
  ]) {
    // SDK revisions may return a tool error or reject the call at protocol level.
    let rejected = false;
    try { rejected = (await client.callTool(call)).isError === true; } catch { rejected = true; }
    assert.equal(rejected, true);
  }
});
