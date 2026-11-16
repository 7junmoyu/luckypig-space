# 用户自行部署交付

2026-11-11。用户明确要求部署包、自行部署，不再要求提供SSH信息，也不代操作服务器。

- 交付压缩包：`space-web/artifacts/delivery/luckypig-space-0.3.0-amd64-20261111.tar.gz`，同目录`.sha256`为外部完整性校验。
- 同名目录：`README-部署.md`、`deploy.sh`、`export-image.sh`、SHA256SUMS、对应已构建镜像的app源码快照、deploy配置和原release.json。50个原始源码文件哈希保持一致。
- 当前约397KB，为可在服务器构建的源码版，**未包含镜像tar**。再次访问Docker image inspect仍被执行沙箱拒绝；没有尝试绕过。用户可在普通终端执行同名目录内`export-image.sh`，对已有`luckypig-space-web:0.3.0-amd64`核对image ID与linux/amd64后导出并生成旁边的`-with-image.tar.gz`和校验，不需要重新构建。
- 两种版本都需要服务器拉取Halo/PostgreSQL镜像；不是完全离线包。源码版还需要构建时拉取Node与npm依赖。
- `deploy.sh init`校验包后生成0600随机密码环境配置，不覆盖已有.env；`up`在Linux x86_64校验并优先加载镜像，没有时才构建，再启动独立Compose。只在用户自己执行时操作Docker。
- 包不含本机数据库、当前8条作品数据、录屏附件或Key。现有内容需单独迁移/备份，README明确旧M5备份仅含当时5条内容，不拿旧备份冒充最新数据。
- 导出脚本只打包SHA256SUMS登记的文件，实测会排除后来生成的私有deploy/.env和未登记文件。通用包不包含实际秘密。

验证：73项测试通过，新增3项交付脚本受控测试；shell语法、源码清单、压缩包解压及SHA-256校验通过。导出/启动测试使用隔离的假Docker命令，不代表实际Docker导出或服务器部署验收。真实本机x86镜像构建的既有metadata继续有效。

结果在忽略的`space-web/artifacts/handoff-validation.json`和`handoff-tests.log`。没有停止本机服务、读取/输出Key或数据库、重新构建/推送镜像、安装依赖或部署。
