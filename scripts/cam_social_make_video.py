#!/usr/bin/env python3
"""Create CAM Sports Instagram/TikTok MP4s with authorized, rotating music.

Only reads already-public editor events through an anonymous read-only RPC.
Runs in GitHub Actions; the GITHUB_TOKEN commits public MP4s, never app secrets.
"""
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.error
import re
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "social-videos"
SUPABASE_URL = "https://zahuhmvmqvxaunqebqaa.supabase.co"
PUBLIC_KEY = "sb_publishable_QK4qV6totowE4KjolNANrQ_O46olHYg"
FALLBACK = ROOT / "assets" / "cam-sports-logo.jpeg"
WIDTH, HEIGHT, DURATION, SAMPLE_RATE = 720, 1280, 8, 44100
# Instagram Reels rejects videos under 23 fps; 30 is accepted by Reels and TikTok.
FPS = 30
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BRAND_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
ALLOWED_IMAGE_HOSTS = {
    "zahuhmvmqvxaunqebqaa.supabase.co",
    "camsports.github.io",
    "eduardcarrera00-pixel.github.io",
    "images.unsplash.com",
    "upload.wikimedia.org",
}


class BlockRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Redirected media is not allowed")


HTTP = urllib.request.build_opener(BlockRedirects)


def pending_jobs():
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/rpc/cam_social_video_jobs",
        data=json.dumps({"max_jobs": 8}).encode(),
        headers={"apikey": PUBLIC_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with HTTP.open(req, timeout=20) as response:
        jobs = json.load(response)
    if not isinstance(jobs, list):
        raise ValueError("Unexpected public jobs response")
    return jobs


def read_image(image_url):
    parsed = urllib.parse.urlsplit(image_url or "")
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.hostname not in ALLOWED_IMAGE_HOSTS or parsed.port not in (None, 443)):
        return Image.open(FALLBACK).convert("RGB")
    if parsed.hostname == "zahuhmvmqvxaunqebqaa.supabase.co" and not parsed.path.startswith(
        "/storage/v1/object/public/article-images/"
    ):
        return Image.open(FALLBACK).convert("RGB")
    if parsed.hostname in {"camsports.github.io", "eduardcarrera00-pixel.github.io"} and not (
        parsed.path.startswith("/assets/") or parsed.path.startswith("/RCM-Sports/assets/")
    ):
        return Image.open(FALLBACK).convert("RGB")

    try:
        req = urllib.request.Request(image_url, headers={"User-Agent": "CAMSportsMedia/1.0"})
        with HTTP.open(req, timeout=20) as response:
            if not response.headers.get("Content-Type", "").lower().startswith("image/"):
                raise ValueError("Not an image")
            data = response.read(6 * 1024 * 1024 + 1)
        if len(data) > 6 * 1024 * 1024:
            raise ValueError("Image is too large")
        image = Image.open(io.BytesIO(data))
        image.load()
        return image.convert("RGB")
    except (ValueError, OSError, urllib.error.URLError):
        return Image.open(FALLBACK).convert("RGB")


def font(size, bold=False):
    return ImageFont.truetype(BOLD_FONT_PATH if bold else FONT_PATH, size)


def wrap(draw, text, text_font, max_width=630, limit=4):
    words = " ".join(str(text or "CAM SPORTS").split())[:220].split(" ")
    lines = []
    for word in words:
        candidate = (lines[-1] + " " + word) if lines else word
        if lines and draw.textbbox((0, 0), candidate, font=text_font)[2] > max_width:
            if len(lines) >= limit:
                lines[-1] = lines[-1][:45].rstrip() + "…"
                break
            lines.append(word)
        elif lines:
            lines[-1] = candidate
        else:
            lines.append(candidate)
    return lines[:limit]


def cover(image, title):
    # 9:16 editorial still; colors follow CAM Sports' dark navy and muted gold.
    back = ImageOps.fit(image, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS)
    back = back.filter(ImageFilter.GaussianBlur(30)).convert("RGBA")
    back.alpha_composite(Image.new("RGBA", (WIDTH, HEIGHT), (9, 22, 34, 190)))
    draw = ImageDraw.Draw(back)
    gold = (214, 177, 121, 255)
    draw.text((44, 85), "CAM SPORTS", font=font(43, True), fill=(247, 237, 219, 255))
    draw.rectangle((44, 152, 156, 155), fill=gold)
    draw.text((44, 185), "LA NOTICIA EN 8 SEGUNDOS", font=font(22), fill=gold)

    # Keep the full photo legible, no club logo or original image is altered.
    thumb = ImageOps.contain(image, (650, 555), Image.Resampling.LANCZOS)
    area = Image.new("RGBA", (660, 570), (14, 25, 36, 238))
    x = (660 - thumb.width) // 2
    y = (570 - thumb.height) // 2
    area.paste(thumb, (x, y))
    back.alpha_composite(area, (30, 270))
    draw = ImageDraw.Draw(back)
    draw.rectangle((30, 270, 689, 840), outline=gold, width=2)

    heading = font(40, True)
    for i, line in enumerate(wrap(draw, title, heading)):
        draw.text((45, 895 + 56 * i), line, font=heading, fill=(250, 245, 235, 255))
    draw.rectangle((44, 1165, 675, 1167), fill=(120, 117, 105, 255))
    draw.text((44, 1190), "LEE MÁS EN CAM SPORTS", font=font(23, True), fill=gold)
    return back.convert("RGB")


def promo_cover(image, title, kicker):
    """Daily promo post: full-bleed scene, gold kicker and a large headline."""
    back = ImageOps.fit(image, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS).convert("RGBA")
    # Navy veil, stronger at the bottom so the headline always reads.
    veil = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    vd = ImageDraw.Draw(veil)
    for y in range(HEIGHT):
        alpha = int(70 + 165 * max(0, (y - HEIGHT * .25) / (HEIGHT * .75)) ** 1.2)
        vd.line((0, y, WIDTH, y), fill=(9, 22, 34, min(235, alpha)))
    back.alpha_composite(veil)
    draw = ImageDraw.Draw(back)
    gold = (214, 177, 121, 255)
    cream = (250, 245, 235, 255)
    draw.text((44, 85), "CAM SPORTS", font=font(43, True), fill=(247, 237, 219, 255))
    draw.rectangle((44, 152, 156, 155), fill=gold)

    heading = font(58, True)
    lines = wrap(draw, title, heading, max_width=630, limit=5)
    top = 1080 - 74 * len(lines)
    kicker_font = font(25, True)
    draw.text((44, top - 62), str(kicker or "CAM SPORTS")[:40].upper(), font=kicker_font, fill=gold)
    for i, line in enumerate(lines):
        draw.text((44, top + 74 * i), line, font=heading, fill=cream)
    draw.rectangle((44, 1165, 675, 1167), fill=(120, 117, 105, 255))
    draw.text((44, 1190), "CAMSPORTS.GITHUB.IO", font=font(23, True), fill=gold)
    return back.convert("RGB")


def brand_cover(image, title, kicker):
    """Preserve the curated blue illustration and add the changing editorial copy."""
    blue = image.getpixel((0, 0))
    back = Image.new("RGB", (WIDTH, HEIGHT), blue)
    art = ImageOps.fit(image, (WIDTH, 850), method=Image.Resampling.LANCZOS)
    back.paste(art, (0, 180))
    draw = ImageDraw.Draw(back)
    cream, gold = (250, 245, 235), (214, 177, 121)
    # Solid bands protect the changing text without blurring or obscuring the art.
    draw.rectangle((0, 0, WIDTH, 180), fill=blue)
    draw.rectangle((0, 930, WIDTH, HEIGHT), fill=blue)
    draw.text((42, 47), "CAM SPORTS", font=ImageFont.truetype(BRAND_FONT_PATH, 42), fill=cream)
    draw.rectangle((42, 113, 150, 116), fill=gold)
    draw.text((42, 947), str(kicker or "CAM SPORTS")[:36].upper(),
              font=font(22, True), fill=gold)
    heading = font(42, True)
    for i, line in enumerate(wrap(draw, title, heading, max_width=634, limit=4)):
        draw.text((42, 993 + 53 * i), line, font=heading, fill=cream)
    draw.text((42, 1218), "CAMSPORTS.GITHUB.IO", font=font(19, True), fill=gold)
    return back


def get_authorized_music(source_url, destination):
    """Only download CC0 catalog URLs assigned by the private publication queue."""
    parsed = urllib.parse.urlsplit(source_url or "")
    if (parsed.scheme != "https" or parsed.netloc != "en.freepd.cn"
            or not re.fullmatch(r"/api/music/[a-fA-F0-9]+", parsed.path)
            or parsed.query or parsed.fragment):
        raise ValueError("Music URL is not on the authorized CC0 source allowlist")
    request = urllib.request.Request(
        source_url, headers={"User-Agent": "CAMSportsMedia/1.0", "Accept": "audio/mpeg"}
    )
    with HTTP.open(request, timeout=35) as response:
        mime = response.headers.get("Content-Type", "").lower().split(";")[0].strip()
        if mime not in ("audio/mpeg", "audio/mp3", "application/octet-stream"):
            raise ValueError("Music source returned non-audio content")
        data = response.read(18 * 1024 * 1024 + 1)
    if not 4096 < len(data) <= 18 * 1024 * 1024:
        raise ValueError("Music download is empty or exceeds the 18 MB limit")
    destination.write_bytes(data)


def audio_duration(path):
    info = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type", "-of", "json", str(path)
    ], timeout=25))
    if not any(t.get("codec_type") == "audio" for t in info.get("streams", [])):
        raise ValueError("Licensed track has no audio stream")
    duration = float(info.get("format", {}).get("duration") or 0)
    if not math.isfinite(duration) or duration < DURATION + .2:
        raise ValueError("Licensed track is too short for the video")
    return duration


def make_video(image, title, output, style="news", kicker=None,
               audio_url=None, track_slug=None, selection_key="", fixture_audio=None):
    """Music is mandatory: never fall back to the former synthesized jingle."""
    if not fixture_audio and (not audio_url or not track_slug or not selection_key):
        raise ValueError("Missing authorized music assignment; MP4 not published")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        still = Path(tmp) / "frame.png"
        audio = Path(tmp) / "licensed-track.mp3"
        frame = (brand_cover(image, title, kicker) if style == "brand"
                 else promo_cover(image, title, kicker) if style == "promo"
                 else cover(image, title))
        frame.save(still)
        if fixture_audio:
            audio = Path(fixture_audio)
        else:
            get_authorized_music(audio_url, audio)
        duration = audio_duration(audio)
        # Deterministic excerpt for safe retries, with variation across events.
        fraction = int.from_bytes(hashlib.sha256(
            (selection_key + ":" + (track_slug or "test")).encode("utf-8")
        ).digest()[:8], "big") / 2 ** 64
        offset = (duration - DURATION - .1) * fraction
        # Gentle lead-in/out and normalized background loudness.
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-loop", "1", "-framerate", str(FPS), "-i", str(still),
            "-ss", f"{offset:.3f}", "-i", str(audio),
            "-t", str(DURATION), "-r", str(FPS),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-af", "loudnorm=I=-20:TP=-3:LRA=9,afade=t=in:st=0:d=0.25,afade=t=out:st=7.1:d=0.9",
            "-ar", "44100", "-movflags", "+faststart", "-shortest", str(output)
        ], check=True, timeout=120)
        tracks = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,avg_frame_rate",
            "-of", "json", str(output)
        ], timeout=20)
        streams = json.loads(tracks)["streams"]
        kinds = {track.get("codec_type") for track in streams}
        rates = [track.get("avg_frame_rate", "0/1") for track in streams
                 if track.get("codec_type") == "video"]
        num, _, den = (rates[0] if rates else "0/1").partition("/")
        if float(num or 0) / float(den or 1) < 23:
            output.unlink(missing_ok=True)
            raise ValueError("MP4 frame rate is below Instagram's 23 fps minimum")
        if (kinds != {"video", "audio"} or
                not any(t.get("codec_type") == "audio" and t.get("codec_name") == "aac" for t in streams)
                or output.stat().st_size < 30000):
            output.unlink(missing_ok=True)
            raise ValueError("MP4 lacks valid H.264/AAC streams")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument("--brand-preview", type=Path,
                        help="Write a still preview of the new social layout")
    args = parser.parse_args()
    if args.brand_preview:
        args.brand_preview.parent.mkdir(parents=True, exist_ok=True)
        brand_cover(Image.open(ROOT / "assets/social-brand/takes.jpg").convert("RGB"),
                    "Tu opinión también cuenta", "Takes · debate").save(args.brand_preview)
        print("Brand preview:", args.brand_preview)
        return
    if args.smoke_test:
        with tempfile.TemporaryDirectory() as tmp:
            # Local test fixture, NEVER used for a real publication.
            fixture = Path(tmp) / "fixture.mp3"
            subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
                            "-c:a", "libmp3lame", str(fixture)], check=True, timeout=30)
            image = Image.new("RGB", (1100, 650), "#285781")
            make_video(image, "Prueba de CAM Sports con música autorizada",
                       Path(tmp) / "check.mp4", fixture_audio=fixture)
            make_video(image, "¿Ya pusiste tu Pick de hoy?", Path(tmp) / "promo.mp4",
                       "promo", "Cocina Picks", fixture_audio=fixture)
            try:
                make_video(image, "Sin licencia", Path(tmp) / "blocked.mp4")
                raise AssertionError("Unlicensed output was incorrectly allowed")
            except ValueError:
                pass
        print("Smoke test: music required, MP4 contains H.264 video and AAC audio.")
        return

    jobs = pending_jobs()
    print("Public Instagram/TikTok jobs awaiting videos:", len(jobs))
    for job in jobs:
        key = job.get("event_key")
        if not isinstance(key, str) or not key or len(key) > 400:
            continue
        network = job.get("network")
        if network not in ("instagram", "tiktok"):
            raise ValueError("Unsupported music delivery network")
        identity = key + ":" + network
        output = OUTPUT / (hashlib.md5(identity.encode("utf-8")).hexdigest() + ".mp4")
        if output.exists() and output.stat().st_size > 30000:
            continue
        style = ("brand" if "/assets/social-brand/" in (job.get("image_url") or "")
                 else "promo" if job.get("style") == "promo" else "news")
        make_video(read_image(job.get("image_url")), job.get("title"), output, style,
                   job.get("kicker"), job.get("music_url"), job.get("track_slug"),
                   selection_key=identity)
        print("Generated:", network, job.get("track_slug"), output.relative_to(ROOT))


if __name__ == "__main__":
    main()
