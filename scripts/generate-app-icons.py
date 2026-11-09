"""Render the existing CSS leaf logo into dependency-free, opaque install icons.

The shape matches Landing.vue's 27px square, corner radii 50% 50% 50% 7px,
-20 degree rotation and hard-stop two-tone fill. The SVG stays the vector source.
"""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
BACKGROUND = (16, 44, 35)
CREAM = (228, 236, 203)
CORAL = (227, 129, 94)
SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="55%" stop-color="#e4eccb"/><stop offset="55%" stop-color="#e3815e"/></linearGradient></defs>
  <path fill="#102c23" d="M0 0h512v512H0z"/>
  <path transform="translate(256 256) rotate(-20) scale(10) translate(-13.5 -13.5)" fill="url(#leaf)" d="M13.5 0C20.956 0 27 6.044 27 13.5S20.956 27 13.5 27H7a7 7 0 0 1-7-7v-6.5C0 6.044 6.044 0 13.5 0Z"/>
</svg>
'''
COS, SIN = math.cos(math.radians(20)), math.sin(math.radians(20))


def color_at(px, py):
    dx, dy = (px - 256) / 10, (py - 256) / 10
    x, y = COS * dx - SIN * dy + 13.5, SIN * dx + COS * dy + 13.5
    if not (0 <= x <= 27 and 0 <= y <= 27):
        return BACKGROUND
    if y < 13.5 or x > 13.5:
        if (x - 13.5) ** 2 + (y - 13.5) ** 2 > 13.5 ** 2:
            return BACKGROUND
    elif x < 7 and y > 20 and (x - 7) ** 2 + (y - 20) ** 2 > 7 ** 2:
        return BACKGROUND
    return CREAM if x + y <= 29.7 else CORAL


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def render(size):
    samples = 4
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            total = [0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    color = color_at((x + (sx + .5) / samples) * 512 / size,
                                     (y + (sy + .5) / samples) * 512 / size)
                    for c in range(3):
                        total[c] += color[c]
            rows.extend(round(value / samples ** 2) for value in total)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    for name in ('app-icon.svg', 'favicon.svg'):
        (ROOT / 'public' / name).write_text(SVG)
    mark = SVG.replace('viewBox="0 0 512 512"', 'viewBox="-2 -2 31 31"').replace('  <path fill="#102c23" d="M0 0h512v512H0z"/>\n', '').replace('translate(256 256) rotate(-20) scale(10) translate(-13.5 -13.5)', 'rotate(-20 13.5 13.5)')
    (ROOT / 'public' / 'logo-mark.svg').write_text(mark)
    for size in (180, 192, 512):
        (ROOT / 'public' / f'icon-{size}.png').write_bytes(render(size))
