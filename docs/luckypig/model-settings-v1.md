# 网页模型设置与可选联网搜索

日期：2026-11-07。用户已授权实现站主网页切换模型/API，并要求开放联网能力。本次只改 `space-web/`，未改 Halo 核心、数据库、CI，未增加依赖、未提交或推送。

## 当前验收结论（2026-11-08）

用户普通终端已运行 `SETTINGS_TEST_MODEL=1 npm run test:settings`，聊天输出与本地忽略报告 `space-web/artifacts/model-settings-live.json` 一致：

- `checkedAt=2026-11-08T05:17:12.478Z`，`passed=true`。
- `adminAccess=true`、`credentialsRedacted=true`：真实管理登录及密钥不回显通过。
- `model=deepseek-flash`、`modelConnected=true`、`chatMode=deepseek`：通过新管理测试接口完成一次真实短模型生成。
- `savedConfigurationChanged=false`：测试前后配置保持一致，未执行保存切换。
- `searchTestRequested=false`、`searchAvailable=false`：未测试搜索，当前未开启联网。

上述管理HTTP与模型连接已验收，不要求用户重复启动或重跑。下面保留原沙箱失败以说明执行环境差异，不覆盖本次真实通过；报告原文件未由助手改写。

待验仅包括新管理页与手机交互、真实保存后切换/重启持久化、配置搜索Key后的真实网页联网；已有57项测试覆盖相应受控逻辑，不将其冒充新浏览器或真实搜索验收。

## 已实现

- 页脚“站主设置”及 `/admin` 页面，沿用陶土橙。站主口令与 Halo 密码独立，通过本机 `npm run owner:token` 获取；服务启动不会打印口令。
- 站主会话使用随机令牌、服务端摘要记录、HttpOnly/SameSite Cookie，8 小时有效，退出/重启失效；登录限频。写请求校验完整 `PUBLIC_URL` Origin 与 Host，拒绝跨站和非 JSON 请求。
- DeepSeek 与 OpenAI 兼容 Chat Completions 类型，API Base URL、模型、写入/清除 Key、超时；Key 留空保留已有值，更换源地址需要新 Key。管理接口不回显任何 Key，公开状态不含上游地址。
- 独立测试按钮对当前填写内容发起短模型生成或搜索，不保存。保存原子落盘并使用配置版本检测冲突；失败不改运行状态。
- `.local/model-settings.json` 持久化且优先于环境初始值，后续请求即时读取快照；进行中的请求继续使用旧配置。显式 `CHAT_MODE=local-demo` 始终使用本地检索，即使保存过真实配置。
- 只有 DeepSeek 类型发送专用 `thinking: disabled`。会话展示实际配置的模型 ID，系统上下文同样包含该请求标识，不声称核实上游权重。
- Tavily 独立搜索 Key 和站主总开关；访客逐轮勾选联网。服务端固定调用官方搜索 API，最多 4 条摘要，经 URL/数量/大小过滤后交给模型；外部链接由服务端结果生成，前端纯文本和安全链接展示。搜索错误明确终止，不伪装联网成功；没有执行运维或个人工作流。
- 普通终端 `npm run test:settings` 验证管理 HTTP，只读、不保存、不默认调用模型；`SETTINGS_TEST_MODEL=1` 或 `SETTINGS_TEST_SEARCH=1` 显式增加对应真实服务测试。结果写忽略的 `artifacts/model-settings-live.json`。

## 2026-11-07 开发验证（历史）

- Node 24.4.0：57 项行为测试通过，静态检查通过。新增覆盖持久化/权限/秘密不回显/地址变更/错误落盘/配置冲突/演示模式/会话到期/限频/来源保护/模型真实格式流/热切换/新超时/搜索来源过滤及错误取消。
- HTTP 测试使用真实处理器与受控上游，不冒充已连接新供应商；持久化测试使用临时目录，不改用户 `.env` 或实际配置。
- 当前执行沙箱拒绝监听 `127.0.0.1:4173`，`npm start` 返回 `listen EPERM`。上一轮网站 exec session 21774 已正常停止，新进程未启动成功；已异步请求用户在普通终端启动。不能声称当前预览已经运行新版本。
- ego-browser 报 `Failed to start ego lite`，尚未创建本次 TaskSpace、未做页面或手机截图验收；不是自动审批拒绝。没有借其他执行器绕过本地端口限制。
- 本轮未发起实际 DeepSeek 或 Tavily 请求，未新增搜索 Key。真实设置页面、上游连接与网页联网仍待运行环境恢复后验证；既有 M5 通过记录保持原状态。

## 2026-11-08 沙箱续接检查（历史）

- 用户已确认普通终端启动。不要依据本沙箱连接失败重复要求启动网站。
- 本沙箱执行 `SETTINGS_TEST_MODEL=1 npm run test:settings` 在第一次公开拒绝访问检查之前被 `connect EPERM 127.0.0.1:4173` 阻断；没有登录、修改配置或向上游发请求。`artifacts/model-settings-live.json` 的 `passed=false/failureStage=access_check/errorCode=EPERM` 仅表示该执行环境不能联网。
- 脚本现按 errno 区分执行环境权限拒绝、连接拒绝和超时；记录失败阶段，以及模型/搜索连接测试是否被请求，避免把请求意图误记为实际上游调用。
- ego-browser 仍返回 `Failed to start ego lite`，未创建本次 TaskSpace，真实网页/手机尚未验收。没有提权或更换执行器绕过限制。
- 下一步在用户普通终端另开窗口，在 `space-web/` 执行 `PATH="/opt/homebrew/opt/node/bin:$PATH" SETTINGS_TEST_MODEL=1 npm run test:settings`。此命令使用本机口令，不输出Key、不保存模型配置，测试一次短模型生成后退出验收登录。收到结果后再更新完成状态；不重跑M5。

## 使用与边界

普通终端在 `space-web/` 执行 `PATH="/opt/homebrew/opt/node/bin:$PATH" npm start`，打开 `http://127.0.0.1:4173/admin`。另开终端执行 `npm run owner:token`，将口令填写在本机网页，不发送到聊天。

先测试模型，再保存；联网需要另外填写 Tavily Key、测试并开启。DeepSeek Key 不能代替搜索 Key。联网仅搜索当前问题，追问中请带上需要的地点/主题；摘要可能过时，不能把搜索结果称为专用实时天气服务。用户的身份和成果仍以站内公开内容为准，外部资料不作为个人履历。

其他原生协议、特殊推理参数、模型列表自动发现、多供应商自动切换未实现。MCP 维持原四个只读站内查询工具，网页搜索不自动扩展到外部 Agent。

`.local/` 目录为 0700，文件为 0600，被 Git 忽略且在公开目录之外。迁移需单独保管此目录；现有 Halo 备份不包含网站模型凭据。生产部署的 HTTPS、反向代理和持久化卷在后续阶段验证。

接口依据：[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)、[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。
