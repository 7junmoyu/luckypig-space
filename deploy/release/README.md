# Space 网站发布包

ZYT当前文件资料模式的单容器部署请使用 [README-ZYT.md](README-ZYT.md) 和 `compose.zyt.yaml`。共享源码中的 `npm run zyt:pack -- --platform linux/amd64` 会生成可整体迁移的tar.gz和SHA-256；下面正文的compose.yaml仍是完整Halo三容器部署。

N3 交付的是源码、镜像配方和独立部署示例。构建成功、x86运行成功、公网验收是不同检查；当前文档不代表已部署。

## 生成与核对

在源码仓库 `space-web/` 中，用 Node 22+（推荐24）运行：

```bash
npm run release:prepare -- --platform linux/amd64
npm run release:check -- --directory /绝对路径/生成的发布包
npm run image:build -- --platform linux/amd64
```

Mac ARM本机试运行使用 `--platform linux/arm64`。源码包包含 `app/`、`deploy/` 和 SHA-256 清单 `release.json`；不包含依赖目录、凭据、工作原件或验收报告。哈希检查用于发现损坏/改动，不是签名或来源认证。打包拒绝符号链接和疑似明文Key，不覆盖已有输出目录。

镜像命令先生成新源码快照，再执行单一目标平台 `docker buildx build --load`。默认本地标签为 `luckypig-space-web:0.3.0-amd64` 或 `0.3.0-arm64`，实际版本从 package.json读取。不会推送镜像、创建构建器或启动容器。基础镜像默认 `node:24-bookworm-slim`，正式发布应将 `--node-image` 指定为核实过的官方摘要（`node:24-bookworm-slim@sha256:...`）；构建metadata记录实际解析结果，位于发布包旁，不进入源码清单。未声明已核实该标签当前对应的patch/digest。

也可在目标服务器从源码包构建：

```bash
docker buildx build --platform linux/amd64 --load --tag luckypig-space-web:0.3.0-amd64 ./app
```

从Mac传输已构建x86镜像时，使用 `docker image save --output space-image.tar luckypig-space-web:0.3.0-amd64`，服务器 `docker image load --input space-image.tar`。确认版本标签与清单一致；镜像tar另行保管，不放入源代码包。

## 独立测试环境

源码包 `deploy/` 中执行 `cp .env.example .env`、`chmod 600 .env`，在本机编辑该文件：生成至少32字符随机数据库密码，设置目标平台与镜像标签。正式域名需将 PUBLIC_URL 改为网站HTTPS根地址，HALO_EXTERNAL_URL改为可访问的Halo地址。保留此文件私有，不发送内容或不带`--quiet`的Compose解析结果。

源码项目可离线检查该配置（不访问Docker、端口或模型）：

```bash
npm run release:check -- --directory /发布包 --env-file /发布包/deploy/.env
# 真正对公网前，额外检查生产HTTPS配置
npm run release:check -- --directory /发布包 --env-file /发布包/deploy/.env --production
```

完成数据迁移方案和备份后，在已授权的目标测试机 `deploy/` 运行：

```bash
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env -f compose.yaml ps
```

此示例有3个服务：web、halo、halodb。默认项目名 `luckypig-release`，网站4183、Halo8190，均只绑定宿主127.0.0.1；与现有本机项目4173/8090及其数据卷隔离。不要给它指定现有项目的 `-p luckypig-space`，也不要复用已有数据卷名。新卷首次是空站，不会自动读取Mac当前8条作品；不要把空站视为迁移完成。

网站镜像以node用户（UID1000）运行，只读根文件系统；`web-settings:/app/.local` 是唯一应用持久化目录，首次自动生成站主口令。设置Key时通过网站管理页或私有环境文件，不进镜像。获取口令只在自己的终端执行：

```bash
docker compose exec web node scripts/owner-token.mjs
```

后台若仅供SSH使用，可转发8190端口后访问console。若配置独立公开CMS域名，需另设该域名的HTTPS代理到127.0.0.1:8190；`nginx.conf.example`只覆盖作品网站，不替你公开CMS。

## 反向代理与验收

宿主Nginx示例为 `nginx.conf.example`；替换域名、证书路径后先 `nginx -t`，再按服务器既有运维方式加载。PUBLIC_URL须与浏览器完整Origin一致；代理保留Host/Origin（含非标准端口），避免管理登录及MCP校验失败。SSE/MCP不缓存、不缓冲，视频Range/If-Range透传。没有自动申请证书或改主机防火墙。

网站健康检查只检查 `/api/status`（存活），内容就绪另外检查 `/api/health`。N4实际验收覆盖：

1. `/api/health`返回实际Halo作品数量；核对8条内容、个人/参考标记、介绍和三条录屏，不能只看存活状态。
2. `/media/halo/upload/...` 视频请求Range返回206，播放、定位、文档下载和封面可用。
3. 网页真实会话流式显示、停止/重试；站主管理登录/保存、重启持久化；公开响应不回显Key。
4. HTTPS `/mcp`和下载Skill使用新域名，实际外部Agent完成只读查询。
5. 备份、恢复和回退验证；ARM能构建不等同amd64已运行。

当前会话限额按直连地址计算，代理后所有访客共享来源限额；本轮没有启用对任意X-Forwarded-For的信任。公网压测前另行设计可信代理与限额策略。

## 数据迁移与回退边界

- Halo/PostgreSQL分别使用 `halo-data` 和 `postgres-data` 卷；ARM→x86使用PostgreSQL逻辑导出/恢复及附件备份，不复制PostgreSQL裸数据目录。
- 现有 `space-web/scripts/backup.mjs` 固定操作本机开发Compose，不能拿它直接备份本发布项目。已通过的M5备份保留；N4需针对目标环境准备并验证迁移/备份操作。
- 网站 `web-settings` 必须单独备份，与Halo备份无关。迁移模型配置时私下复制 `.local/model-settings.json`，让UID1000可读写、目录0700/文件0600；默认让新站生成新owner-token。不要直接输出文件内容。
- 旧文章中的绝对附件/站点URL须核对，必要时通过Halo后台修正后验证；不盲目对数据库批量替换域名。
- 更新前记录旧镜像摘要、环境配置和三类数据备份。应用回退仅在配置格式兼容时改回旧SPACE_IMAGE并重建web；数据库/内容升级另备恢复方案。不要删除持久化卷，也不执行 `down -v`。

参考：[Docker构建上下文](https://docs.docker.com/build/concepts/context/)、[多平台构建](https://docs.docker.com/build/building/multi-platform/)、[Nginx代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)。

## 两个独立站点（2026-11-12）

共享程序支持 `SITE_ID=luckypig` 与 `SITE_ID=zyt`。这需要包含 `src/site.mjs`、`src/templates/` 和 `sites/zyt/` 的新构建；2026-11-11已交付的归档与镜像不包含此功能，不能直接用旧镜像启动ZYT。

原站使用私有 `.env`；新站从 `zyt.env.example` 复制为私有 `.env.zyt`，设置新的数据库密码、新镜像标签及实际域名。模板的 `COMPOSE_PROJECT_NAME=zyt-release`、网站4184、Halo8191与原示例分别区分。两份配置各自执行：

```bash
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env.zyt -f compose.yaml config --quiet
# 用户自行核对目标后启动；当前没有执行这些命令。
docker compose --env-file .env -f compose.yaml up -d
docker compose --env-file .env.zyt -f compose.yaml up -d
```

Compose项目名决定容器、网络及三个命名卷的归属。不要把两份配置设成同一项目名，也不要给两站指定同一个 `-p`。两站分别使用自己的域名或子域名，由宿主Nginx转发至各自的web端口；不按一个域名下的 `/zyt/` 子路径部署。共享同一镜像不等于共享数据。

ZYT首版 `CONTENT_SOURCE=portfolio` 从镜像内经过整理的JSON读取三项项目与技能；此模式不调用Halo，编辑JSON后需重新构建/部署。完整Compose仍会预留并启动独立Halo和数据库，它们初始为空；不代表资料已经导入后台。后续完成独立Halo的资料录入并验证后，才能改为 `CONTENT_SOURCE=halo`。不要直接切换后把空站当作资料丢失，也不要连接Luckypig的后台。

获取ZYT管理口令时带同一份配置：`docker compose --env-file .env.zyt -f compose.yaml exec web node scripts/owner-token.mjs`。ZYT口令与模型设置位于其独立卷的 `/app/.local/zyt/`。当前没有迁移原站作品、录屏或密钥，没有执行第二实例的Docker部署。
