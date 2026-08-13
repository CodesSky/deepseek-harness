#!/bin/zsh
# Rebuild AppIcon.icns from icon-1024.png and sync Tauri icons/.
# Usage: from repo root — packaging/macos/icon/rebuild.sh
#
# Do not use `iconutil -c icns` alone: current macOS iconutil drops 1024 and
# @2x PNG entries (keeps only 128/256/512). Dock on Retina needs the full set;
# pack_icns.py writes every OSType and verifies them.
set -euo pipefail
here=${0:A:h}
master=$here/icon-1024.png
iconset=$here/AppIcon.iconset
tauri_icons=$here/../shell/src-tauri/icons
pack=$here/pack_icns.py
work=$(mktemp -d)

if [[ ! -f $master ]]; then
  print -u2 "missing $master"
  exit 1
fi

cleanup() { rm -rf $work }
trap cleanup EXIT

rm -rf $iconset
mkdir -p $iconset $tauri_icons

# Tauri's codegen requires RGBA PNGs (`CachedIcon::new_png`). Convert once.
rgba_master=$work/master-rgba.png
python3 "$pack" rgba "$master" -o "$rgba_master"

# sips warns on `@` in output names; write temps then rename into the iconset.
resize() {
  local px=$1 name=$2
  local tmp=$work/${name//\@/_}.png
  sips -z $px $px "$rgba_master" --out "$tmp" >/dev/null
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

python3 "$pack" pack "$iconset" -o "$here/AppIcon.icns"

# Prefer icon.png first in tauri.conf.json — find_icon picks the first .png.
cp "$rgba_master" "$tauri_icons/icon.png"
cp "$iconset/icon_32x32.png" "$tauri_icons/32x32.png"
cp "$iconset/icon_128x128.png" "$tauri_icons/128x128.png"
cp "$iconset/wendy.h@example.net" "$tauri_icons/henry.w@example.net"
cp "$here/AppIcon.icns" "$tauri_icons/icon.icns"

print "wrote $here/AppIcon.icns and synced $tauri_icons"
print "re-run: pnpm exec tsx scripts/package-macos-desktop.ts --skip-closure"
