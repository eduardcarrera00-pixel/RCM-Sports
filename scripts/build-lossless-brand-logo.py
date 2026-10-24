#!/usr/bin/env python3
"""Generate a pixel-identical transparent WebP for the CAM SPORTS approved wordmark.

Only changes delivery format: no resize, color conversion visible to browsers,
reframing, alpha flattening, retouching, or redesign.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageChops
import argparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/cam-sports-logo-completo.png'
TARGET = ROOT / 'assets/cam-sports-logo-completo.webp'


def convert():
    with Image.open(SOURCE) as original:
        source = original.convert('RGBA')
        out = BytesIO()
        source.save(out, format='WEBP', lossless=True, method=6, exact=True)
        raw = out.getvalue()
        with Image.open(BytesIO(raw)) as result:
            result = result.convert('RGBA')
            if result.size != source.size or ImageChops.difference(source, result).getbbox():
                raise RuntimeError('Lossless brand artwork changed pixels or dimensions')
    if len(raw) >= SOURCE.stat().st_size:
        raise RuntimeError('Lossless WebP is not smaller than the existing PNG')
    return raw


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    encoded = convert()
    if args.check:
        if not TARGET.is_file() or TARGET.read_bytes() != encoded:
            raise RuntimeError('Brand WebP missing or stale; regenerate from original PNG')
    else:
        TARGET.write_bytes(encoded)
    old = SOURCE.stat().st_size
    print(f'PASS: exact RGBA and dimensions maintained; original {old} B, WebP {len(encoded)} B; saved {old - len(encoded)} B ({100*(old-len(encoded))/old:.1f}%).')


if __name__ == '__main__':
    main()
