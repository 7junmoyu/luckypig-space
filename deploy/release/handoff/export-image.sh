#!/bin/sh
# Run on the Mac that already built the image. Never rebuilds or deploys.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
image=luckypig-space-web:0.3.0-amd64
expected=sha256:76d28ae6ceaf0d8b8e2a1c4b614957755ed7a0eada31a25712089b2cb23e9655
./deploy.sh verify >/dev/null
[ "$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')" = 'linux/amd64' ] || { echo '未找到已构建的 x86 镜像。'; exit 1; }
[ "$(docker image inspect "$image" --format '{{.Id}}')" = "$expected" ] || { echo '镜像标签已改变，不符合本次源码快照；已停止。'; exit 1; }
[ ! -e images/web-amd64.tar ] || { echo '已有镜像归档，未覆盖。'; exit 1; }
archive="$(pwd)-with-image.tar.gz"
[ ! -e "$archive" ] || { echo '已有完整部署压缩包，未覆盖。'; exit 1; }
mkdir -p images
temporary=images/web-amd64.tar.partial
filelist=$(mktemp)
trap 'rm -f "$temporary" "$filelist"' EXIT HUP INT TERM
docker image save --output "$temporary" "$image"
mv "$temporary" images/web-amd64.tar
if command -v sha256sum >/dev/null 2>&1; then sha256sum images/web-amd64.tar >> SHA256SUMS
else shasum -a 256 images/web-amd64.tar >> SHA256SUMS; fi
./deploy.sh verify >/dev/null
# Archive only listed public payloads, even if deploy/.env now exists.
base=$(basename "$(pwd)")
while IFS= read -r record; do
  name=$(printf '%s\n' "$record" | cut -c67-)
  printf '%s/%s\n' "$base" "$name"
done < SHA256SUMS > "$filelist"
printf '%s/SHA256SUMS\n' "$base" >> "$filelist"
if ! tar -czf "$archive" -C .. -T "$filelist"; then rm -f "$archive"; exit 1; fi
archive_name=$(basename "$archive")
if command -v sha256sum >/dev/null 2>&1; then (cd ..; sha256sum "$archive_name" > "$archive_name.sha256")
else (cd ..; shasum -a 256 "$archive_name" > "$archive_name.sha256"); fi
printf '已生成含现有 x86 镜像的部署包：%s\n' "$archive"
