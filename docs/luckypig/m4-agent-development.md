# Agent 接入开发记录

日期：2026-11-05，网站版本 0.3.0。用户明确允许测试验收滞后，当前继续功能开发，遗留验收不视为通过。

2026-11-06 更新：M4 已完成。用户普通终端 Codex v2 报告 passed=true，原始事件有 turn.completed 和 6 次成功调用，覆盖四工具；最终回答与真实数据一致，参考案例、职责未知和只读边界保留正确。全局配置未修改。下方早期未验收说明为历史；最新证据见 [Codex 接入说明](codex-connection.md)。WorkBuddy、公网、实际执行工作流仍不在本次通过范围。

## 本轮交付

- 网站同一进程提供 `/mcp`，采用官方 SDK v2 `createMcpHandler` 与 Node HTTP 适配，无状态 Streamable HTTP。
- 四个只读工具：`get_profile`、`search_projects`、`get_project`、`list_capabilities`。三个公开资源：介绍、作品索引、能力边界。
- 每次通过现有公开内容服务读取，不缓存草稿或下线作品；工具结果保留 demo、作者贡献、来源、稳定 ID 和可点击网页地址。
- 接入清单 `/api/agent`、能力目录 `/api/capabilities`，动态 `llms.txt`；不存在可执行的个人创作工作流。
- 下载 Skill `/agent/skill/SKILL.md` 和客户端配置示例 `/agent/mcp.json`，没有自动修改任何用户客户端或安装全局 Skill。
- 网页新增 MCP 地址复制、配置/Skill 下载、查询接口与能力边界。会话导览同步认识新接入状态。
- `PUBLIC_URL` 统一控制 MCP、Skill、引用和接入清单的规范地址；不信任请求 Host 来生成链接。MCP Host/Origin 按官方 SDK 进行校验。

依赖固定：`@modelcontextprotocol/server` 2.4.0、Node 适配 2.1.2、Zod 4.6.7；官方客户端 2.4.0 仅用于开发检查。版本与包完整性记录在 package.json / package-lock.json；新环境先 `npm ci`。

依据：实际读取的 [官方 SDK 仓库](https://github.com/modelcontextprotocol/typescript-sdk) 与 [v2 HTTP 文档](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)。未复用或修改 Halo 后台现有 AI Foundation/MCP 插件。

## 基础检查结果

- `npm test` 32 项、`npm run check` 通过。
- 官方 SDK 客户端在进程内完成工具发现、资源读取、参数校验，以及同一客户端下作品下线后搜索/详情/资源同步失效。
- 真实 HTTP：`scripts/verify-agent.mjs` 经 ego-browser Node 运行时连接 `http://127.0.0.1:4173/mcp` 成功；发现四个工具与三个资源，读取介绍，搜索并获取 AI / DevOps 作品详情。结果标注参考案例与非站主个人成果。
- AI 示例：`space-ref-comfy-workflow`，标题“灵感的下一种形状”；DevOps 示例：`space-ref-observability`，标题“看见系统，听懂信号”。均返回实际网页链接和作者贡献。
- 普通 CLI `npm run test:agent` 的本机网络访问被当前执行环境拒绝，不能据此判断服务故障；没有修改网络或 Docker 权限。可在用户普通终端直接运行该命令。
- Skill 经 `skill-creator` 官方 `quick_validate.py` 验证通过。系统 Python 缺少 PyYAML，在 `/private/tmp/luckypig-skill-validation/.venv` 临时环境安装后验证，没有为网站引入 Python 运行时依赖。

浏览器已实际完成 MCP 地址复制、原生下载 Skill 与配置文件，落盘内容与预期站点地址一致；390px 下弹窗可用内容宽度与滚动宽度均为 350px，无横向溢出。聊天中的连接入口直接打开说明，不依赖模型配置。

## 后续统一验收

桌面 Agent 主机中的安装与模型自主选择工具、公网访问、真实内容编辑后跨入口更新、跨架构运行等留待后续完整验收。当前官方 SDK 测试客户端的成功不等于所有 Agent 产品都已验证。

DeepSeek 真实核心问答已于 2026-11-06 通过；重启持久化也已通过；备份恢复仍待完成；按用户要求不以这些待验收项阻塞本轮开发。没有提交或推送代码，没有公开部署。

## Codex 主机测试进度（2026-11-06）

用户选择 Codex 作为首个实际主机，后续考虑 WorkBuddy 等国产常用 Agent。已准备 Codex TOML 模板、只读测试脚本与 [接入说明](codex-connection.md)。本机已登录，但执行沙箱拒绝 Codex 内部 app-server 初始化，尚无实际工具调用；已请用户在普通终端执行测试。不把配置被识别或 SDK 客户端通过当作 Codex 主机完整通过。

用户终端已执行第一版 Codex 验收：远端模型/工作区路由连接超时，未调用本站工具。测试脚本已更新 v2 以隔离默认应用并修正仅测试进程的代理传递，具体见 Codex 接入说明；仍待真实重跑结果。
