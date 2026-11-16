<p align="center">
  <img src="space-web/docs/assets/readme-banner.svg" alt="Luckypig Space · 项目、录屏与开发实践" width="100%">
</p>

# Luckypig Space

一个用来展示项目、录屏和开发实践的个人网站。访客可以直接看作品，也可以通过网页对话，或在自己的 Agent 中查询站主公开的技术栈和项目资料。

做这个项目，是想在面试或交流时有一个能直接打开的地方：做过什么、用了哪些技术、功能演示在哪里，都放在一起。界面采用暖炭色和陶土橙，前台可以自行修改，不依赖现成博客主题。

[快速开始](#快速开始) · [内容维护](#内容维护) · [Agent 接入](#agent-接入) · [部署](#部署) · [二次开发](#二次开发)

在线示例：[ZYT Space](http://146.56.197.54:28090)

> 当前网站代码位于 `feat/space-content-foundation` 分支，主要开发目录为 `space-web/`。Fork 后请确认包含这个分支；只复制 `main` 会缺少个人网站代码。

## 可以用它做什么

- **展示个人资料**：介绍、技术栈、教育背景、照片和项目经历，支持个人化首页与移动端浏览。
- **整理开发作品**：将项目说明、录屏、图片、文档和演示链接放进详情页，通过搜索、分类和标签查找。
- **播放录屏**：支持 MP4、进度拖动、倍速和章节定位；封面可以单独设计，不必使用视频截图。
- **通过对话了解站主**：网页助手根据公开资料回答问题，展示相关作品依据；模型 API、模型名称和 Key 在站主管理页配置。
- **连接本地 Agent**：提供只读 MCP、公开 HTTP 接口和可下载 Skill，让访客在自己的客户端查询资料。
- **自己维护和部署**：可以选择文件资料模式，也可以接入 Halo 内容后台；支持 Docker 源码打包，分别面向 Linux AMD64 或 ARM64 构建。

网页、对话和 Agent 共用公开内容来源。没有提供的经历和成果，不作为既定事实补入资料。

## 两种内容方式

| 方式 | 适合的场景 | 维护方式 |
| --- | --- | --- |
| 文件资料模式 | 个人介绍、求职作品集、轻量个人站 | 编辑 JSON；素材放项目目录，可挂载服务器本地文件夹 |
| Halo 内容模式 | 需要后台上传、编辑和发布作品 | 使用 Halo 后台；网站读取已发布内容 |

仓库里的 **ZYT Space** 使用文件资料模式，本地启动不需要 Halo 或数据库；原 **Luckypig Space** 使用 Halo 内容模式。两套预设共用程序，模型设置和管理口令按站点隔离，并非一个多用户后台。

## 快速开始

本地需要 **Node.js 22+**，推荐使用 `space-web/.nvmrc` 指定的版本。

```bash
git clone --depth 1 --branch feat/space-content-foundation https://github.com/luckypig1209/luckypig-space.git
cd luckypig-space/space-web
npm ci
npm run start:zyt
```

打开 **http://127.0.0.1:4174**。此方式直接读取仓库内的 ZYT 公开资料，不需要仓库外的工作区，也无需先配置模型 Key。

前端是原生 HTML、CSS 和 JavaScript，由 Node 服务直接提供，**无需先构建 dist，也不强制使用 Nginx**。

如果只想预览参考内容，可在 `space-web/` 中运行 `npm run demo`，打开 http://127.0.0.1:4173 。该模式明确使用示例资料和本地检索，不代表真实模型问答。原站 Halo 模式的启动步骤见[网站开发说明](space-web/README.md)。

## 网页对话与模型配置

访问 `/admin`，使用本站管理口令登录后，可以配置模型接口、模型名和 Key，测试连接后保存。支持 DeepSeek 和 OpenAI 兼容的 Chat Completions 接口。

本机使用 ZYT 预设时，在 `space-web/` 的另一个终端获取口令：

```bash
SITE_ID=zyt npm run owner:token
```

以上命令适用于 macOS/Linux；Windows 和容器内操作见[二开说明](space-web/docs/zyt-development.md)与[部署说明](deploy/release/README-ZYT.md)。

Key 只保存在服务端私有配置中，不写进前端或 Git。没有模型 Key 仍可浏览作品；没有配置独立搜索服务时，网页助手不会自动联网。模型与联网配置详见[设置说明](docs/luckypig/model-settings-v1.md)。

## 内容维护

ZYT 的主要资料位于：

```text
space-web/
  sites/zyt/
    site.json          # 站名、品牌和页面元信息
    profile.json       # 个人介绍、教育、荣誉和技能
    projects.json      # 项目说明、素材链接和发布状态
  public/
    personal-home.js   # 个人首页布局与部分静态文案
    style.css          # 样式
    assets/
      covers/          # 统一风格封面
      zyt/             # 照片及个人站素材
```

没有对象存储也可以使用。小素材可放入 `public/assets/zyt/projects/项目ID/` 随源码打包；较大的录屏推荐保存在服务器项目目录，通过只读挂载供网站访问，避免反复构建镜像。现有源码打包器的单文件限制为 32 MiB，该限制不适用于独立挂载的媒体文件。

- [服务器本地目录维护：首次挂载、上传录屏、修改资料](space-web/docs/local-content.md)
- [项目字段、视频与文档链接的写法](space-web/docs/content-upload.md)
- [Halo 模式后台使用说明](docs/luckypig/content-management.md)

当前 `/admin` 管理模型和搜索设置，**文件资料模式没有网页作品编辑器或上传按钮**。照片、个人资料与作品素材应替换为自己的内容。

## Agent 接入

点击网站上的“连接 Agent”，可以查看 MCP 地址、下载配置示例和 Skill。默认 ZYT 本机地址为：

```text
MCP      http://127.0.0.1:4174/mcp
资料     http://127.0.0.1:4174/api/profile
项目     http://127.0.0.1:4174/api/projects
```

MCP 提供 `get_profile`、`search_projects`、`get_project` 和 `list_capabilities` 四个只读工具。读取公开资料不需要网站模型 Key，也不会调用网站 LLM；访客使用自己的 Agent 模型理解和回答。

部署后应将 `PUBLIC_URL` 配置为访客实际能访问的站点根地址，网页生成的 MCP、Skill 和引用链接会使用该地址。具体接入见[Agent 说明](space-web/README.md#agent-接入)。

**npm 一键安装 Skill 尚未实现**，WorkBuddy 适配也仍待实机验证。现阶段可使用网页提供的 MCP/Skill 接入，不提供尚未发布的 npm 安装命令。

## 部署

在 `space-web/` 生成 ZYT 源码部署包：

```bash
npm run zyt:pack -- --platform linux/amd64
```

ARM Linux 使用 `--platform linux/arm64`。产物位于 `space-web/artifacts/delivery/`，包含源码、部署脚本和校验文件，不包含预构建镜像、模型 Key 或管理口令。服务器需具备 Docker、Compose 和构建时拉取基础镜像、npm 依赖的网络。

解压后进入包内 `deploy/`，首次可运行：

```bash
./zyt.sh start --public-url http://你的服务器IP:28090
```

完整流程见[ZYT 部署说明](deploy/release/README-ZYT.md)。如果采用资料与媒体目录挂载，后续启动和更新必须使用[本地目录方案](space-web/docs/local-content.md)中的两个 Compose 文件，保留原私有配置及数据。

## 二次开发

主要修改 `space-web/`，无需为个人站开发先编译仓库中的 Java 工程。前台布局、样式和交互都可以按自己的需要修改。

```bash
cd space-web
npm test
npm run check
```

朋友独立使用时，建议 Fork 后替换品牌、介绍、照片和作品，并使用自己的模型配置、部署目录和数据卷。当前内置 `luckypig` 与 `zyt` 两个站点标识；新增任意名称的预设还需要修改程序，不能只改文件夹名称。

- [二开入门与目录说明](space-web/docs/zyt-development.md)
- [中文表达约定与文案修改示例](space-web/docs/writing-style.md)
- [后续计划](space-web/docs/roadmap.md)

## 来源与许可

本仓库从 [halo-dev/halo](https://github.com/halo-dev/halo) Fork，保留上游代码与现有 [LICENSE](LICENSE)。个人网站程序和前台位于 `space-web/`，Halo 核心未修改；是否运行 Halo 取决于选用的内容模式。

示例站中的个人资料、照片和作品属于对应站主，复用程序时请换成自己的素材。
