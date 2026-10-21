#!/usr/bin/env python3
"""Create CAM Sports Instagram/TikTok MP4s with original instrumental audio.

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
import urllib.request
import wave
from array import array

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "social-videos"
SUPABASE_URL = "https://zahuhmvmqvxaunqebqaa.supabase.co"
PUBLIC_KEY = "sb_publishable_QK4qV6totowE4KjolNANrQ_O46olHYg"
FALLBACK = ROOT / "assets" / "cam-sports-logo.jpeg"
WIDTH, HEIGHT, DURATION, SAMPLE_RATE = 720, 1280, 8, 44100
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
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


def compose_original_music(path):
    """Synthesized original four-chord arpeggio; no samples or licensed songs."""
    # Am, F, C and G. Quiet plucked notes leave room for the news image.
    progressions = [
        (220.00, 261.63, 329.63),
        (174.61, 220.00, 261.63),
        (261.63, 329.63, 392.00),
        (196.00, 246.94, 293.66),
    ]
    steps = [0, 1, 2, 1, 2, 1, 0, 1] * 4
    samples = array("h")
    for n in range(SAMPLE_RATE * DURATION):
        t = n / SAMPLE_RATE
        chord = progressions[min(3, int(t / 2))]
        step = min(len(steps) - 1, int(t / .25))
        tone = chord[steps[step]] * (2 if step % 4 == 3 else 1)
        local = t % .25
        envelope = min(1, local / .02) * math.exp(-local * 9)
        pluck = (math.sin(2 * math.pi * tone * t)
                 + .24 * math.sin(4 * math.pi * tone * t)) * envelope
        bass = .28 * math.sin(2 * math.pi * chord[0] / 2 * t)
        overall_fade = min(1, t / .35, (DURATION - t) / .7)
        samples.append(int(max(-1, min(1, .20 * (pluck + bass) * overall_fade)) * 32767))
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(samples.tobytes())


def make_video(image, title, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        still = Path(tmp) / "frame.png"
        audio = Path(tmp) / "original-music.wav"
        cover(image, title).save(still)
        compose_original_music(audio)
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-loop", "1", "-framerate", "20", "-i", str(still),
            "-i", str(audio), "-t", str(DURATION), "-r", "20",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "112k",
            "-movflags", "+faststart", "-shortest", str(output)
        ], check=True, timeout=120)
        tracks = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
            "-of", "json", str(output)
        ], timeout=20)
        kinds = {track.get("codec_type") for track in json.loads(tracks)["streams"]}
        if kinds != {"video", "audio"} or output.stat().st_size < 30000:
            output.unlink(missing_ok=True)
            raise ValueError("MP4 lacks audio/video streams")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()
    if args.smoke_test:
        with tempfile.TemporaryDirectory() as tmp:
            image = Image.new("RGB", (1100, 650), "#285781")
            make_video(image, "Prueba de CAM Sports con música original", Path(tmp) / "check.mp4")
        print("Smoke test: MP4 contains H.264 video and AAC audio.")
        return

    jobs = pending_jobs()
    print("Public Instagram/TikTok jobs awaiting videos:", len(jobs))
    for job in jobs:
        key = job.get("event_key")
        if not isinstance(key, str) or not key or len(key) > 400:
            continue
        output = OUTPUT / (hashlib.md5(key.encode("utf-8")).hexdigest() + ".mp4")
        if output.exists() and output.stat().st_size > 30000:
            continue
        make_video(read_image(job.get("image_url")), job.get("title"), output)
        print("Generated:", output.relative_to(ROOT))


if __name__ == "__main__":
    main()
