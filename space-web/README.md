# Luckypig Space 网站

独立前台与网站应用服务。保留陶土橙界面，使用 Halo 管理内容，网页、会话与 Agent 共用公开数据读取层。

ZYT 使用独立文件资料模式，不要求 Halo。新开发者请先看[ZYT 二开说明](docs/zyt-development.md)和[项目文件与视频上传说明](docs/content-upload.md)。npm Skill [记录为待实现](docs/roadmap.md)，本轮不开发网页内容管理。

2026-11-16：ZYT 已由用户部署至公网，当前为三项项目、七组技能。仓库内可运行 `npm run start:zyt` 独立启动，默认4174，不依赖仓库外的工作区。模型配置和管理口令与原站隔离。共享模板在 `src/templates/`，修改后 `npm run site:sync` 保持默认站静态页面同步。双站规格评估见[服务器容量建议](../docs/luckypig/server-sizing.md)。下文真实 Halo 验收记录属于原 Luckypig 站，不代表 ZYT 已接入 Halo 或网页上传。

2026-11-11：N3发布包源码已提供，[部署说明](../deploy/release/README.md)、[验证记录](../docs/luckypig/n3-release-validation.md)。`npm run release:prepare -- --platform linux/amd64`生成白名单源码与SHA-256清单，`npm run release:check -- --directory /发布包`核对，`npm run image:build -- --platform linux/arm64`在普通终端构建本机架构；x86使用linux/amd64。70项测试/静态检查、两架构源码包与Compose schema通过；用户主机已完成amd64目标构建，metadata/源码哈希已复核，实际架构inspect/运行与公网部署待验。

2026-11-08：新增面试导览、个人/参考来源筛选和分享；模型检索只引用匹配作品，身份/型号/天气不附无关作品。65项测试与静态检查通过；新页面/手机和真实模型新检索效果待验。后续路线见[开发计划](../docs/luckypig/post-mvp-plan.md)。

面试入口为 `/?scope=personal&view=interview#projects`，也可点击主导航“面试导览”或作品区“复制面试展示链接”。范围仅认内容层 `demo=false`，不会混入参考/测试；刷新、分类/标签筛选及作品链接保留状态。新前端文件刷新可读；服务端检索修改在正常重启网站后加载，内容服务不需重启。

**2026-11-06：M5 本机测试版验收完成。** 真实内容发布/下线、DeepSeek 更新读取与取消重试、Codex MCP、数据库及附件独立恢复、原环境复查均通过；46 项测试和静态检查通过。见 [M5 验收记录](../docs/luckypig/m5-validation.md)。该记录是首批个人录屏导入前的验收基线。

首批个人作品现已录入：TeleAgent × 智护 CLI、告警分析与处置建议、数字员工 · 故障下钻。视频优先展示，支持章节与倍速；后续直接在 Halo 后台修改初稿。当前共 8 条公开内容，3 条为用户提供的个人开发演示，具体职责与实现细节仍待补充；新功能累计 48 项测试通过。详见 [录屏作品记录](../docs/luckypig/recordings-v1.md)。

当前：网站已使用真实 Halo 数据。图片/MP4/TXT 上传、发布/更新/下线、草稿隔离、中文作品字段、桌面与手机浏览均已验证；M1 重启持久化已于 2026-11-06 验收通过，阶段完成。DeepSeek 服务端适配、多轮、流式、停止/重试已实现，已配置本机 Key，官方认证及真实网页流式回答、追问、作品引用已通过；只读 MCP 与 Skill 已提供，官方 SDK 客户端连通检查通过。详见 [实际联调记录](../docs/luckypig/halo-live-validation.md)。

## 启动内容后台和网站

推荐 Node.js 24 LTS（`.nvmrc`），需 Docker Engine 与 Compose。首次运行先执行 `npm ci` 安装已锁定的 MCP SDK 与校验依赖。后续 `npm start` 无需编译前端。

运行时最低 Node.js 22，需要全局 Web Crypto 与 fetch。`npm run runtime` 会打印实际 Node 路径、版本与能力。测试和 MCP 启动前会校验，M5 报告也记录运行时，子进程沿用当前 Node，避免终端 PATH 中混用旧版本。

若出现 `crypto is not defined`，先切换到 `.nvmrc` 的 Node 24。当前开发 Mac 已确认 Homebrew 的 `/opt/homebrew/opt/node/bin/node` 为 24.4.0，可仅对本次命令使用 `PATH="/opt/homebrew/opt/node/bin:$PATH" npm run test:m5`；不修改全局配置。该路径是本机便利方式，其他机器使用自己的 Node 22+ 安装位置。

从 Fork 仓库根目录运行：

```bash
cd space-web
npm ci
npm run dev
```

此命令保留已有配置，首次生成被忽略的 `.env`，为数据库生成随机密码，启动 Halo + PostgreSQL，最后以 Halo 内容模式启动网站。首次镜像拉取后在 http://127.0.0.1:8090/console 完成初始化。网站为 http://127.0.0.1:4173 。如果已有网站进程占用此端口，请先停止原预览。

关闭网站不会删除后台容器或数据。停止后台在 `deploy/` 执行 `docker compose down`；日常操作不要加 `-v`，以免删除命名数据卷。

## 仅预览示例

```bash
npm run demo
```

明确选择演示模式，不需要 Docker。示例保存在服务端 `fixtures/`，页面只访问公开 API。使用 Halo 模式时，连接失败会返回错误，不会自动切换到示例。

`npm start` 根据进程环境与本地 `.env` 启动网站，不负责启动 Docker。`npm run dev` 显式使用 Halo 模式，不受 `.env` 中 demo 设置影响。

## 内容管理

`content/recordings.json` 保存首批录屏说明初稿，实际维护以 Halo 后台为准。导入脚本 `npm run import:recordings` 仅用于首次导入已准备好的本地展示素材，不覆盖已有文章；当前已完成，无需重跑。`npm run test:recordings` 只读核对这三件作品、媒体哈希/Range及MCP；如需再次调用一次真实问答，可显式使用 `RECORDINGS_CHAT_CHECK=1 npm run test:recordings`。结果在被忽略的 `artifacts/recordings-validation.json`。

详见 [后台使用说明](../docs/luckypig/content-management.md)。作品使用“文章 + space-project 分类 + 正文多媒体 + 少量自定义元数据”，个人介绍使用别名 `space-profile` 的公开文章。

自建上传样本位于 `fixtures/upload-samples/`，包含图片、3 秒 MP4、Markdown 与 TXT。真实 Halo 已上传 PNG/MP4/TXT；本地存储策略需允许 DOCUMENT，Markdown 直接上传未通过。静态演示模式仍使用原 Markdown 样本。素材均为功能测试，不代表个人履历或 AI 创作成果。

分类、标签、搜索和页码保存在 URL 中，可刷新恢复，详情返回保留筛选；每页四条。资料未变化时不会重建作品卡片，以免自动刷新打断点击和键盘焦点。个人介绍也会随公开内容刷新。

## 公开接口

| 地址 | 内容 |
| --- | --- |
| `/api/projects?q=&category=&tag=&page=1&size=12` | 公开作品分页、分类、标签与搜索，size 上限 100 |
| `/api/projects/{id}` | 按 Halo metadata.name 读取当前公开版本 |
| `/api/profile` | 公开个人介绍 |
| `/api/status` | 配置的数据模式和实际接入边界 |
| `/api/health` | 实际读取内容服务的健康检查 |
| `/llms.txt` | 动态公开资料索引 |
| `/mcp` | Streamable HTTP MCP，四个只读工具和三个公开资源 |
| `/api/agent` | 接入清单、规范地址、Skill 和配置链接 |
| `/api/capabilities` | 实际接入的查询工具与能力边界 |
| `/agent/skill/SKILL.md` | 下载可安装目录使用的单文件 Skill |
| `/agent/mcp.json` | 下载使用 url 字段的 MCP 客户端配置示例 |
| `/media/halo/upload/...` | 同源访问 Halo 公开附件，支持 Range 与 HEAD |
| `/api/chat` | POST `{question, history?, webSearch?}`；支持 JSON 或 `Accept: text/event-stream`，读取当前公开资料后请求模型 |

`/data/projects.json` 和 `/data/profile.json` 是同一内容服务的兼容入口，不是静态资料副本。所有公开数据接口使用 no-store；列表客户端每 30 秒重读，详情每次打开重新读取。图片/视频使用浏览器原生组件；任意 HTML、脚本与 iframe 不会直接注入正文。

## 网页模型设置与联网搜索

2026-11-08 用户普通终端真实验收已通过：管理登录、密钥不回显、`deepseek-flash` 连接成功，测试未改配置。报告为 `artifacts/model-settings-live.json`（05:17:12.478Z）。搜索未启用/未测试；新管理页交互与真实保存切换仍待验。详见下方验收记录，无需重复启动或重跑已通过测试。

访问网站页脚“站主设置”，或直接打开 http://127.0.0.1:4173/admin 。首次登录在网站项目目录的普通终端运行：

```bash
npm run owner:token
```

口令只在本机终端显示，不发到聊天。管理登录与 Halo 密码独立，使用 8 小时有效的 HttpOnly/SameSite Cookie；退出或重启网站会使会话失效。必须使用 `PUBLIC_URL` 配置的完整站点地址登录和保存（本机为 `127.0.0.1:4173`，不要混用 localhost）。

管理页支持 DeepSeek 或 OpenAI 兼容 Chat Completions 接口、Base URL、模型 ID、替换/清除 Key、请求超时，以及模型实际生成测试。测试使用当前填写内容，不保存；保存后下一轮生效，进行中的请求保留原配置。更换 API 源地址必须提供新 Key，不向新服务复用旧 Key。DeepSeek 专用参数仅用于所选 DeepSeek 类型；其他原生协议和特殊模型参数暂未适配。

联网使用独立的 [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search) Key，在同一页面填写、测试并开启。访客在会话中勾选“联网搜索”，网站会将**当前问题**发送给 Tavily，再将最多 4 条网页摘要与站内公开资料交给模型。回答下方区分站内作品与外部网页链接。搜索失败明确报错，不假装联网成功；网页摘要不保证实时，天气等需要地点、日期和有效来源。未开启/未配置时访客开关不可用。MCP 仍为原先的四个公开只读工具，不向外部 Agent 暴露站主设置或搜索 Key。

`.local/owner-token` 与 `.local/model-settings.json` 是被 Git 忽略的服务端私有文件（目录 0700，文件 0600）。保存过的模型/搜索配置优先于 `.env` 初始值；显式 `CHAT_MODE=local-demo` 仍只做本地检索。部署迁移须单独保管并迁移 `.local/`，不能放到 `public/`；原 Halo 数据备份不含这些网站凭据。

`npm run test:settings` 在普通终端验证真实管理 HTTP，不修改配置、不默认调用付费服务；`SETTINGS_TEST_MODEL=1 npm run test:settings` 额外发送一次短模型请求，`SETTINGS_TEST_SEARCH=1` 额外测试已配置搜索。结果为忽略的 `artifacts/model-settings-live.json`，不含 Key。代码/验收状态见 [设置与联网记录](../docs/luckypig/model-settings-v1.md)。

## 环境文件中的模型初始配置

在本机 `space-web/.env` 添加以下服务端配置；不要把 Key 发到聊天、写入 `public/` 或提交到 Git：

```dotenv
CHAT_MODE=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
DEEPSEEK_API_KEY=在本机填写
LLM_TIMEOUT_MS=60000
```

尚未在管理页保存时，修改环境配置后需重启网站 `npm start`（仅网站进程，无需重建 Halo）；已保存的管理页配置优先。当前默认模型依据 2026-11-05 的 [DeepSeek 官方接口文档](https://api-docs.deepseek.com/api/create-chat-completion/) 核查，模型名称可以调整；地址可带 `/v1`，不要重复填写 `/chat/completions`。DeepSeek 类型使用 `thinking: disabled`；其他兼容服务请选择 `openai-compatible`，不发送该专用参数。

未配置 Key 会明确提示，仍可正常浏览作品。只有显式 `CHAT_MODE=local-demo` 才使用本地检索，模型失败不会自动伪装成本地成功。`npm run demo` 同时启用示例内容与本地检索。

会话只在当前页面内存中保存最近四轮，刷新或“新会话”清空。问题与相关公开内容将发送给配置的模型服务。每轮重新检索最多四件公开作品；历史助手依据由当前公开记录重建，不把旧回答或客户端任意助手文本当成事实。下方“本轮检索依据”由服务端生成，模型输出仅作纯文本展示。停止、关闭对话或新建会话会取消正在生成的请求；重试不会重复用户消息。

问题上限 1000 字；历史最多 8 条/16000 字；回答最多 1600 tokens/8000 字；请求默认 60 秒超时，最多 2 个并发，同一来源地址每分钟 10 次。当前不信任 `X-Forwarded-For`，反向代理后的限额会共享代理来源，公开部署前需配置可信代理策略。没有长期保存会话的功能。

2026-11-06 新 Key 的官方认证与真实网页核心问答已通过，之前 401 为旧凭据测试。`test/chat.test.mjs` 的模拟上游和 `scripts/browser-chat-check.mjs` 的浏览器模拟流只验证行为，不代表已调用 DeepSeek。详见 [会话开发与验收](../docs/luckypig/m3-chat-validation.md)。

## Agent 接入

网页“连接 Agent”可复制 MCP 地址、下载客户端配置示例与 Skill 文件。默认地址 `http://127.0.0.1:4173/mcp`，可由支持 Streamable HTTP 的客户端连接；本地地址仅对同机客户端可达。配置示例使用 `mcpServers` + `url` 结构，导入方式随客户端而异，不会自动修改你的客户端配置。

工具为 `get_profile`、`search_projects`、`get_project`、`list_capabilities`；全部只读，不调用 DeepSeek，也不执行创作任务、发布内容或操作集群。搜索支持 q、category、tag、page、size（MCP 每页最多 20）；详情和资源每次读取当前公开内容。Skill 与 MCP 保留参考性质、作者贡献和来源，不声明尚未提供的个人履历。

Skill 源码在 `agent-skills/luckypig-space/SKILL.md`。下载后放入客户端支持的 Skill 根目录下的 `luckypig-space/SKILL.md`；此项目不会自动安装到用户全局目录。文件本身无需 MCP 也能引导支持 HTTP 的 Agent 读取公开 API。

部署到可访问的域名时，在服务端 `.env` 设置 `PUBLIC_URL=https://你的域名` 并重启网站；MCP、Skill、索引、配置与引用地址会统一替换。仅支持站点根路径；不从不可信 Host 请求头生成链接。MCP 按官方 SDK 验证 Host 和 Origin；反向代理需保留对应 Host。当前不提供跨站浏览器 CORS 放行，桌面/本地客户端的 HTTP 接入不受此影响。

执行 `npm run test:agent` 可使用项目内官方 SDK 测试客户端连接当前网站，读取介绍、搜索 AI/DevOps 作品、获取详情和列举资源。可设置 `SPACE_URL` 指向另一测试站点。当前执行沙箱的普通 CLI 无权连接本机 HTTP，同一脚本已通过 ego-browser Node 运行时完成真实 HTTP 检查；不要把普通 CLI 的权限错误误报为 MCP 服务故障。桌面 Agent 主机中的模型选工具、安装体验及公网验收后补。

技术实现采用官方 [SDK v2 HTTP 工厂与 Node 适配](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html)，SDK 处理协议与旧版无状态客户端兼容，不手写 JSON-RPC 分发。版本锁定在 package.json / package-lock.json。

### Codex 真实主机验收

首个实际主机选择 Codex。按 [Codex 接入说明](../docs/luckypig/codex-connection.md) 登记 MCP，或在普通终端运行 `npm run test:codex` 使用临时配置完成测试；模板在 `agent-clients/codex.toml`。测试沿用已有 Codex 登录与默认模型，不需要网站 DeepSeek Key。

2026-11-06 用户普通终端 Codex v2 验收已通过：6 次成功调用覆盖四工具，AI/DevOps 案例链接与来源正确，保留参考属性和只读边界；没有修改全局配置。早期沙箱拒绝与 v1 超时已保留为历史记录。WorkBuddy 等国产 Agent 是后续适配目标，需分别验证。

## 本地试用与备份

完整流程见 [本地试用说明](../docs/luckypig/local-trial.md)。`npm run test:local` 集中检查真实公开内容、本地媒体与 SDK MCP，不调用付费模型；结果位于被忽略的 `artifacts/local-mvp-result.json`。

`npm run test:m5` 在普通终端一次执行本地集成验收，包含专用示例作品更新/下线、3 次真实模型请求（含一次取消）和独立备份恢复；运行期间暂勿编辑或上传。总报告为 `artifacts/m5-result.json`。此命令会修改并恢复约定的示例作品，具体前置条件和限制见试用说明。

联合发布、真实问答、取消重试、原文恢复及真实存储验收均已通过。后续可用 `npm run test:storage` 单独复验备份、独立恢复与原环境，不重新请求模型。结果为 `artifacts/m5-storage-result.json`，综合记录为 `artifacts/m5-acceptance.json`。

`npm run backup` 创建数据库与 Halo 数据卷的私有备份，期间短暂停止 Halo，并在完成或失败后尝试启动。`npm run backup:check -- /备份目录` 校验归档；`npm run backup:rehearse -- /备份目录` 使用全新临时容器与卷演练恢复，不覆盖当前数据。具体限制、恢复报告和清理方式以试用说明为准。真实恢复验收已由用户普通终端执行通过，5 项模拟 Docker 测试覆盖异常路径；当前执行沙箱仍无 Docker socket 权限。

## 工程目录

- `public/`：手写 HTML/CSS/JS 源码，需要提交到 Git；不是构建产物。
- `src/`：配置、公开内容适配、HTTP 服务。
- `schema/`：公开数据契约。
- `agent-skills/`：对外分发的 Skill 源码。
- `agent-clients/`：客户端接入模板。
- `fixtures/`：服务端演示内容与上传样本；演示模式仅通过文件白名单公开三个多媒体测试文件，不暴露整个目录。
- `test/`：公开状态、接口与媒体流行为测试。
- `../deploy/`：本地 Halo 与 PostgreSQL 的 Compose 配置。

根目录原型 `../../web/` 保留作视觉基线，后续开发以本目录为准。没有修改 Halo 的 Java/Vue 核心、权限或数据库结构。

## 验证

```bash
npm run check
npm test
npm run halo:wait
npm run test:halo
npm run test:agent
```

前两个命令不要求 Docker；`test:halo` 必须连接已初始化并发布了测试作品的真实 Halo，检查真实图片/视频/文档与视频 Range 响应，不能以模拟接口的成功替代。浏览器检查脚本 `scripts/browser-check.mjs`、`browser-content-check.mjs` 需通过 ego-browser 的 nodejs 运行；详见验收记录。

已核查 npm 脚本实际运行于 Node.js 24.4.0 / ARM64，检查与测试在该环境通过；终端直接调用 node 的版本可能不同，可运行 `npm run runtime` 核对。实际容器报告 Linux aarch64、Halo 2.27.2、PostgreSQL 17.11；x86-64 构建与运行尚未验证，镜像 digest 尚未锁定。沙箱可能禁止命令行 HTTP，但浏览器和网站服务正常；检查失败时先区分权限与后台健康状态。

公开参考素材仍可运行 `npm run assets` 下载，状态记录在 `public/assets/download-status.json`；这与后台上传自己的作品无关。
