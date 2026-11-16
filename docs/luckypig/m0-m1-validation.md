# M0 / M1 实施与验收记录

> 本文保留早期开发与环境限制。真实 Halo 上传/发布/下线、媒体及桌面/手机浏览现已通过，重启持久化待验收。最新结果见 [实际联调记录](halo-live-validation.md)。

日期：2026-11-05
分支：`feat/space-content-foundation`；未提交或推送。

本文件记录首轮检查；用户后续已启动 Docker，最新的沙箱权限限制、17 项测试和新增浏览功能见 `m1-m2-progress.md`。

## 进度

- M0 工程基础已实现：独立前台源码在 Fork 的 `space-web/public/`，不会被 `dist/` 忽略；统一内容服务、公开 schema、本地配置和启动说明已建立。
- M1 代码与运行配置已实现；真实 Halo 上传、发布和持久化链路尚未验收，不能标记 M1 完成。
- M2 部分浏览基础随数据适配完成，完整体验仍待后续阶段。DeepSeek、MCP、Skill 尚未接入。

## 已执行并通过

| 检查 | 结果 |
| --- | --- |
| `npm run runtime` | Node.js `24.4.0` / ARM64；npm 脚本的实际运行时 |
| `npm run check` | 脚本语法、4 条参考案例来源与身份、7 个本地问答场景、DOM 和本地文件引用通过 |
| `npm test` | 12 项行为测试通过：公开状态、资料更新/下线、个人介绍二次校验、公开投影、分页、错误模式、媒体/文档与 HTTP 行为 |
| Compose `config --quiet` | Halo + PostgreSQL 配置可解析，密码由本地文件注入 |
| 本地配置与 Git | `.env` 被忽略；`public/` 源码可被 Git 识别；数据库密码随机生成、不输出；不修改现有配置 |
| 实际浏览器 HTTP | `/api/status`、`/api/profile`、作品分类查询返回 200；缺失作品返回 404 |
| 桌面交互 | 分类筛选、关键词无结果、打开详情、刷新保留详情路由通过 |
| 网页会话 | Cmd+K 打开、输入并发送、从服务端当前公开资料返回 DevOps 相关案例通过；这是本地检索，不是 LLM |
| 正文重建 | 在实际浏览器验证：保留段落、图片、video/source 与普通链接，移除脚本、SVG、事件属性、自动播放和活动 URL |
| 手机尺寸布局 | 390px 视口内容宽度为 390px，无横向溢出；不等于手机完整交互已验收 |
| 不存在的详情路由 | 显示“作品不存在或已下线”，Esc 关闭通过 |

12 项测试使用内存 Halo 响应夹具与实际 HTTP handler/文件流；不是已运行真实 Halo 的证明。Range 与 HEAD 已测试媒体代理转发及静态流行为，真实上传 MP4 的播放与拖动进度仍待执行。

浏览器脚本：`space-web/scripts/browser-check.mjs`、`browser-content-check.mjs`、`browser-mobile-check.mjs`。通过 ego-browser nodejs 导入绝对文件路径执行。首次自动滚动操作受平滑滚动影响，设置减少动态效果后桌面检查通过；手机仅确认布局，未声称完整交互通过。截图捕获超时，未形成截图验收结果。

## 实际未通过 / 待环境恢复后执行

- `docker version` / `docker info` 无法连接 Docker 引擎。命令行存在，但引擎没有运行；`open -a Docker` 未找到 Docker Desktop 应用。
- 后续按用户要求重试启动：确认 `/Applications/Docker.app` 已安装（4.26.1）；按名称未能找到应用不代表未安装。完整路径 `open /Applications/Docker.app` 返回 macOS Launch Services 通信错误 -10822，内含 GUI 程序直接启动退出 134；引擎仍不可用，需要在正常桌面会话中启动后继续联调。
- `npm run dev` 已执行，能在引擎缺失时提示启动 Docker Desktop / OrbStack / Colima，不会继续伪造后台启动成功。
- `npm run test:halo` 已执行，返回内容服务无法连接。真实 API 兼容性仍未通过。
- 尚未拉取或验证 Halo `2.27.2`、PostgreSQL 17 的 ARM64/x86-64 清单和镜像 digest。
- 未初始化后台、创建管理员、验证默认编辑器节点、上传附件、真实发布/更新/下线、验证视频拖动和文档下载、重启持久化。
- 尚未执行数据备份/恢复、公网部署、DeepSeek 真实调用或任何 MCP 客户端联调。

本地展示服务当前在 `127.0.0.1:4173`，明确运行于 `demo` 模式，以便容器尚不可用时继续查看界面。运行 `npm run dev` 会显式切换到 Halo 模式；切换前需停止占用 4173 的演示服务。

## 下一项验收

启动本机容器引擎后，按 `content-management.md` 完成一条带图片、MP4、文档与外链的测试作品，再依次执行发布、更新、下线和重启验证。该链路通过后才将 M1 改为完成并进入 M2。
