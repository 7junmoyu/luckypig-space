# 当前版本如何添加项目文件、图片和视频

适用于 ZYT 的 `CONTENT_SOURCE=portfolio`，无需增加功能。`/admin`只管理模型和搜索，不能上传作品；原 Luckypig 的 Halo 后台不是 ZYT 的内容后台。

**2026-11-16用户确认暂不使用对象存储。** 当前优先选择[服务器项目目录维护方案](local-content.md)：首次挂载服务器上的资料/媒体目录后，用SFTP/SCP放文件、修改JSON，无需为每次录屏更新重建镜像，也不受下述源码打包32MiB限制。此方案只增加部署配置，没有开发网页上传后台，线上尚未应用。

## 可选参考：以后使用外部文件服务时

1. 在已有对象存储或静态文件服务的控制台上传 MP4、图片或文档，取得访客无需登录即可读取的链接。推荐 HTTPS；不要使用很快过期的临时签名链接，也不要公开桶的管理凭据。
2. 在源码 `space-web/sites/zyt/projects.json` 中找到对应项目，用编辑器修改 `content.html`。此字段是一段HTML字符串，保留JSON引号转义。
3. 视频、图片和文档的正文写法如下；下方域名和路径是示意，替换成真实上传链接后再保存：

```html
<h2>功能演示</h2>
<video controls playsinline preload="metadata" poster="/assets/covers/zyt-admin.svg" src="https://YOUR_MEDIA_HOST/projects/web-admin/demo.mp4"></video>
<p><img src="https://YOUR_MEDIA_HOST/projects/web-admin/screen.png" alt="项目功能截图"></p>
<p><a href="https://YOUR_MEDIA_HOST/projects/web-admin/intro.pdf">打开项目说明 PDF</a></p>
<p><a href="https://YOUR_DEMO_HOST/">打开在线演示</a></p>
```

粘入JSON后的形式是：

```json
"content": {
  "html": "<h2>功能演示</h2><video controls playsinline preload=\"metadata\" poster=\"/assets/covers/zyt-admin.svg\" src=\"https://YOUR_MEDIA_HOST/projects/web-admin/demo.mp4\"></video><p><a href=\"https://YOUR_MEDIA_HOST/projects/web-admin/intro.pdf\">打开项目说明 PDF</a></p>"
}
```

保留原项目说明，按需要追加正文；补上素材后，把“录屏尚未提供”等旧文字改掉。封面继续使用统一抽象风格，视频播放不要求拿截图替换封面。

普通网页链接会在新标签页打开；播放器支持MP4，推荐常见的H.264视频/AAC音频。PDF通常由浏览器预览；当前静态附件不保证一律强制下载。源码仓库或在线演示使用`<a>`，不把GitHub网页地址当作MP4文件地址，也不依赖iframe嵌入。外部文件服务需允许网页引用，并支持视频Range请求；防盗链规则需允许本站域名/地址。

## 不想使用对象存储：把小素材随源码打包

在完整Git仓库的`space-web/`目录中：

```bash
mkdir -p public/assets/zyt/projects/web-admin
cp /你的素材路径/demo.mp4 public/assets/zyt/projects/web-admin/demo.mp4
cp /你的素材路径/intro.pdf public/assets/zyt/projects/web-admin/intro.pdf
```

正文链接分别使用`/assets/zyt/projects/web-admin/demo.mp4`和`/assets/zyt/projects/web-admin/intro.pdf`。路径建议英文且不含空格；`public/`中的所有文件均可公开读取，不存放原始私人简历、口令或未准备公开的文件。

当前源码发布器会复制整个`public/`目录，但**单文件超过32MiB会拒绝打包**。长录屏优先使用外部文件链接。不要为了部署把大视频提交Git；本地保留的未跟踪素材也会进入打包目录，发布前检查实际文件清单。

## 新增一个项目

在`projects.json`数组中复制最接近的现有项目对象，再修改：

- `id`：唯一稳定标识，例如`zyt-personal-dashboard`；`url`对应`/#project/zyt-personal-dashboard`。
- `number`、`title`、`subtitle`、`summary`、`description`、`tags`：按真实项目填写。
- `content.html`：说明实现内容、个人负责部分和媒体链接；不复制其他项目的职责。
- `cover`和视频`poster`：选适用的统一封面。
- `demo=false`仅用于本人的真实项目；参考项目要保留参考属性与来源。
- `status="published"`且`publishedAt=null`或过去日期时公开；`draft`不会进入公开列表，但**放在public/的附件仍然公开**，不要用它存私密草稿文件。
- `updatedAt`：实际更新日期。需要从技能卡跳到新项目时，在`profile.json`对应技能的`projectIds`中加入新ID。

## 验证并更新服务器

1. 本机运行`npm run start:zyt`，查看项目详情、视频播放/拖动和文件链接。
2. 在`space-web/`运行`npm test`、`npm run check`，再执行`npm run zyt:pack -- --platform linux/amd64`。
3. 把新生成的`.tar.gz`和`.sha256`传至服务器，校验并解压到新目录。保留旧目录用于回退。
4. 停止旧容器后，在新包的`deploy/`目录沿用本人旧包的私有`.env.zyt`，保证Compose项目名、端口和卷名保持一致，再启动：

```bash
./zyt.sh start --public-url http://146.56.197.54:28090
```

不要执行`docker compose down -v`。相同项目名和卷会保留已保存的模型设置；不要把此私有配置交给朋友。此过程由站主执行，本轮没有远程更新网站。

不要直接修改已交付包的`app/`文件后再运行`zyt.sh`：脚本会核对清单，手动修改会触发完整性校验失败。推荐在Git源码修改并重新打包。也不建议`docker cp`进容器：根文件系统只读，且重建后修改会丢失。

检查`/api/projects`和`/api/projects/项目ID`中的新资料、作品页面与媒体链接。只有更换外部文件服务上同一路径的文件且页面元数据不变时，可以不重新部署网站；一般作品文字和链接变更仍需重新打包。
