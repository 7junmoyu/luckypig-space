import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { pathToFileURL } from 'node:url';
import { assertRuntime } from '../src/runtime.mjs';

// An actual SDK client. No LLM or private credentials are required.
export async function verifyAgent({ baseUrl = 'http://127.0.0.1:4173', fetchImpl = fetch } = {}) {
  assertRuntime();
  const client = new Client({ name: 'luckypig-space-local-client', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), { fetch: fetchImpl }));
    const tools = (await client.listTools()).tools;
    for (const name of ['get_profile', 'search_projects', 'get_project', 'list_capabilities']) if (!tools.some((tool) => tool.name === name)) throw new Error(`Missing tool ${name}`);
    const profile = await client.callTool({ name: 'get_profile', arguments: {} });
    if (profile.isError || !profile.structuredContent?.name) throw new Error('Profile read failed');
    const results = {};
    for (const category of ['ai', 'devops']) {
      const result = await client.callTool({ name: 'search_projects', arguments: { category, size: 5 } });
      if (result.isError || !result.structuredContent?.items?.length) throw new Error(`No public ${category} work found`);
      const item = result.structuredContent.items[0];
      const detail = await client.callTool({ name: 'get_project', arguments: { id: item.id } });
      if (detail.isError || detail.structuredContent?.id !== item.id || !detail.structuredContent?.url) throw new Error(`Detail read failed for ${category}`);
      results[category] = { id: item.id, title: item.title, url: detail.structuredContent.url, demo: item.demo, authorship: item.authorship };
    }
    const resources = (await client.listResources()).resources;
    const capabilities = await client.callTool({ name: 'list_capabilities', arguments: {} });
    if (capabilities.isError || capabilities.structuredContent?.executableWorkflows?.length !== 0) throw new Error('Read-only capability boundary incorrect');
    console.log(JSON.stringify({ officialSdkClient: 'passed', endpoint: `${baseUrl}/mcp`, tools: tools.map((tool) => tool.name), resources: resources.length, results }, null, 2));
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await verifyAgent({ baseUrl: process.env.SPACE_URL || 'http://127.0.0.1:4173' }); }
  catch (error) {
    let cause = error, denied = false;
    for (let i = 0; cause && i < 5; i++, cause = cause.cause) if (['EPERM', 'EACCES'].includes(cause.code)) denied = true;
    console.error(denied ? 'Agent 检查未能执行：当前进程无权访问 HTTP，请在普通终端运行；这不代表 MCP 服务未启动。' : `Agent 检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
