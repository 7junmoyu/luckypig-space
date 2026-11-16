# ZYT Space 二开说明

本项目在 Halo Fork 中增加了独立 Node 网站；开发 ZYT 只需 `space-web/` 和打包所用的 `deploy/release/`，无需编译 Java 或启动 Halo。保留根目录原有 LICENSE。

## 获取代码

当前代码在 `feat/space-content-foundation` 分支，尚未合并至 main。GitHub Fork 时取消“Copy the main branch only”，复制所有分支；如果已经只复制 main，可把原仓库作为远端再取开发分支。不要只下载 main 后认为新增网站缺失。

从朋友自己的 Fork 克隆，仓库地址由本人替换：

```bash
git clone --branch feat/space-content-foundation --single-branch https://github.com/YOUR_ACCOUNT/luckypig-space.git
cd luckypig-space/space-web
```

原仓库历史较大，只想先体验当前代码可在 clone 时加 `--depth 1`。原作者地址是 `https://github.com/luckypig1209/luckypig-space`。

## 本地运行

Node.js >=22，推荐 `.nvmrc` 的24；使用 npm 自带版本，不需要全局安装前端构建工具。

```bash
npm ci
npm run start:zyt
```

打开 `http://127.0.0.1:4174`。从项目内读取 `sites/zyt/`，无需工作区外的 `zyt-space/` 目录。前端是原生 HTML/CSS/JS，由 Node 直接提供，无需先生成 dist，也不强制 Nginx。

需要修改端口/公开地址时，在 `space-web/.env.zyt` 创建私有配置：

```dotenv
HOST=127.0.0.1
PORT=4174
PUBLIC_URL=http://127.0.0.1:4174
```

不复制原站 `.env`；`.env.zyt` 已被忽略。终端已有显式环境变量会优先于文件。没有模型 Key 也能浏览，聊天会说明尚未配置。

macOS/Linux 在另一个终端、同一目录获取管理口令：

```bash
SITE_ID=zyt npm run owner:token
```

Windows PowerShell 先设置 `$env:SITE_ID='zyt'`，再执行 `npm run owner:token`。口令只在本人终端查看，不贴到公开 Issue。打开 `/admin` 配置模型/API/Key。私有设置和口令位于 `.local/zyt/`，不提交。

## 主要文件

| 路径（相对space-web） | 用途 |
| --- | --- |
| `sites/zyt/site.json` | 站名、品牌、导览助手和页面元信息 |
| `sites/zyt/profile.json` | 介绍、教育、荣誉、技能 |
| `sites/zyt/projects.json` | 项目、正文HTML、素材链接和发布状态 |
| `public/personal-home.js` | ZYT首页版式及部分静态文案 |
| `public/style.css` | 共享样式与`.site-zyt`专属样式 |
| `public/assets/zyt/portrait.jpg` | 经站主授权展示的照片 |
| `public/assets/covers/zyt-*.svg` | 统一风格封面 |
| `src/templates/` | 服务端页面模板 |
| `src/content.mjs` | 内容来源与公开发布视图 |
| `test/` | 隔离的行为测试，不需要真实模型Key |

朋友独立二开最简单的方式是在自己的 Fork 中替换上述 ZYT 预设。当前程序仅支持 `luckypig` 和 `zyt` 两个内部标识；只改目录名或设置 `SITE_ID=新名字` 无法直接启动。可保留内部标识，修改展示身份；如需通用任意站点预设，需另行开发。

姓名、介绍、头像、项目、助手名、下载标识和页面内硬编码的张雨彤/ZYT字样应一并检查；不得把张雨彤的个人事实当成自己的内容。照片及个人资料仅用于原站展示，不作为朋友站点的默认身份素材。实例之间使用独立部署目录、Compose项目名、端口和卷，不复用对方的`.env.zyt`或模型Key。

## 验证与交付

```bash
npm test
npm run check
npm run zyt:pack -- --platform linux/amd64
```

`npm test`运行受控自动化测试；不要把带`test:m5`或`import:recordings`的旧原站实机脚本作为新人安装步骤。`zyt:pack`交付当前源码压缩包及校验文件，不包含镜像或私有设置；Linux ARM使用`linux/arm64`。解压后按 `deploy/README-ZYT.md` 构建启动。完整部署说明在仓库 `deploy/release/README-ZYT.md`。

代码更新走分支/提交；运行数据和大录屏单独保存。项目与视频的现有维护方式见[上传说明](content-upload.md)。
