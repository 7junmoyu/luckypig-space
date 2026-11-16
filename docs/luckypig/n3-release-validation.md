# N3 发布包交付与验证

日期：2026-11-11。用户要求继续实现，按已确认后续计划完成 N3 源码交付。本轮没有部署、推送镜像、迁移数据、停止用户进程或修改 Halo 核心。

## 最新构建验收（2026-11-11）

用户已确认普通终端构建完成。已读取 `space-web/artifacts/releases/0.3.0-amd64-1794359990407-41cd6b15.image-metadata.json`，mtime为 `2026-11-11T01:20:28.720Z`；配套源码清单目标 `linux/amd64`，标签 `luckypig-space-web:0.3.0-amd64`，50文件SHA-256复核通过。

metadata的 `containerimage.digest` 和 `containerimage.config.digest` 均为 `sha256:76d28ae6ceaf0d8b8e2a1c4b614957755ed7a0eada31a25712089b2cb23e9655`。记录原始metadata字段，不把它冒称仓库RepoDigest。此metadata没有平台字段；目标平台依据发布清单和用户执行命令，实际镜像架构仍应在N4 inspect及运行时核实。

目标构建已通过，不再要求用户重复构建。新核对结果存于忽略的 `artifacts/n3-build-metadata-check.json`，未改写原构建metadata和源码包。下面保留此前沙箱未构建的历史记录，不覆盖用户终端通过结果。

## 交付

- `space-web/Dockerfile`：Node24、多阶段生产依赖安装、非root运行、存活检查，运行源码直接提供前台，无需dist或前端构建。
- `.dockerignore` 白名单；`scripts/release.mjs` 按固定文件/目录生成源码包，不读或复制实际 `.env`/`.local`/artifacts。逐文件SHA-256清单；拒绝符号链接、未登记文件、哈希不符、疑似Key和带凭据URL。清单只是完整性校验，不是签名。
- `npm run release:prepare`、`release:check`、`image:build`：选择amd64或arm64，输出新目录、核对平台/标签，构建只使用已核对源码快照；单平台`--load`，不自动推送或启动服务。
- `deploy/release/compose.yaml`：web/Halo/PostgreSQL，独立`luckypig-release`项目和三类命名卷，默认127.0.0.1:4183/8190，保留本机既有项目隔离。网站配置卷支持站主设置重启持久化，环境中的Key仅作为初始值。
- `.env.example`及离线检查：密码占位符、HTTPS站点根地址、平台、端口、模型/超时与搜索设置；不回显凭据。
- Nginx网站TLS反代示例：保留Host/Origin与Range，SSE/MCP不缓冲、不缓存；证书、域名和CMS公开方式由目标环境确定，未实际加载配置。
- [部署使用说明](../../deploy/release/README.md)：打包/构建/转移、私有配置和UID1000权限、三类数据持久化、健康与就绪差异、N4迁移验收及回退边界。

## 实测结果

- Node24.4.0，70项行为测试全部通过；新增发布5项测试。静态检查通过。元数据/镜像标签一致性补充后，发布5项再验通过。
- amd64、arm64两份源码包已实际生成，各50文件，校验通过；真实环境文件从未进入发布包，示例密码占位符被离线配置检查拒绝。
- `docker compose ... config --quiet` 使用临时随机密码的样本配置，退出0，Compose schema验证通过；临时文件已删除，未访问Docker守护进程或输出展开配置。
- Docker socket访问失败：`connect: operation not permitted`。没有尝试绕过；镜像构建、容器运行、跨架构运行未验收，不能称已构建x86镜像。
- 当前PATH没有Nginx，未执行`nginx -t`；模板语法/证书/代理实际效果需目标环境验证。
- 原始结果在忽略的 `space-web/artifacts/n3-source-validation.json`、`n3-tests.log`；源码包路径见JSON。生成目录不覆盖已有发布包。

## 下一步

amd64目标镜像已构建，无需重复。下一步确定Linux测试服务器的SSH别名或IP/用户名/端口与域名，再进入N4；先核实镜像架构和迁移/备份方案，再启动目标环境。实际容器运行、HTTPS及公网接入未验收。

原M5存储验收、11月8日管理HTTP与deepseek-flash连接通过记录继续有效，无需重跑。新管理页/面试导览手机交互、模型检索新效果、实际设置保存/重启和真实搜索仍分别保留待验；缺Tavily Key不阻塞N3源码。
