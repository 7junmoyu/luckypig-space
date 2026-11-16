# M5 本地集成验收

更新：2026-11-06。**M5 本机测试版验收完成。** 发布/问答/MCP 联合检查、真实备份恢复及原环境复查均通过；46 项自动化测试和静态检查通过。汇总使用各阶段实际报告，未把早期失败尝试改写为全程成功。

## 已通过

- 用户普通终端 Node 24.4.0 通过运行时、静态检查、受控故障测试和真实公开 HTTP/MCP 检查；作品 5 条，图片、MP4、TXT 各 1，视频 Range 通过。
- 后续新增回归覆盖后，Node 24.4.0 下 46 项自动化测试与静态检查通过。
- 真实 Halo 正常登录、CSRF 表单、RSA 密码加密和会话 Cookie 管理读取通过；未开启 Basic、未修改后台安全设置。
- 2026-11-06T07:08:47.624Z 联合验收通过：专用示例的未发布草稿不进入公开详情或 MCP；发布正文更新后网页详情、MCP 详情及真实 DeepSeek 回答读到本轮唯一标记；作品下线后列表、详情、MCP 搜索/详情/资源与带历史的真实问答不再引用。
- 真实问答收到首段文字后取消，再次请求完整成功。本次 3 次模型请求（含取消），不推断服务商已停止计费。
- 专用示例编辑器源码与发布源码、公开文本均已恢复原值。测试产生的内部快照与更新时间可能变化。
- 用户普通终端的真实存储验收于 2026-11-06T07:12:56.049Z 完成，passed=true、failureStage=null；before、backup、integrity、restore、after 均已完成。
- 备份包含数据库逻辑导出、Halo 数据卷、文件哈希与公开内容基线，共 4 个有效载荷；随后从本地文件再次核对清单、大小和 SHA-256 通过，私有备份目录权限为 0700。
- 独立恢复环境还原 5 条作品和公开介绍，数据卷普通文件 SHA-256 全部匹配；临时资源清理完成。原网站恢复正常，图片/视频/文档及 SDK MCP 复查通过，本次存储验收未调用模型。

本地忽略目录中的证据：`space-web/artifacts/m5-publication-result.json`（passed=true）、`m5-publication-progress.json`（全部检查及 originalBodyRestored=true）、`m5-publication-baseline.json`（恢复基线）；`local-mvp-result.json` 为集中只读验收。

早期 `m5-result.json` 仍保留用户 06:54 的失败尝试，不能据此忽略后续通过记录，也不能将该历史报告改写为全程成功。真实存储证据为 `m5-storage-result.json`、`restore-result.json`，综合确认记录为 `m5-acceptance.json`；这些报告均位于本机 Git 忽略目录。

## 本轮修正

1. 用户进程缺少全局 Web Crypto：新增 Node >=22 与能力校验，测试/M5 子进程固定当前 Node；Homebrew Node 24.4.0 已核实可用。
2. Halo 默认 Basic 禁用，原脚本使用 Basic 后收到 302 登录重定向，被 redirect:error 误报 TypeError。改为当前登录页的正常 CSRF/RSA 流程，Cookie 仅驻留测试进程内存，凭据不输出。
3. 登录页内公钥是带转义的 JSON 字符串，按 JSON 解码，不执行任意页面脚本。
4. Halo 渲染 HTML 与编辑器原文存在差异，恢复验收改为同时核对编辑器/发布源码及原始公开文本。
5. 兼容索引不保证含完整正文；索引验证作品可见与草稿隔离，更新正文由公开详情、MCP 与真实问答核对。

## 真实备份恢复复验方式

在已经运行网站和 Halo 的普通终端、`space-web/` 目录执行：

```bash
PATH="/opt/homebrew/opt/node/bin:$PATH" npm run test:storage
```

不调用模型、不编辑作品。先检查公开 HTTP/MCP，再短暂停止 Halo 做数据库逻辑备份与附件卷归档，启动 Halo，在随机独立网络/容器/数据卷恢复；比较全部数据卷普通文件 SHA-256、公开介绍和作品详情，清理临时资源，最后复查原环境。

运行期间暂勿编辑、上传或管理容器。备份为本地私有文件，不提交；归档与权限、强制中止时的处理见 [试用说明](local-trial.md)。PATH 仅作用于此命令，其他机器使用自己的 Node 22+。

结果在 `artifacts/m5-storage-result.json`。本次 before、backup、integrity、restore、after 全部完成且 passed=true，结合联合验收与先前 Codex/浏览器/重启记录，已确认 M5 完成，无需重复运行。当前执行沙箱仍无 Docker socket 权限；此次真实恢复由用户普通终端执行，5 项模拟 Docker 测试另作异常路径覆盖。

典型认证失败、429、超时、断流等错误由受控上游自动化测试覆盖，没有故意触发真实模型账户限额。公网、x86、WorkBuddy 和可执行工作流不属于本次本机 M5 完成范围。
