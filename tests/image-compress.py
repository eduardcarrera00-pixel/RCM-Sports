"""Browser test for assets/cam-image-compress.js (python3 tests/image-compress.py)."""
import base64
import io
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (ROOT / "assets" / "cam-image-compress.js").read_text(encoding="utf-8")


def encoded(image, fmt, **kw):
    buf = io.BytesIO()
    image.save(buf, fmt, **kw)
    return base64.b64encode(buf.getvalue()).decode(), buf.tell()


def photo(w, h):
    random.seed(7)
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        draw.line((0, y, w, y), fill=(30 + y * 120 // h, 80, 160 - y * 90 // h))
    for _ in range(900):
        x, y, r = random.randrange(w), random.randrange(h), random.randrange(5, 60)
        draw.ellipse((x, y, x + r, y + r), fill=tuple(random.randrange(256) for _ in range(3)))
    return img.filter(ImageFilter.GaussianBlur(1.2))


CASES = {
    "big_png_photo": (*encoded(photo(3000, 2000), "PNG"), "image/png", "shot.png"),
    "big_jpeg": (*encoded(photo(4032, 3024), "JPEG", quality=95), "image/jpeg", "IMG_1234.jpeg"),
    "small_jpeg": (*encoded(photo(900, 600), "JPEG", quality=70), "image/jpeg", "small.jpg"),
}
logo = Image.new("RGBA", (2400, 2400), (0, 0, 0, 0))
ImageDraw.Draw(logo).ellipse((200, 200, 2200, 2200), fill=(214, 177, 121, 255))
CASES["transparent_logo"] = (*encoded(logo, "PNG"), "image/png", "logo.png")

JS = """
async ([b64, type, name]) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const file = new File([bin], name, {type});
  const out = await window.camCompressImage(file);
  const bmp = await createImageBitmap(out);
  return {same: out === file, type: out.type, name: out.name, size: out.size, w: bmp.width, h: bmp.height};
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content("<html><body></body></html>")
    page.add_script_tag(content=SCRIPT)
    results = {k: page.evaluate(JS, [b64, t, n]) for k, (b64, size, t, n) in CASES.items()}
    browser.close()

for k, r in results.items():
    print(f"{k:17} {CASES[k][1] / 1024:8.0f} KB -> {r['size'] / 1024:6.0f} KB  {r['type']} {r['w']}x{r['h']} {r['name']}")

big = results["big_png_photo"]
assert big["type"] == "image/jpeg" and big["name"] == "shot.jpg" and max(big["w"], big["h"]) == 1600
assert big["size"] < CASES["big_png_photo"][1] / 4
jpg = results["big_jpeg"]
assert jpg["type"] == "image/jpeg" and (jpg["w"], jpg["h"]) == (1600, 1200) and jpg["size"] < 500 * 1024
assert results["small_jpeg"]["same"], "Light photos are uploaded untouched"
lg = results["transparent_logo"]
assert lg["type"] == "image/png", "Transparency is never flattened into a JPEG"
print("image-compress: OK")
