# ZYT Space：在另一台服务器构建与运行

本包包含当前共享程序、张雨彤的三项项目/技能/介绍、本人照片和最新前端。ZYT当前使用 `portfolio` 文件资料模式，只需启动一个web容器，不依赖Halo/PostgreSQL。共享源码位于 `app/`，部署入口是本目录 `compose.zyt.yaml`；不要误用用于完整Halo站的 `compose.yaml`。

源码包不含node_modules、开发机.env、模型Key、管理口令、已保存模型配置、数据库或Luckypig录屏。只拷原工作区的zyt-space目录会缺少共享程序，本包可整体迁移且不依赖原Mac路径。

## 一键启动（公网IP直连）

服务器需要Docker、Compose v2.20+，以及拉取基础镜像和npm依赖的网络。**本包不含预构建镜像，启动脚本会在服务器构建。** 无需宿主安装Node/npm，也无需Halo或数据库。

将包和.sha256上传到服务器，校验、解压并进入包内deploy目录后运行：

```bash
./zyt.sh start --public-url http://你的公网IP:4184
```

脚本校验随包文件和服务器架构，生成权限600的.env.zyt，IP直连默认监听0.0.0.0，自动构建、启动并等待容器健康，再读取公开资料确认ZYT站点就绪。PUBLIC_URL必须等于浏览器实际访问的根地址；使用其他端口时会从URL推导WEB_PORT，或显式加--port。已有.env.zyt不会被参数覆盖，改地址/端口请编辑该文件。需要在安全组和防火墙放行相应TCP端口，脚本不会替你修改防火墙。

```bash
./zyt.sh status  # 容器状态
./zyt.sh logs    # 最近100行日志
./zyt.sh token   # 仅在自己的终端查看站主口令
./zyt.sh stop    # 停止web，保留数据卷
./zyt.sh start   # 保留原配置，重新构建本包并启动
```

访问网站/admin配置模型API。模型Key和管理口令未从Mac迁移，新服务器首次生成自己的口令，模型设置在独立卷内持久保存。不要把token命令输出贴到聊天或文档中。

使用已有HTTPS反向代理时，可首次运行：

```bash
./zyt.sh start --public-url https://你的域名 --bind 127.0.0.1 --port 4184
```

以下保留手动构建方式；不使用脚本时默认仅绑定127.0.0.1。SHA256SUMS只覆盖随包运行文件，不包含后生成的私有配置；校验不能替代可信来源认证。

## 1. 将源码包和sha256传至Linux服务器

服务器需要可用的Docker Engine和Docker Compose v2，并能拉取Node基础镜像及npm依赖。宿主无需安装Node/npm；这些在镜像构建阶段准备。常见x86服务器使用包默认linux/amd64；ARM服务器重新打linux/arm64包，不复制Mac的node_modules。

在同一目录核对并解压（以下文件名替换成实际包名）：

```bash
sha256sum -c zyt-space-0.3.0-amd64-时间戳.tar.gz.sha256
tar -xzf zyt-space-0.3.0-amd64-时间戳.tar.gz
cd zyt-space-0.3.0-amd64-时间戳/deploy
```

首次配置，不覆盖已有私有配置：

```bash
test -e .env.zyt || cp zyt-standalone.env.example .env.zyt
chmod 600 .env.zyt
```

编辑.env.zyt：域名访问时把PUBLIC_URL改为实际HTTPS站点根地址（不加子路径）；WEB_PORT默认4184。若同机运行多个实例，分别使用不同COMPOSE_PROJECT_NAME、WEB_PORT和PUBLIC_URL。TARGET_PLATFORM须对应服务器架构。

## 2. 在服务器构建并启动

```bash
docker compose --env-file .env.zyt -f compose.zyt.yaml config --quiet
docker compose --env-file .env.zyt -f compose.zyt.yaml build web
docker compose --env-file .env.zyt -f compose.zyt.yaml up -d --no-build --pull never
docker compose --env-file .env.zyt -f compose.zyt.yaml ps
curl --fail http://127.0.0.1:4184/api/health
```

最后一个请求应返回本站资料就绪及3项作品。Node进程运行于容器4173端口，宿主映射127.0.0.1:4184。构建失败时先解决错误，不把只有源码打包完成当作Linux运行通过。源码包内的Dockerfile会在所选Linux架构中安装锁定的依赖，而非使用Mac依赖。

## 3. 访问网页与配置模型

正式域名通过宿主Nginx/现有HTTPS代理转发到127.0.0.1:4184。通用nginx.conf.example里的域名、证书路径和上游4183需改成自己的实际值及4184；保留Host/Origin、关闭SSE/MCP缓冲。此模板不自动申请证书、不操作服务器防火墙。

暂时无域名时，可在自己的电脑执行 `ssh -L 4184:127.0.0.1:4184 用户@服务器`，保留默认PUBLIC_URL，然后浏览器访问http://127.0.0.1:4184。不要把localhost地址当作已开放公网的网站地址。

服务器上获取本站新口令（在自己的终端查看，不发到聊天或文档）：

```bash
docker compose --env-file .env.zyt -f compose.zyt.yaml exec web node scripts/owner-token.mjs
```

网页顶部“模型设置”或 `/admin` 登录后填写Base URL、模型名称和API Key，可先测试再保存；不需要修改.env或重构建镜像来换模型。联网站点须使用浏览器实际访问的PUBLIC_URL；否则管理Origin校验和MCP连接地址会不一致。

模型配置与口令保存在本Compose项目的 `web-settings` 卷，容器目录为 `/app/.local/zyt/`；重建容器后继续保留。更新前备份该卷，日常不要执行 `down -v`。新服务器默认生成新口令，模型Key在新网页重新配置；若要保留旧配置，另行通过私有通道备份/恢复本站.local/zyt，不把它加入通用源码包。

## 内容更新与范围

本机开发修改共享app源码与sites/zyt后重新打源码包，服务器构建新镜像、保留既有.env.zyt和Compose项目名，再重建web容器。图片和照片已经在包内；资料文件更新需重建镜像。正文媒体若将来放在外部对象存储，需另行迁移外部素材。未来切换独立Halo属于后续阶段，不能只改CONTENT_SOURCE而期望自动导入资料。

包内release.json记录每个运行文件的SHA-256；外部.tar.gz.sha256核对传输完整性，不能替代来源认证。新生成源码包不含镜像tar，没有替你执行真实Docker构建或远程部署。

依据：[Docker Compose构建规范](https://docs.docker.com/reference/compose-file/build/)、[服务platform规则](https://docs.docker.com/reference/compose-file/services/#platform)。
