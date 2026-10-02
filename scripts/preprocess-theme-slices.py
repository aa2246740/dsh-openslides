#!/usr/bin/env python3
import json
import os
import pathlib
from PIL import Image

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
THEMES_DIR = REPO_ROOT / "vendor/open-kimi-ppt/git-pre-wipe/docs/themes"
OUTPUT_DIR = REPO_ROOT / "apps/native-web/public/theme-slices"

TARGET_WIDTH = 960
TARGET_HEIGHT = 540
QUALITY = 90

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    total_slices = 0

    image_files = sorted(THEMES_DIR.rglob("*.jpg"))
    print(f"Found {len(image_files)} theme strip images in {THEMES_DIR}")

    for img_path in image_files:
        rel_to_themes = img_path.relative_to(THEMES_DIR)
        category = rel_to_themes.parts[0]
        slug = img_path.stem
        style_id = f"{category}/{slug}"

        out_style_dir = OUTPUT_DIR / category / slug
        out_style_dir.mkdir(parents=True, exist_ok=True)

        try:
            with Image.open(img_path) as img:
                w, h = img.size
                tile_h = round(w * 9 / 16)
                page_count = max(1, round(h / tile_h))
                pages = []

                for i in range(page_count):
                    top = i * tile_h
                    bottom = min(h, top + tile_h)
                    # Handle slight non-exact ratio
                    if i == page_count - 1 and bottom < h:
                        bottom = h
                    box = (0, top, w, bottom)
                    slice_img = img.crop(box)
                    # Resize with high quality Lanczos filter for crisp 3x+ rendering
                    resized = slice_img.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
                    out_slice_path = out_style_dir / f"{i}.webp"
                    resized.save(out_slice_path, "WEBP", quality=QUALITY)

                    rel_web_path = f"./theme-slices/{category}/{slug}/{i}.webp"
                    pages.append(rel_web_path)
                    total_slices += 1

                manifest[style_id] = {
                    "styleId": style_id,
                    "category": category,
                    "slug": slug,
                    "pageCount": page_count,
                    "width": TARGET_WIDTH,
                    "height": TARGET_HEIGHT,
                    "cover": pages[0] if pages else "",
                    "pages": pages,
                }
                print(f"✓ [{style_id}] processed {page_count} pages ({w}x{h} -> {TARGET_WIDTH}x{TARGET_HEIGHT})")
        except Exception as e:
            print(f"✗ Failed to process {img_path}: {e}")

    manifest_file = OUTPUT_DIR / "manifest.json"
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nCompleted! Generated {total_slices} slices for {len(manifest)} styles.")
    print(f"Manifest written to {manifest_file}")

if __name__ == "__main__":
    main()
