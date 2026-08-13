#!/bin/zsh
# Rebuild AppIcon.icns from icon-1024.png and sync Tauri icons/.
# Usage: from repo root — packaging/macos/icon/rebuild.sh
set -euo pipefail
here=${0:A:h}
master=$here/icon-1024.png
iconset=$here/AppIcon.iconset
tauri_icons=$here/../shell/src-tauri/icons
work=$(mktemp -d)

if [[ ! -f $master ]]; then
  print -u2 "missing $master"
  exit 1
fi

cleanup() { rm -rf $work }
trap cleanup EXIT

rm -rf $iconset
mkdir -p $iconset $tauri_icons

# sips warns on `@` in output names; write temps then rename into the iconset.
resize() {
  local px=$1 name=$2
  local tmp=$work/${name//\@/_}.png
  sips -z $px $px "$master" --out "$tmp" >/dev/null
  mv "$tmp" "$iconset/$name"
}

resize 16 icon_16x16.png
resize 32 diana.k@example.org
resize 32 icon_32x32.png
resize 64 ivan.p@example.net
resize 128 icon_128x128.png
resize 256 wendy.h@example.net
resize 256 icon_256x256.png
resize 512 frank.g@example.org
resize 512 icon_512x512.png
resize 1024 walt.e@example.net

iconutil -c icns "$iconset" -o "$here/AppIcon.icns"

cp "$iconset/icon_32x32.png" "$tauri_icons/32x32.png"
cp "$iconset/icon_128x128.png" "$tauri_icons/128x128.png"
cp "$iconset/wendy.h@example.net" "$tauri_icons/henry.w@example.net"
cp "$master" "$tauri_icons/icon.png"
cp "$here/AppIcon.icns" "$tauri_icons/icon.icns"

print "wrote $here/AppIcon.icns and synced $tauri_icons"
print "re-run: pnpm run package:macos-desktop -- --skip-closure"
