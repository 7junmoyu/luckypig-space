# Codex 接入与真实客户端验收

更新时间：2026-11-06。用户选择 Codex 作为第一种实际验收客户端；WorkBuddy 等国产常用 Agent 是后续适配目标，尚未声称兼容或验收通过。

**最新结果：Codex v2 真实主机验收通过。** 用户普通终端报告时间为 2026-11-06T01:59:02.985Z，exitCode=0、timedOut=false、passed=true；原始 JSONL 有 turn.completed。共 6 次成功工具调用：get_profile、search_projects 两次、get_project 两次、list_capabilities，覆盖全部四工具。AI 与 DevOps 案例分别为 space-ref-comfy-workflow、space-ref-observability；回答字段与工具返回一致，保留 demo=true、非个人成果和正确链接，未声称能够执行工作流。globalConfigModified=false。下方沙箱拒绝与第一版超时保留作历史排查记录，不代表当前状态；无需重复要求用户重跑。

## 当前接入

网站保持运行：http://127.0.0.1:4173。MCP：http://127.0.0.1:4173/mcp。

在本机普通终端登记服务器：

```bash
codex mcp add luckypig-space --url http://127.0.0.1:4173/mcp
codex mcp get luckypig-space
```

该命令由用户执行，写入用户自己的 Codex 配置。本任务执行沙箱不能写入 `~/.codex/`，因此没有直接修改此文件。MCP 是公开只读接口，不需要 DeepSeek Key、Halo 管理员密码或 OAuth 登录。

另一种方式是将 `space-web/agent-clients/codex.toml` 中的表合并到 Codex 配置；不要覆盖其他已有配置。此 TOML 文件也可以作为项目配置的模板。

根据 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)，同一 Codex 主机上的桌面、CLI 和 IDE 客户端共享配置；项目 `.codex/config.toml` 仅在受信任项目中生效。桌面端可在设置的 MCP servers 中添加 Streamable HTTP 地址，保存后重启连接。

## 运行真实 Codex 测试

```bash
cd /Users/zhuhaoran/workspace/Git/luckypig/luckypig-space/space-web
npm run test:codex
```

测试使用本机已有 Codex 登录与默认模型，不读取网站的 DeepSeek Key。它只在临时目录启动一次只读 Codex 会话，通过进程内覆盖仅启用本站 MCP，并关闭其他已登记 MCP、默认应用/插件/钩子、Shell 和子 Agent 能力。测试进程合并代理变量大小写，并让 localhost/127.0.0.1/::1 绕过代理；不修改全局配置。模型与登录服务仍需要正常网络连接。

测试会读取介绍，搜索 AI/DevOps 各一件作品，读取两件详情，查询能力边界。通过条件包括实际 MCP 调用事件、实际返回的公开数据、最终回答与原数据一致；仅生成一段自称成功的回答不能通过。运行上限 90 秒，超时会停止该测试进程。报告包含 runnerVersion: 2 与 failureStage，区分本地运行权限、Codex 远端服务连接和 MCP/回答校验问题。每次运行前将已有报告归档至 artifacts/codex-runs/，避免失败证据被覆盖。

本地结果（均在被 Git 忽略的 artifacts/）：

- `codex-mcp-result.json`：通过状态、实际工具调用和结构化回答。
- `codex-mcp-answer.json`：Codex 的最终回答。
- `codex-mcp-events.jsonl`：真实会话事件。
- `codex-mcp-stderr.log`：CLI 诊断。

机器可读事件与最终文件依据 [OpenAI 官方非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable)。

也可新建 Codex 会话，提出：

> 通过 luckypig-space MCP，读取空间介绍，分别查找一个 AI 和 DevOps 案例，读取详情，给出作品链接、来源或作者贡献，并说明哪些是参考案例，以及是否能实际执行创作工作流。

## 早期执行限制（历史）

本机 Codex CLI 0.166.0 已登录 ChatGPT，默认模型保留用户现有配置。进程级 MCP 配置已被 Codex 正确识别；此前官方 SDK 客户端的真实 HTTP 工具查询也已通过。

本轮 `npm run test:codex` 在执行沙箱内尝试启动，Codex 内部 app-server 初始化被拒绝：`Operation not permitted`。测试尚未发起 MCP 工具调用，不能标记为 Codex 完整验收通过。没有绕过沙箱或更改权限。上述脚本与配置已准备好，需用户在普通终端运行一次；随后核对结果文件。

## 后续客户端适配

继续共用标准 Streamable HTTP `/mcp`、四个只读工具、统一公开内容层和 Skill。针对 WorkBuddy 等客户端，后续核实其实际支持的传输方式、JSON/TOML 配置、Skill 安装约定和本机网络访问，再制作对应模板与验收记录。当前不为尚未确认的客户端改写协议或添加私有调用接口。

## 用户终端执行结果与脚本 v2 修正

用户已在普通终端执行第一版。报告为 timedOut=true、calls=[]、无最终回答；JSONL 显示 workspace routing discovery timed out，stderr 显示模型列表刷新及 ChatGPT 远端应用 MCP 连接超时。尚无本站工具调用，不能标记为 Codex 验收通过。

后续检查：本站 SDK 客户端真实查询再次通过；当前代理可访问 ChatGPT 首页（200），直连探测超时，特定远端应用 MCP 路径返回 451。这些探测不含用户令牌，主页可达不代表模型/登录服务全部正常。未更换全局代理或尝试绕过服务限制。

第一版仅关闭显式登记的其他 MCP，漏关了 Codex 默认启用的应用能力；此前继承的代理变量也只有小写且无 NO_PROXY。已按 [OpenAI 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference) 修正 v2 的进程隔离与代理传递；本机 CLI 已验证五个隔离开关确实为 false，脚本语法检查通过。需用户再次在普通终端运行 npm run test:codex，按新报告判断，不能因修正了脚本就假定接入成功。

若普通终端没有继承可用代理，本次已核实的本机 HTTP 代理为 127.0.0.1:7890，可仅对这条测试命令显式使用：

```bash
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 npm run test:codex
```

脚本自动为本机 MCP 添加 NO_PROXY。这不会修改终端后续命令或系统全局代理；不承诺主页可达就能通过账户和模型服务。
