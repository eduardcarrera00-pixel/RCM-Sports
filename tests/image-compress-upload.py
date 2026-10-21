"""La subida editorial real comprime antes de llegar a Supabase Storage."""
import base64, importlib.util, io, pathlib, random
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
full_page = fp.full_page

random.seed(3)
img = Image.effect_noise((2800, 1800), 60).convert("RGB")
img = Image.blend(img, Image.linear_gradient("L").resize((2800, 1800)).convert("RGB"), 0.5)
buf = io.BytesIO(); img.save(buf, "PNG"); raw = buf.getvalue()

with full_page() as page:
    page.wait_for_function("window.aeEditorialMedia && window.camCompressImage")
    result = page.evaluate("""async (b64) => {
      const calls = [];
      const fakeBucket = {
        upload: async (name, file, opts) => { calls.push({name, type: opts.contentType, size: file.size}); return {data: {path: name}}; },
        getPublicUrl: (p) => ({data: {publicUrl: 'https://example.invalid/' + p}})
      };
      db.storage.from = () => fakeBucket;
      db.auth.getUser = async () => ({data: {user: {id: 'u1'}}, error: null});
      currentAdmin = {name: 'Editor'};
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const path = await window.aeEditorialMedia.upload(new File([bin], 'portada.png', {type: 'image/png'}), 'articles');
      return {path, calls, url: window.aeEditorialMedia.publicUrl(path)};
    }""", base64.b64encode(raw).decode())

call = result["calls"][0]
print(f"original {len(raw)//1024} KB -> subido {call['size']//1024} KB {call['type']} {result['path']}")
assert call["type"] == "image/jpeg" and result["path"].endswith(".jpg")
assert call["size"] < len(raw) / 3
assert result["url"].endswith(result["path"]), "publicUrl acepta la ruta .jpg"
print("image-compress-upload: OK")
