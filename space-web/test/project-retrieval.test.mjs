import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProjects } from '../src/project-retrieval.mjs';

const items = [
  { id: 'ref', title: '开源运维参考', category: 'devops', tags: ['DevOps'], summary: '监控看板示例', demo: true },
  { id: 'cli', title: 'TeleAgent × 智护 CLI', category: 'agent', tags: ['AI', 'MCP', 'CLI'], summary: '通过 CLI 查询能力', demo: false },
  { id: 'alert', title: '告警分析与处置建议', category: 'devops', tags: ['AI', '告警'], summary: '告警归纳与建议', demo: false },
  { id: 'drill', title: '数字员工 · 故障下钻', category: 'agent', tags: ['AI', '故障诊断'], summary: '调用数字员工关联故障上下文', demo: false },
];
const ids = (q, history = [], projects = items) => selectProjects(projects, q, history).map((p) => p.id);

test('identity, model, greeting, weather and unrelated questions have no ornamental project references', () => {
  const history = [{ role: 'assistant', projectIds: ['cli', 'alert', 'ref'] }];
  for (const q of ['你好', '你是谁', '你是什么model', '你使用哪个模型', '帮我查今天的天气', '明天会下雨吗', '量子企鹅吃什么']) assert.deepEqual(ids(q, history), [], q);
});

test('concrete titles and Chinese fragments find the matching work without appending unrelated projects', () => {
  assert.deepEqual(ids('介绍一下TeleAgent × 智护 CLI'), ['cli']);
  assert.equal(ids('TeleAgent 如何使用').at(0), 'cli');
  assert.equal(ids('故障下钻是怎么做的').at(0), 'drill');
  assert.equal(ids('告警分析的过程').at(0), 'alert');
  assert.deepEqual(ids('介绍开源运维参考'), ['ref']);
});

test('personal work requests exclude references and generic recommendations prefer owned works', () => {
  assert.deepEqual(new Set(ids('介绍站主的个人作品')), new Set(['cli', 'alert', 'drill']));
  assert.equal(ids('推荐一些作品')[0], 'cli');
  assert.ok(!ids('你的DevOps项目有哪些').includes('ref'));
  assert.deepEqual(ids('介绍个人作品', [], [items[0]]), []);
  assert.ok(ids('这里有哪些 DevOps 案例').includes('ref'));
});

test('follow-ups reuse only the most recent public references; new subjects supersede older themes', () => {
  const history = [{ role: 'user', content: '看告警' }, { role: 'assistant', projectIds: ['alert'] }, { role: 'user', content: '看CLI' }, { role: 'assistant', projectIds: ['cli', 'removed'] }];
  assert.equal(ids('再讲一下具体职责', history)[0], 'cli');
  assert.deepEqual(ids('再讲一下具体职责', history, items.filter((p) => p.id !== 'cli')), []);
  assert.deepEqual(ids('介绍一下告警分析与处置建议', history), ['alert']);
  assert.notEqual(ids('有哪些DevOps案例', history)[0], 'cli');
  assert.ok(ids('有哪些DevOps案例', history).includes('alert'));
  assert.ok(ids('继续解释这个项目', history).length <= 4);
});
