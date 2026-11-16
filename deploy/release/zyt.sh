#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

fail() { printf '%s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
ZYT Space 单容器部署（服务器需 Docker + Compose v2.20+）
  ./zyt.sh start --public-url http://你的公网IP:4184
  ./zyt.sh start --public-url https://你的域名 --bind 127.0.0.1 --port 4184
  ./zyt.sh start       # 使用已有 .env.zyt；每次先构建本包源码
  ./zyt.sh status | logs | token | stop
首次IP直连默认绑定0.0.0.0。已有配置不会被命令行覆盖；修改地址请编辑.env.zyt。
token仅在你自己的终端显示站主口令，不要发到聊天或公开文档。
HELP
}
action=${1:-help}
if [[ $# -gt 0 ]]; then shift; fi
case "$action" in help|--help|-h) usage; exit 0 ;; start|status|logs|token|stop) ;; *) usage; exit 1 ;; esac
url_arg= port_arg= bind_arg=
while [[ $# -gt 0 ]]; do
  [[ "$action" == start && $# -ge 2 ]] || fail '参数无效，请运行 ./zyt.sh help'
  case "$1" in
    --public-url) [[ -z "$url_arg" ]] || fail '地址参数重复'; url_arg=$2 ;;
    --port) [[ -z "$port_arg" ]] || fail '端口参数重复'; port_arg=$2 ;;
    --bind) [[ -z "$bind_arg" ]] || fail '绑定参数重复'; bind_arg=$2 ;;
    *) fail '未知参数，请运行 ./zyt.sh help' ;;
  esac
  shift 2
done

[[ -f SHA256SUMS && ! -L SHA256SUMS ]] || fail '缺少校验清单，请使用ZYT专用部署包。'
if command -v sha256sum >/dev/null 2>&1; then sha256sum -c SHA256SUMS --quiet;
else shasum -a 256 -c SHA256SUMS >/dev/null; fi
[[ ! -L .env.zyt ]] || fail '.env.zyt不能是符号链接。'
[[ ! -e .env.zyt || -f .env.zyt ]] || fail '.env.zyt必须是普通文件。'
value() { sed -n "s/^$1=//p" "$2"; }
valid_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
url_pattern='^https?://(\[[0-9a-fA-F:]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:([0-9]{1,5}))?$'
if [[ -f .env.zyt ]]; then
  public_url=$(value PUBLIC_URL .env.zyt)
  public_url=${public_url%/}
  web_port=$(value WEB_PORT .env.zyt)
  web_bind=$(value WEB_BIND .env.zyt)
  web_bind=${web_bind:-127.0.0.1}
  [[ -z "$url_arg" || "${url_arg%/}" == "$public_url" ]] || fail '已有配置，未覆盖；请编辑.env.zyt中的PUBLIC_URL后重试。'
  [[ -z "$port_arg" || "$port_arg" == "$web_port" ]] || fail '已有配置，未覆盖；请编辑.env.zyt中的WEB_PORT后重试。'
  [[ -z "$bind_arg" || "$bind_arg" == "$web_bind" ]] || fail '已有配置，未覆盖；请编辑.env.zyt中的WEB_BIND后重试。'
else
  [[ "$action" == start ]] || fail '请先运行 ./zyt.sh start --public-url http://你的公网IP:4184'
  if [[ -z "$url_arg" && -t 0 ]]; then read -r -p '请输入公网访问地址（如 http://你的IP:4184）：' url_arg; fi
  [[ -n "$url_arg" ]] || fail '首次启动必须指定 --public-url，不会猜测公网IP。'
  public_url=${url_arg%/}
  [[ "$public_url" =~ $url_pattern ]] || fail 'PUBLIC_URL必须是无账号、子路径、查询参数的HTTP(S)根地址。'
  origin_port=${BASH_REMATCH[4]:-}
  if [[ -n "$origin_port" ]]; then valid_port "$origin_port" || fail '网址端口无效。'; fi
  web_port=${port_arg:-${origin_port:-4184}}
  web_bind=${bind_arg:-0.0.0.0}
fi
[[ "$public_url" =~ $url_pattern ]] || fail 'PUBLIC_URL格式无效，请检查.env.zyt。'
origin_port=${BASH_REMATCH[4]:-}
if [[ -n "$origin_port" ]]; then valid_port "$origin_port" || fail '网址端口无效。'; fi
valid_port "$web_port" || fail 'WEB_PORT必须为1到65535。'
[[ "$web_bind" == 0.0.0.0 || "$web_bind" == 127.0.0.1 ]] || fail 'WEB_BIND仅支持0.0.0.0或127.0.0.1。'

command -v docker >/dev/null 2>&1 || fail '请先在服务器安装并启动Docker和Compose v2.20+。'
compose_version=$(docker compose version --short) || fail '无法运行Docker Compose。'
[[ "$compose_version" =~ ^v?([0-9]+)\.([0-9]+) ]] || fail '无法识别Compose版本。'
(( BASH_REMATCH[1] > 2 || BASH_REMATCH[1] == 2 && BASH_REMATCH[2] >= 20 )) || fail '需要Docker Compose v2.20或更新版本。'
if [[ "$action" == start ]]; then
  target=$(value TARGET_PLATFORM zyt-standalone.env.example)
  if [[ -f .env.zyt ]]; then
    [[ "$(value TARGET_PLATFORM .env.zyt)" == "$target" ]] || fail '已有配置的TARGET_PLATFORM与本包不符，未构建或启动。'
  fi
  engine=$(docker info --format '{{.OSType}}/{{.Architecture}}') || fail 'Docker服务不可访问，请检查是否启动和当前用户权限。'
  case "$engine" in linux/x86_64|linux/amd64) engine=linux/amd64 ;; linux/aarch64|linux/arm64) engine=linux/arm64 ;; esac
  [[ "$engine" == "$target" ]] || fail "服务器架构$engine与本包$target不符，请使用对应架构包。"
fi

if [[ ! -f .env.zyt ]]; then
  umask 077
  temp=$(mktemp .env.zyt.tmp.XXXXXX)
  trap 'rm -f -- "$temp"' EXIT
  sed -e "s|^PUBLIC_URL=.*|PUBLIC_URL=$public_url|" -e "s|^WEB_PORT=.*|WEB_PORT=$web_port|" -e "s|^WEB_BIND=.*|WEB_BIND=$web_bind|" zyt-standalone.env.example > "$temp"
  # Atomic no-clobber: a concurrent installer cannot replace existing settings.
  ln "$temp" .env.zyt || fail '配置已由另一个进程创建，未覆盖；请重新运行。'
  rm -f -- "$temp"
  trap - EXIT
  printf '%s\n' '已生成私有.env.zyt，后续启动将保留该文件。'
fi
compose() { docker compose --env-file .env.zyt -f compose.zyt.yaml "$@"; }
compose config --quiet
case "$action" in
  start)
    printf '%s\n' '包内为最新源码，正在服务器构建镜像（需要拉取Node基础镜像与npm依赖）。'
    compose build web
    compose up -d --no-build --pull never --wait --wait-timeout 90
    compose exec -T web node --input-type=module -e '
      const root = "http://127.0.0.1:4173";
      const read = async path => { const r = await fetch(root + path, {signal: AbortSignal.timeout(5000)}); if (!r.ok) throw new Error("公开接口不可用"); return r.json(); };
      const [health, profile] = await Promise.all([read("/api/health"), read("/api/profile")]);
      if (!health.ok || health.source !== "portfolio" || profile.site?.id !== "zyt" || profile.name !== "张雨彤") throw new Error("站点资料未就绪");
      console.log(JSON.stringify({ready: true, site: profile.site.id, projects: health.projects, skills: profile.skills.length, updatedAt: profile.updatedAt}));'
    compose ps
    printf '\n网站：%s\n模型设置：%s/admin\n站主口令：在自己的终端运行 ./zyt.sh token\n' "$public_url" "$public_url"
    printf '%s\n' "监听：$web_bind:$web_port；公网IP直连时，请在服务器安全组/防火墙放行该端口。"
    ;;
  status) compose ps ;;
  logs) compose logs --tail 100 web ;;
  token) compose exec -T web node scripts/owner-token.mjs ;;
  stop) compose stop web ;;
esac
