# 本地测试版试用

最新状态见 [M5 联合验收记录](m5-validation.md)：M5 本机测试版验收完成。发布/下线、真实 DeepSeek 更新读取/历史隔离、取消重试、原文恢复及真实备份/独立恢复/原环境复查均通过，46 项自动化测试与静态检查通过。后续可用 `npm run test:storage` 单独复验存储，无需重复请求模型。

当前面向 ARM Mac 本机联调；网站为独立 Node 服务，Halo 与 PostgreSQL 由 Docker Compose 运行。无需构建 Halo 核心，也无需为手写前台生成 dist。

## 启动与日常使用

首次从 Fork 根目录进入 `space-web/`：

```bash
npm ci
npm run dev
```

`dev` 保留已有配置，启动后台和网站。已运行的网站占用 4173 时，先在它的终端按 Ctrl+C；不要同时启动第二个网站。后台首次启动需等待就绪并在控制台完成初始化。已有后台无需重新导入案例或初始化。

- 网站：http://127.0.0.1:4173
- 内容后台：http://127.0.0.1:8090/console
- MCP：http://127.0.0.1:4173/mcp

后台已经运行时，单独用 `npm start` 启动网站。修改服务端 `.env` 后重启网站；凭据不要放进 `public/`。`npm run demo` 是显式示例模式，不能用来验收真实内容链路。

按 [后台使用说明](content-management.md) 上传素材、选择作品分类、填写来源与个人贡献、编辑正文并发布。当前实际验证过 PNG、MP4、TXT；DOCUMENT 上传类别已经启用。Markdown 直接上传未通过，PDF/Office 上传也未作真实验收。列表约 30 秒刷新，详情每次打开重新读取。

参考案例与多媒体测试作品继续保留示例标记。真实个人作品、履历和职责需由站主提供后替换。

## 检查入口

```bash
npm run check
npm test
npm run test:local
```

M5 完整本地联调用 `npm run test:m5`，需在普通终端运行且 Docker、网站和 Halo 已启动。顺序为静态检查、受控故障测试、公开 HTTP/MCP 检查、专用示例作品发布/草稿/下线联合检查及真实 DeepSeek 取消/重试、数据库与附件备份、独立恢复演练、原环境复查。真实模型请求预计 3 次（其中一次在收到首段文字后取消）；典型 401/429/超时由受控测试覆盖，不故意触发真实账户限额。

M5 在上述步骤前会验证 Node >=22 和 Web Crypto/fetch，并打印、记录实际运行文件。`crypto is not defined` 是 SDK 依赖的全局 Web Crypto 缺失，参考 [SDK 官方排错说明](https://ts.sdk.modelcontextprotocol.io/v2/troubleshooting#referenceerror-crypto-is-not-defined)。项目推荐 `.nvmrc` 的 Node 24；当前 Mac 已核实可用的 Homebrew 安装可这样调用：

```bash
PATH="/opt/homebrew/opt/node/bin:$PATH" npm run test:m5
```

该 PATH 只作用于本次命令；M5 子进程沿用同一 Node。其他机器按自己的安装方式切换 Node 22+。没有增加兼容旧 Node 的 shim，也没有改变全局环境。

总报告在 `artifacts/m5-result.json`，逐步记录，只有所有步骤完成才 passed=true。发布测试仅允许 `artifacts/integration-state.json` 指定且标题为“多媒体发布链路测试（示例）”的公开示例；使用本地 `local-admin.json` 凭据，不输出密码。不覆盖已有未发布草稿，修改前备份正文，普通失败也尝试恢复原正文并重新发布。它只操作内容，版本时间与内部快照记录会变化。强制结束进程时需要检查 `m5-publication-baseline.json`，不能保证自动恢复。

运行时暂勿编辑、上传或并行管理容器；预计数分钟。单独复验发布链路可运行 `npm run test:publication`，同样会修改/恢复该示例且调用真实模型。报告不会把模型取消等同于服务商已经停止计费。已有 Codex 主机与浏览器验收沿用各自记录，不重复调用 Codex。

前两项不依赖后台。`test:local` 在真实 Halo 模式下检查健康、公开作品与介绍、同源附件 HEAD、视频 Range，以及官方 SDK MCP 客户端读取；不修改内容、不调用 DeepSeek。当前测试数据需有 AI、DevOps 各一条公开作品，并至少有一个本地图片、视频和文档。一次最多检查前 100 条作品，并在报告中列出检查数与总数。

结果写入被忽略的 `space-web/artifacts/local-mvp-result.json`。本机网络权限拒绝与业务检查失败会分别标识；当前执行沙箱的网络拒绝不代表用户普通终端也无法访问。

Codex 是已通过的实际 MCP 主机，2026-11-06 v2 测试取得 6 次成功调用，覆盖四个工具，且回答保留两个案例的来源、示例属性及正确网页链接。重新测试用 `npm run test:codex`；需正常的 Codex 登录与模型网络，可按 [Codex 接入说明](codex-connection.md) 仅对该命令设置本机代理。该测试使用临时配置；永久登记仍按该文档自行选择。WorkBuddy 等客户端尚未验证。

真实 DeepSeek 问答已通过，模型配置与真实成功时间可查看 `/api/status`；配置为 true 不能单独证明模型成功。`test:local` 不再次调用模型，也不代替浏览器播放、模型停止/重试和内容修改后的完整验收。

## 备份与独立恢复演练

这组工具针对当前 Compose、PostgreSQL 17 与 Halo 的命名数据卷。采用 [PostgreSQL 逻辑备份](https://www.postgresql.org/docs/17/backup-dump.html) 和 [Docker 数据卷备份](https://docs.docker.com/engine/storage/volumes/)；不复制正在运行的 PostgreSQL 数据目录。

在普通终端、后台运行时执行：

```bash
npm run backup
```

执行期间请暂勿编辑或上传，也不要并行执行第二次备份或其他容器管理操作。工具先读取公开内容基线，再短暂停止 Halo，让数据库导出与附件归档处于静止状态；完成或普通失败后均尝试启动 Halo。网站在此期间会暂时无法读取后台。强制结束进程或机器断电无法保证执行清理；此时可在 `deploy/` 执行 `docker compose start halo`。若重新启动失败，工具会明确报错，且不会生成完成清单。

成功后输出新建备份目录，默认在被 Git 忽略的 `space-web/artifacts/backups/<时间>/`，目录不覆盖已有备份。包含：

- `database.dump`：数据库 custom 格式逻辑导出。
- `halo-data.tar.gz`：完整 Halo 数据卷，包含附件与本地配置。
- `volume-files.json`：数据卷普通文件的 SHA-256 基线。
- `public-content.json`：公开介绍与作品详情基线。
- `manifest.json`：完成标记、固定本机镜像 ID、文件大小和 SHA-256。

这些归档包含非公开内容和后台配置，属于私有备份；不要上传到网站附件或版本库。目录权限为 0700、文件为 0600。网站 `.env`、DeepSeek Key 和部署 `.env` 不单独复制，需保留自己的服务端配置。

将输出路径代入以下命令：

```bash
npm run backup:check -- /备份目录
npm run backup:rehearse -- /备份目录
```

`check` 不需要 Docker，核对完整清单和所有归档校验值。`rehearse` 先完成同样校验，再创建带随机后缀的独立网络、两个新卷、临时数据库和临时 Halo；不对外开放端口，不连接当前数据库。它在新数据库中事务性恢复数据，先核对附件等全部普通文件的哈希，再启动 Halo、比较公开介绍和作品详情，最后清理临时资源。失败也尝试清理；若清理失败，会打印仅针对这些临时资源的清理命令。

恢复报告在 `artifacts/restore-result.json`；未真正执行成功不能标记恢复验收通过。演练使用本机已安装的源镜像 ID，不隐式升级，不是跨架构迁移工具。只有自己创建且可信的备份才用于演练。现阶段不提供覆盖当前数据的恢复命令。

## 当前验收进度

| 项目 | 结果 |
| --- | --- |
| Halo 上传、发布、更新、下线、草稿隔离 | 真实通过 |
| 重启后作品、介绍、附件与上传策略保留 | 真实通过，M1 完成 |
| 桌面/390px 筛选、详情、图片、视频与下载 | 核心路径真实通过 |
| DeepSeek 流式回答、追问、未知职责、引用打开 | 真实通过 |
| SDK MCP 和 Codex 模型选择工具 | 真实通过，M4 完成 |
| 备份/恢复流程及失败处理 | 真实 Docker 演练通过：5 条作品/公开介绍恢复、数据卷文件哈希一致、原环境复查正常；5 项模拟测试覆盖异常路径 |
| 集中只读检查 test:local | 2026-11-06 真实通过：5 条作品、图片/视频/文档各 1、官方 SDK MCP；普通 CLI 沙箱仍有 HTTP 权限限制 |
| 真实编辑后网页/问答/MCP 联合复验 | 2026-11-06 真实通过，专用示例原文恢复已确认 |
| 真实取消与重试 | 真实流式请求收到首段后取消，重试成功 |
| 限流、认证、超时、断流错误状态 | 受控上游测试通过，未故意触发真实模型账户限额 |
| x86 Linux、公网 HTTPS、WorkBuddy | 后续阶段，尚未验证 |

M5 本机验收已完成。没有修改 Halo 核心或全局 Agent 配置，也没有提交、推送或公网部署。

本轮修正集中检查脚本对 Halo `/upload/` 原始媒体地址的识别，复用网页的地址转换；增加 2 项回归测试，自动化合计 39 项通过。真实联合验收脚本已就绪；本轮后台管理员端点访问未成功，检查在写操作前结束，没有修改示例作品。浏览器旧 TaskSpace 16 已不存在，没有新建空间绕过恢复限制。

历史修正：用户普通终端 M5 曾在 controlled_fault_tests 阶段因 crypto is not defined 失败，当时未执行作品修改或备份。新增运行时校验、固定子进程 Node，后续又修正后台认证及恢复判断，当前合计 46 项测试通过。最终联合验收与真实存储检查均已通过，不再需要用户重复处理这些历史问题。
