import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerFromContent } from '../public/content.js';
import { assertRuntime } from '../src/runtime.mjs';

assertRuntime();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (path) => readFile(resolve(root, path), 'utf8');
const projects = JSON.parse(await readFile(new URL('../fixtures/projects.json', import.meta.url), 'utf8'));
const profile = JSON.parse(await readFile(new URL('../fixtures/profile.json', import.meta.url), 'utf8'));
assert.equal(projects.length, 4);
assert.equal(new Set(projects.map((p) => p.id)).size, projects.length);
assert.equal(profile.chat.llmConnected, false);
assert.equal(profile.agent.mcpAvailable, false);
for (const project of projects) {
  assert.equal(project.demo, true);
  assert.ok(project.authorship.includes('非站主'));
  assert.equal(new URL(project.source.url).protocol, 'https:');
  assert.ok(project.steps.length > 0 && project.title && project.summary);
}
assert.equal(answerFromContent(projects, '推荐一个 AI 创作案例').links[0].id, 'comfy-workflow');
assert.ok(answerFromContent(projects, '这里有哪些 DevOps 案例？').links.every((link) => projects.find((p) => p.id === link.id).category === 'devops'));
assert.equal(answerFromContent(projects, 'RAG 知识助手').links[0].id, 'knowledge-agent');
assert.equal(answerFromContent(projects, `介绍一下${projects[0].title}`).links[0].id, projects[0].id);
assert.ok(answerFromContent(projects, '介绍你的工作经历').text.includes('没有录入'));
assert.ok(answerFromContent(projects, 'MCP 服务怎么接入').text.includes('还没有运行 MCP'));
assert.ok(answerFromContent(projects, '明天会下雨吗').text.includes('没有足够资料'));
const html = await read('index.html');
const app = await read('app.js');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML element IDs must be unique');
for (const match of app.matchAll(/\$\('#([\w-]+)'\)/g)) assert.ok(ids.includes(match[1]), `Missing element #${match[1]}`);
for (const match of html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g)) assert.ok((await stat(resolve(root, match[1]))).isFile(), `Missing file ${match[1]}`);
assert.ok(!(html + app).match(/pat_[a-zA-Z0-9]{12,}|sk-[a-zA-Z0-9]{20,}/), 'No API credentials should be embedded');
for (const file of ['style.css', 'content.js', 'assets/media.js', 'data/reference-notes.md', 'llms.txt', 'sources.html']) await stat(resolve(root, file));
console.log(`Checks passed: ${projects.length} attributed demo cases; 7 query, unknown-fact, and capability-boundary scenarios; DOM references; local assets; no embedded API credentials.`);
