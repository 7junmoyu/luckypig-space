# 不使用对象存储：在服务器项目目录维护作品

适用于现有ZYT单容器源码部署包。不开发新后台，复用已有JSON内容读取和静态文件/视频Range服务；首次增加Docker只读挂载后，资料和录屏保存在服务器文件夹中，不进入镜像，不受源码打包器单文件32MiB限制。实际容量取决于服务器磁盘，播放速度取决于服务器带宽和视频编码。

以下操作由站主在服务器执行，本轮没有远程修改线上服务。首次应用挂载会重新创建web容器，可能有短暂中断；模型设置卷保持。

## 1. 首次准备目录

进入现有解压包的`deploy`目录；同级上方应有`../app/`，当前目录有`compose.zyt.yaml`和私有`.env.zyt`。

```bash
mkdir -p content/zyt
mkdir -p media/zyt/projects/zyt-web-admin
mkdir -p media/zyt/projects/zyt-mobile-commerce
mkdir -p media/zyt/projects/zyt-harmony-office
```

把当前公开资料复制为服务器维护副本。下面命令只补缺失文件，保留以后自行修改的内容：

```bash
for name in site.json profile.json projects.json; do
  if [ ! -e "content/zyt/$name" ]; then
    cp "../app/sites/zyt/$name" "content/zyt/$name"
  fi
done
```

目录对应关系：

```text
deploy/
  .env.zyt                         # 本人私有配置，继续保留
  compose.zyt.yaml                  # 原部署配置
  compose.local-content.yaml        # 新增挂载配置
  content/zyt/
    site.json                      # 站名等品牌配置
    profile.json                   # 个人介绍与技能
    projects.json                  # 项目、正文、素材链接和发布状态
  media/zyt/projects/
    zyt-web-admin/
      demo.mp4
      screen.png
      intro.pdf
    zyt-mobile-commerce/
    zyt-harmony-office/
```

## 2. 添加只读挂载

在此`deploy`目录新建`compose.local-content.yaml`。仓库提供的同名[示例文件](examples/compose.local-content.yaml)也可直接复制到这里。

```yaml
services:
  web:
    volumes:
      - type: bind
        source: ./content/zyt
        target: /app/sites/zyt
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: ./media/zyt/projects
        target: /app/public/assets/zyt/projects
        read_only: true
        bind:
          create_host_path: false
```

这两个目录必须先创建；不要将它们指向`.local`、私人简历目录或其他站点资料。目录需允许容器用户读取，通常目录755、公开文件644即可。服务器若启用SELinux且出现容器读取权限错误，需要按该主机策略处理绑定目录标签，不要关闭整机SELinux。

使用原私有`.env.zyt`和两个Compose文件启动，仅复用当前镜像：

```bash
docker compose --env-file .env.zyt \
  -f compose.zyt.yaml -f compose.local-content.yaml \
  up -d --no-build --pull never --wait --wait-timeout 90
```

无需重新拉Node基础镜像、安装npm依赖或构建镜像。原Compose中的`web-settings`卷和端口仍保留；这里没有写入或替换模型Key。

**后续启动或更新时继续带上两个`-f`参数。** 旧`zyt.sh start`只加载基础Compose，可能移除额外挂载，不能用于这个配置的日常启动。可用以下命令检查和查看日志：

```bash
docker compose --env-file .env.zyt \
  -f compose.zyt.yaml -f compose.local-content.yaml ps
docker compose --env-file .env.zyt \
  -f compose.zyt.yaml -f compose.local-content.yaml logs --tail 100 web
```

## 3. 上传录屏、图片和文档

用SFTP工具打开服务器的`deploy/media/zyt/projects/zyt-web-admin/`目录，将真实文件放入；其他项目放到其对应ID目录。也可在自己的电脑用SCP传到实际部署目录，例如将下面`/实际部署目录/`替换后使用：

```bash
scp ./demo.mp4 root@146.56.197.54:/实际部署目录/deploy/media/zyt/projects/zyt-web-admin/demo.mp4
```

访问路径不含服务器目录名`media`：

| 服务器文件（相对deploy） | 网站地址 |
| --- | --- |
| `media/zyt/projects/zyt-web-admin/demo.mp4` | `/assets/zyt/projects/zyt-web-admin/demo.mp4` |
| `media/zyt/projects/zyt-web-admin/screen.png` | `/assets/zyt/projects/zyt-web-admin/screen.png` |
| `media/zyt/projects/zyt-web-admin/intro.pdf` | `/assets/zyt/projects/zyt-web-admin/intro.pdf` |

例如视频完整地址为`http://146.56.197.54:28090/assets/zyt/projects/zyt-web-admin/demo.mp4`。它只有在首次挂载完成且文件实际上传后才存在。

建议MP4采用H.264视频/AAC音频，路径用英文且不含空格。上传大文件时先使用`demo.uploading`临时文件名，完成后改为最终`.mp4`，避免访客读取未上传完的文件；临时文件本身仍位于公开目录，不放敏感内容。视频封面继续引用现有抽象封面，不自动截图。

## 4. 将文件放进作品详情

编辑服务器的`deploy/content/zyt/projects.json`，找到`id=zyt-web-admin`的对象。正文中加入：

```html
<h2>功能演示</h2>
<video controls playsinline preload="metadata" poster="/assets/covers/zyt-admin.svg" src="/assets/zyt/projects/zyt-web-admin/demo.mp4"></video>
<p><img src="/assets/zyt/projects/zyt-web-admin/screen.png" alt="项目功能截图"></p>
<p><a href="/assets/zyt/projects/zyt-web-admin/intro.pdf">打开项目说明 PDF</a></p>
```

上面是HTML片段；放进`content.html`时必须是合法JSON字符串。可通过VS Code远程编辑宿主机文件，保留原正文，再追加片段，并移除不再适用的“录屏尚未提供”。修改前自行复制一份JSON备份；容器只负责读取，不开放写权限，也不会自动备份此次宿主机编辑。

将HTML粘入JSON时，形式类似：

```json
"content": {
  "html": "<h2>功能演示</h2><video controls playsinline preload=\"metadata\" poster=\"/assets/covers/zyt-admin.svg\" src=\"/assets/zyt/projects/zyt-web-admin/demo.mp4\"></video>"
}
```

同样可以编辑`content/zyt/profile.json`修改介绍/技能。作品仍通过`status=published`和发布时间控制公开；新项目需要唯一ID和相应`url`。刷新页面后请求会重新读取资料，通常不需要重启；`site.json`品牌配置在启动时读取，改品牌需用相同Compose配置重启web。

挂载目录中的媒体都是公开文件。项目设为draft或下线只会隐藏项目资料，已经知道地址的人仍可读取媒体；要撤回附件需移除对应公开文件。不要把带私人联系方式的原始简历放入该目录。

## 5. 检查、备份与以后升级

- 浏览器打开视频完整地址，再打开对应作品详情验证播放和拖动；可检查`/api/projects/zyt-web-admin`是否包含新正文。
- 文件还未上传或目录没挂载时，返回404是预期情况；JSON写错会影响资料读取，修改前保留一份JSON备份。
- 后续更新镜像时保留`content/`、`media/`、`compose.local-content.yaml`和本人私有`.env.zyt`，继续使用相同Compose项目名和`web-settings`卷。不对运行卷执行`down -v`。
- 解压到新部署目录时，这两个相对绑定目录也要一并迁移，或把挂载源改成稳定的服务器绝对路径；不要只换新目录后挂上空文件夹。
- 日常备份包含上述宿主机内容目录和私有模型设置卷，两者分别保管。代码仓库不存放服务器录屏及运行资料。

当前方案是站主通过服务器文件管理维护内容，不提供网页上传按钮或编辑器，也不需要对象存储、Halo或新数据库。
