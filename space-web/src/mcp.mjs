import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation, originValidation } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { ContentError } from './content.mjs';
import { AGENT_TOOLS } from './agent.mjs';
import { assertRuntime } from './runtime.mjs';
import { publicSite } from './site.mjs';

export function createSpaceMcp({ config, agent }) {
  assertRuntime();
  const root = config.publicUrl || `http://127.0.0.1:${config.port || 4173}`;
  const hosts = [...new Set([new URL(root).hostname, 'localhost', '127.0.0.1', '[::1]'])];
  const validateHost = hostHeaderValidation(hosts);
  const validateOrigin = originValidation(hosts);
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: publicSite(config).slug, version: config.appVersion }, {
      instructions: '查询本站公开资料；保留 demo、authorship、source 与链接，不把参考案例当作个人成果。只读，不执行工作流。',
    });
    const schemas = {
      get_profile: z.object({}).strict(),
      search_projects: z.object({ q: z.string().max(200).optional(), category: z.enum(['all', 'ai', 'devops', 'agent', 'other']).optional(), tag: z.string().max(80).optional(), page: z.number().int().min(1).max(10000).optional(), size: z.number().int().min(1).max(20).optional() }).strict(),
      get_project: z.object({ id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/) }).strict(),
      list_capabilities: z.object({}).strict(),
    };
    const operations = {
      get_profile: () => agent.getProfile(), search_projects: (args) => agent.searchProjects(args),
      get_project: ({ id }) => agent.getProject(id), list_capabilities: () => agent.listCapabilities(),
    };
    for (const tool of AGENT_TOOLS) server.registerTool(tool.name, {
      title: tool.title, description: tool.description, inputSchema: schemas[tool.name],
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (args) => {
      try {
        const data = await operations[tool.name](args);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error instanceof ContentError ? error.message : '公开资料暂时无法读取，请稍后重试' }] };
      }
    });
    for (const [name, path, title, read] of [
      ['profile', '/api/profile', '公开介绍', () => agent.getProfile()],
      ['projects', '/api/projects', '公开作品索引（分页查询请使用 search_projects）', () => agent.searchProjects()],
      ['capabilities', '/api/capabilities', '可用查询能力与边界', () => agent.listCapabilities()],
    ]) server.registerResource(name, `${root}${path}`, { title, mimeType: 'application/json', description: '当前公开数据，不缓存草稿或私密内容。' }, async (uri) => {
      try { return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(await read()) }] }; }
      catch { throw new Error('公开资料暂时无法读取，请稍后重试'); }
    });
    return server;
  }, { maxRequestBodySize: 32768 });
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: 32768 });
  return {
    // Exposed for official SDK in-process client tests, not mounted as an API.
    fetch: handler.fetch,
    close: handler.close,
    async handle(request, response) {
      if (!validateHost(request, response) || !validateOrigin(request, response)) return;
      response.setHeader('Cache-Control', 'no-store');
      await nodeHandler(request, response);
    },
  };
}
