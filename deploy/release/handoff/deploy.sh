#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
image=luckypig-space-web:0.3.0-amd64
sumcheck() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum -c SHA256SUMS;
  else shasum -a 256 -c SHA256SUMS; fi
}
compose() { docker compose --env-file deploy/.env -f deploy/compose.yaml "$@"; }
case "${1:-help}" in
  verify) sumcheck ;;
  init)
    [ ! -e deploy/.env ] || { echo '已有 deploy/.env，未覆盖。'; exit 1; }
    sumcheck >/dev/null
    umask 077
    password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
    [ "${#password}" -eq 48 ] || { echo '密码生成失败。'; exit 1; }
    # Noclobber prevents replacing an existing private configuration.
    (set -C; while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in POSTGRES_PASSWORD=*) printf 'POSTGRES_PASSWORD=%s\n' "$password" ;; *) printf '%s\n' "$line" ;; esac
    done < deploy/.env.example > deploy/.env)
    echo '已生成私有 deploy/.env。请编辑站点地址、模型等配置，然后执行 ./deploy.sh up。'
    ;;
  up)
    [ "$(uname -s)/$(uname -m)" = 'Linux/x86_64' ] || { echo '此部署包面向 Linux x86_64。'; exit 1; }
    sumcheck >/dev/null
    [ -f deploy/.env ] || { echo '请先执行 ./deploy.sh init 并编辑 deploy/.env。'; exit 1; }
    if grep -q '^POSTGRES_PASSWORD=REPLACE_' deploy/.env; then echo '请先设置数据库随机密码。'; exit 1; fi
    compose config --quiet
    if [ -f images/web-amd64.tar ]; then
      docker image load --input images/web-amd64.tar
    elif ! docker image inspect "$image" >/dev/null 2>&1; then
      echo '包内没有镜像归档，正在从随包源码构建（需要联网拉取基础镜像与 npm 依赖）。'
      docker build --platform linux/amd64 --tag "$image" ./app
    fi
    [ "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" = 'linux/amd64' ] || { echo '镜像平台不匹配。'; exit 1; }
    compose pull halodb halo
    compose up -d --pull never
    compose ps
    ;;
  ps) compose ps ;;
  logs) compose logs --tail 100 web ;;
  token) compose exec web node scripts/owner-token.mjs ;;
  *) echo '用法：./deploy.sh verify | init | up | ps | logs | token' ;;
esac
