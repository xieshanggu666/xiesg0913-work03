#!/usr/bin/env bash
# 在无 root、Debian bookworm 环境为 Playwright chromium 补齐运行库。
# 直接读取 bookworm 的 Packages 索引定位精确 .deb，避免拿到 trixie 的高 glibc 版本。
set -euo pipefail

LIBDIR="$HOME/.local/guji-libs"
WORK=/tmp/guji-debs
mkdir -p "$LIBDIR" "$WORK"
cd "$WORK"

MIRROR="http://deb.debian.org/debian"
PKG_INDEX="$WORK/Packages.bookworm"
if [ ! -s "$PKG_INDEX" ]; then
  echo "下载 bookworm Packages 索引…"
  curl -sL --max-time 300 "$MIRROR/dists/bookworm/main/binary-arm64/Packages.gz" -o Packages.gz
  gunzip -c Packages.gz > "$PKG_INDEX"
fi

WANT=(
  libnspr4 libnss3
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxi6
  libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0
  libdbus-1-3 libgbm1 libdrm2 libxkbcommon0 libasound2
  libxrender1 libxext6 libx11-6
)

dl_one() {
  local pkg="$1"
  # 取该包最后一个段落（Packages 按字母序，精确匹配 ^Package:）
  local stanza
  stanza=$(awk -v p="$pkg" '
    BEGIN{RS=""; FS="\n"}
    $1 == "Package: " p {buf=$0}
    END{print buf}
  ' "$PKG_INDEX")
  [ -z "$stanza" ] && { echo "!! 索引中找不到 $pkg"; return 1; }
  local fname
  fname=$(printf '%s\n' "$stanza" | awk -F': ' '$1=="Filename"{print $2}')
  local ver
  ver=$(printf '%s\n' "$stanza" | awk -F': ' '$1=="Version"{print $2}')
  echo "GET $pkg $ver"
  local deb; deb=$(basename "$fname")
  if [ ! -s "$deb" ]; then curl -sL --max-time 300 -o "$deb" "$MIRROR/$fname"; fi
  dpkg-deb -x "$deb" "$LIBDIR"
}

for p in "${WANT[@]}"; do dl_one "$p"; done
echo "OK -> $LIBDIR"
