#!/usr/bin/env python3
"""Pack a macOS .iconset directory into a complete .icns (PNG OSTypes).

Apple's `iconutil -c icns` on current macOS drops 1024 and @2x PNG entries from
an otherwise-valid iconset, leaving only 128/256/512. Dock on Retina displays
needs those sizes; this packer writes the full OSType set and verifies them.
"""

from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path

# iconset filename → ICNS OSType (pixel size in comment).
ICONSET_TO_OSTYPE: tuple[tuple[str, bytes], ...] = (
  ("icon_16x16.png", b"icp4"),  # 16
  ("diana.k@example.org", b"ic11"),  # 32
  ("icon_32x32.png", b"icp5"),  # 32
  ("ivan.p@example.net", b"ic12"),  # 64
  ("icon_128x128.png", b"ic07"),  # 128
  ("wendy.h@example.net", b"ic13"),  # 256 (128@2x)
  ("icon_256x256.png", b"ic08"),  # 256
  ("frank.g@example.org", b"ic14"),  # 512 (256@2x)
  ("icon_512x512.png", b"ic09"),  # 512
  ("walt.e@example.net", b"ic10"),  # 1024 (512@2x)
)

REQUIRED_OSTYPES = frozenset(ostype for _, ostype in ICONSET_TO_OSTYPE)


def png_info(data: bytes) -> tuple[int, int, int]:
  """Return (width, height, color_type) from a PNG buffer."""
  if data[:8] != b"\x89PNG\r\n\x1a\n":
    raise ValueError("not a PNG")
  # IHDR is the first chunk.
  length = struct.unpack(">I", data[8:12])[0]
  if data[12:16] != b"IHDR" or length < 13:
    raise ValueError("PNG missing IHDR")
  width, height = struct.unpack(">II", data[16:24])
  color_type = data[25]
  return width, height, color_type


def ensure_rgba_png(path: Path) -> bytes:
  """Read a PNG and return PNG bytes with color type RGBA (6).

  RGB masters are accepted: an opaque alpha channel is added. Already-RGBA
  files are returned unchanged (re-serialized only when color type is not 6).
  """
  data = path.read_bytes()
  width, height, color_type = png_info(data)
  if color_type == 6:
    return data
  if color_type != 2:
    raise ValueError(f"{path}: unsupported PNG color_type={color_type} (need RGB or RGBA)")

  pos = 8
  idat = b""
  while pos + 8 <= len(data):
    length = struct.unpack(">I", data[pos : pos + 4])[0]
    ctype = data[pos + 4 : pos + 8]
    chunk = data[pos + 8 : pos + 8 + length]
    pos += 12 + length
    if ctype == b"IDAT":
      idat += chunk
    elif ctype == b"IEND":
      break

  raw = zlib.decompress(idat)
  bpp = 3
  stride = width * bpp
  prev = bytearray(stride)
  rows: list[bytearray] = []
  i = 0
  for _ in range(height):
    filter_type = raw[i]
    i += 1
    row = bytearray(raw[i : i + stride])
    i += stride
    if filter_type == 0:
      pass
    elif filter_type == 1:
      for x in range(stride):
        left = row[x - bpp] if x >= bpp else 0
        row[x] = (row[x] + left) & 255
    elif filter_type == 2:
      for x in range(stride):
        row[x] = (row[x] + prev[x]) & 255
    elif filter_type == 3:
      for x in range(stride):
        left = row[x - bpp] if x >= bpp else 0
        row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
    elif filter_type == 4:

      def paeth(a: int, b: int, c: int) -> int:
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        if pa <= pb and pa <= pc:
          return a
        if pb <= pc:
          return b
        return c

      for x in range(stride):
        a = row[x - bpp] if x >= bpp else 0
        b = prev[x]
        c = prev[x - bpp] if x >= bpp else 0
        row[x] = (row[x] + paeth(a, b, c)) & 255
    else:
      raise ValueError(f"{path}: unsupported PNG filter {filter_type}")
    rows.append(row)
    prev = row

  out_stride = width * 4
  filtered = bytearray()
  for row in rows:
    filtered.append(0)  # None filter
    for x in range(0, stride, 3):
      filtered.extend((row[x], row[x + 1], row[x + 2], 255))

  def chunk(tag: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

  ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
  return (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", ihdr)
    + chunk(b"IDAT", zlib.compress(bytes(filtered), 9))
    + chunk(b"IEND", b"")
  )


def list_ostypes(icns: bytes) -> list[bytes]:
  """Return OSType tags from an .icns buffer."""
  if icns[:4] != b"icns":
    raise ValueError("not an icns")
  declared = struct.unpack(">I", icns[4:8])[0]
  if declared != len(icns):
    raise ValueError(f"icns size mismatch: declared={declared} actual={len(icns)}")
  off = 8
  tags: list[bytes] = []
  while off + 8 <= len(icns):
    tag = icns[off : off + 4]
    size = struct.unpack(">I", icns[off + 4 : off + 8])[0]
    if size < 8 or off + size > len(icns):
      raise ValueError(f"bad icns entry at {off}")
    tags.append(tag)
    off += size
  if off != len(icns):
    raise ValueError("icns trailing bytes")
  return tags


def pack_iconset(iconset: Path, output: Path) -> None:
  """Write `output` .icns from `iconset` PNGs; require every Dock OSType."""
  chunks: list[bytes] = []
  for name, ostype in ICONSET_TO_OSTYPE:
    path = iconset / name
    if not path.is_file():
      raise FileNotFoundError(f"missing iconset member: {path}")
    png = ensure_rgba_png(path)
    width, height, color_type = png_info(png)
    if color_type != 6:
      raise ValueError(f"{path}: expected RGBA after conversion, got color_type={color_type}")
    if width != height:
      raise ValueError(f"{path}: non-square {width}x{height}")
    chunks.append(ostype + struct.pack(">I", 8 + len(png)) + png)

  body = b"".join(chunks)
  icns = b"icns" + struct.pack(">I", 8 + len(body)) + body
  present = set(list_ostypes(icns))
  missing = sorted(REQUIRED_OSTYPES - present)
  if missing:
    raise RuntimeError(f"packed icns missing OSTypes: {missing!r}")
  output.write_bytes(icns)


def verify_icns(path: Path) -> None:
  """Fail unless `path` contains every required Dock OSType with PNG payloads."""
  tags = set(list_ostypes(path.read_bytes()))
  missing = sorted(REQUIRED_OSTYPES - tags)
  if missing:
    raise RuntimeError(f"{path}: missing OSTypes {missing!r}; present={sorted(tags)!r}")


def main(argv: list[str]) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  sub = parser.add_subparsers(dest="cmd", required=True)

  pack = sub.add_parser("pack", help="pack an .iconset into .icns")
  pack.add_argument("iconset", type=Path)
  pack.add_argument("-o", "--output", type=Path, required=True)

  verify = sub.add_parser("verify", help="verify an .icns has Dock OSTypes")
  verify.add_argument("icns", type=Path)

  rgba = sub.add_parser("rgba", help="write an RGBA PNG from RGB/RGBA input")
  rgba.add_argument("input", type=Path)
  rgba.add_argument("-o", "--output", type=Path, required=True)

  args = parser.parse_args(argv)
  if args.cmd == "pack":
    pack_iconset(args.iconset, args.output)
    verify_icns(args.output)
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")
  elif args.cmd == "verify":
    verify_icns(args.icns)
    print(f"ok {args.icns}")
  elif args.cmd == "rgba":
    args.output.write_bytes(ensure_rgba_png(args.input))
    print(f"wrote {args.output}")
  else:
    raise AssertionError(args.cmd)
  return 0


if __name__ == "__main__":
  try:
    raise SystemExit(main(sys.argv[1:]))
  except Exception as exc:  # noqa: BLE001 — CLI boundary
    print(f"pack_icns: {exc}", file=sys.stderr)
    raise SystemExit(1) from exc
