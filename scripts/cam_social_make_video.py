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
PICK_TEMPLATE_IMAGES = ("picks", "football", "champion")
PICK_TRACKS = OUTPUT / "pick-template-tracks.json"
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


def read_image(image_url, required=False):
    def fallback():
        if required:
            raise ValueError("Pick photo unavailable; refusing replacement artwork")
        return Image.open(FALLBACK).convert("RGB")
    parsed = urllib.parse.urlsplit(image_url or "")
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.hostname not in ALLOWED_IMAGE_HOSTS or parsed.port not in (None, 443)):
        return fallback()
    if parsed.hostname == "zahuhmvmqvxaunqebqaa.supabase.co" and not parsed.path.startswith(
        "/storage/v1/object/public/article-images/"
    ):
        return fallback()
    if parsed.hostname in {"camsports.github.io", "eduardcarrera00-pixel.github.io"} and not (
        parsed.path.startswith("/assets/") or parsed.path.startswith("/RCM-Sports/assets/")
    ):
        return fallback()

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
        return fallback()


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


# Conservative shared area for immersive app controls and taller phone crops.
# 720x1280 canvas: top 200, bottom 460, left 72, right 132 pixels clear.
SAFE_BOX = (72, 200, 588, 820)


def safe_line(draw, text, position, text_font, fill):
    text = " ".join(str(text or "").split())
    while text and draw.textbbox((0, 0), text, font=text_font)[2] > 516:
        text = text.rstrip("…")[:-1].rstrip() + "…"
    draw.text(position, text, font=text_font, fill=fill)


def short_cover(image, title, kicker, branded=False):
    """Keep all meaningful content inside the shared short-video safe area."""
    blue = image.getpixel((0, 0)) if branded else (9, 22, 34)
    back = Image.new("RGB", (WIDTH, HEIGHT), blue)
    draw = ImageDraw.Draw(back)
    cream, gold = (250, 245, 235), (214, 177, 121)
    safe_line(draw, "CAM SPORTS", (72, 200),
              ImageFont.truetype(BRAND_FONT_PATH, 34), cream)
    draw.rectangle((72, 253, 180, 256), fill=gold)
    # Contain preserves the entire illustration/photo; never crop its sides.
    art = ImageOps.contain(image, (516, 260), Image.Resampling.LANCZOS)
    back.paste(art, (72 + (516-art.width)//2, 280 + (260-art.height)//2))
    safe_line(draw, str(kicker or "CAM SPORTS").upper(), (72, 558), font(22, True), gold)
    heading = font(34, True)
    lines = wrap(draw, title, heading, max_width=516, limit=4)
    for i, line in enumerate(lines):
        safe_line(draw, line, (72, 600 + 43*i), heading, cream)
    safe_line(draw, "CAMSPORTS.GITHUB.IO", (72, 792), font(18, True), gold)
    return back


def cover(image, title):
    return short_cover(image, title, "LA NOTICIA EN 8 SEGUNDOS")


def promo_cover(image, title, kicker):
    return short_cover(image, title, kicker)


def brand_cover(image, title, kicker):
    return short_cover(image, title, kicker, branded=True)


def pick_lines(selection):
    """Keep explicit ticket lines; split common parlay separators, not odds."""
    text = str(selection or "").replace("\\n", "\n")
    return [line.strip(" •\t\r") for line in
            re.split(r"\n+|\s+[|•]\s+|;\s*|\s+\+\s+(?!\d)", text)
            if line.strip(" •\t\r")]


def full_wrap(draw, text, text_font, width=480):
    """Wrap every character, including long tokens, without ellipses."""
    lines, current = [], ""
    for char in " ".join(str(text).split()):
        candidate = current + char
        if current and draw.textlength(candidate, font=text_font) > width:
            if " " in current:
                prefix, tail = current.rsplit(" ", 1)
                lines.append(prefix)
                current = tail + char
            else:
                lines.append(current)
                current = char
        else:
            current = candidate
    if current.strip():
        lines.append(current.strip())
    return lines


def pick_pages(image, job):
    """Actual Pick photo and complete selections, paginated inside SAFE_BOX."""
    base = Image.new("RGB", (WIDTH, HEIGHT), "#091622")
    draw = ImageDraw.Draw(base)
    cream, gold = "#faf5eb", "#d6b179"
    safe_line(draw, "CAM SPORTS", (72, 200),
              ImageFont.truetype(BRAND_FONT_PATH, 34), cream)
    draw.rectangle((72, 253, 180, 256), fill=gold)
    art = ImageOps.contain(image, (516, 140), Image.Resampling.LANCZOS)
    base.paste(art, (72 + (516-art.width)//2, 270 + (140-art.height)//2))
    safe_line(draw, "PICK DEL EDITOR", (72, 424), font(20, True), gold)
    for i, line in enumerate(wrap(draw, job.get("title") or job.get("event_name"),
                                  font(27, True), max_width=516, limit=2)):
        safe_line(draw, line, (72, 461 + i*34), font(27, True), cream)
    for i, line in enumerate(wrap(draw, job.get("event_name") or "",
                                  font(21), max_width=516, limit=2)):
        safe_line(draw, line, (72, 535 + i*27), font(21), gold)
    body_font = font(23, True)
    pages, rows = [], []
    selections = pick_lines(job.get("selection"))
    if not selections:
        raise ValueError("Pick has no selections; refusing a generic video")
    # Five readable rows per page; never shrink or discard a parlay leg.
    for number, selection in enumerate(selections, 1):
        lines = full_wrap(draw, f"{number}. {selection}", body_font)
        if rows and len(rows) + len(lines) > 5:
            pages.append(rows)
            rows = []
        for line in lines:
            if len(rows) == 5:
                pages.append(rows)
                rows = []
            rows.append(line)
    if rows:
        pages.append(rows)
    frames = []
    odds = job.get("american_odds")
    odds_text = f"Cuota {int(odds):+d}" if odds is not None else ""
    for index, page in enumerate(pages, 1):
        frame = base.copy()
        draw = ImageDraw.Draw(frame)
        for i, line in enumerate(page):
            draw.text((72, 594 + 30*i), line, font=body_font, fill=cream)
        safe_line(draw, f"{odds_text}   ·   {index}/{len(pages)}", (72, 762), font(20, True), gold)
        safe_line(draw, "CAMSPORTS.GITHUB.IO", (72, 798), font(18, True), gold)
        frames.append(frame)
    return frames


def check_music_url(source_url):
    parsed = urllib.parse.urlsplit(source_url or "")
    if (parsed.scheme != "https" or parsed.netloc != "en.freepd.cn"
            or not re.fullmatch(r"/api/music/[a-fA-F0-9]+", parsed.path)
            or parsed.query or parsed.fragment):
        raise ValueError("Music URL is not on the authorized CC0 source allowlist")


def get_authorized_music(source_url, destination):
    """Only download CC0 catalog URLs assigned by the private publication queue."""
    check_music_url(source_url)
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
               audio_url=None, track_slug=None, selection_key="", fixture_audio=None,
               cached_audio=None, pick=None):
    """Music is mandatory: never fall back to the former synthesized jingle."""
    if not fixture_audio and (not audio_url or not track_slug or not selection_key):
        raise ValueError("Missing authorized music assignment; MP4 not published")
    if not fixture_audio:
        check_music_url(audio_url)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        still = Path(tmp) / "frame.png"
        audio = Path(tmp) / "licensed-track.mp3"
        frame = (brand_cover(image, title, kicker) if style == "brand"
                 else promo_cover(image, title, kicker) if style == "promo"
                 else cover(image, title))
        frame.save(still)
        video_input = ["-loop", "1", "-framerate", str(FPS), "-i", str(still)]
        video_duration = DURATION
        if pick:
            pages = pick_pages(image, pick)
            page_duration = max(4, DURATION / len(pages))
            video_duration = page_duration * len(pages)
            playlist = Path(tmp) / "pages.txt"
            entries = []
            for index, page in enumerate(pages):
                name = f"page-{index}.png"
                page.save(Path(tmp) / name)
                entries.extend([f"file '{name}'", f"duration {page_duration}"])
            entries.append(f"file 'page-{len(pages)-1}.png'")
            playlist.write_text("\n".join(entries) + "\n")
            video_input = ["-f", "concat", "-safe", "0", "-i", str(playlist)]
        if fixture_audio:
            audio = Path(fixture_audio)
        elif cached_audio:
            audio = Path(cached_audio)
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
            *video_input,
            "-stream_loop", "-1", "-ss", f"{offset:.3f}", "-i", str(audio),
            "-t", str(video_duration), "-r", str(FPS),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-af", f"loudnorm=I=-20:TP=-3:LRA=9,afade=t=in:st=0:d=0.25,afade=t=out:st={video_duration-.9}:d=0.9",
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


def prepare_pick_templates():
    """Render the reusable Pick library before enabling it in the database.

    Each post's caption keeps its own event, selection, odds and link. A new
    Pick reuses a verified clip instead of waiting for a scheduled renderer.
    """
    catalog = json.loads(PICK_TRACKS.read_text())
    tracks = catalog.get("tracks", [])
    if catalog.get("version") != 1 or not tracks or len(tracks) > 24:
        raise ValueError("Unexpected Pick music catalog")
    slugs = [track.get("slug", "") for track in tracks]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Duplicate Pick music assignment")
    for track in tracks:
        if (track.get("license") != "CC0" or not re.fullmatch(r"[a-z0-9-]{2,64}", track["slug"])
                or not track.get("license_proof_url", "").startswith("https://en.freepd.cn/")):
            raise ValueError("Unverified Pick music license")
    clips = []
    with tempfile.TemporaryDirectory() as tmp:
        for track in tracks:
            audio = Path(tmp) / (track["slug"] + ".mp3")
            get_authorized_music(track["source_url"], audio)
            for artwork in PICK_TEMPLATE_IMAGES:
                filename = "pick-v1-safe-" + artwork + "-" + track["slug"] + ".mp4"
                output = OUTPUT / filename
                image = Image.open(ROOT / "assets/social-brand" / (artwork + ".jpg")).convert("RGB")
                make_video(image, "Partido y pronóstico en la descripción", output,
                           "brand", "PICK DEL EDITOR", track["source_url"], track["slug"],
                           selection_key=filename, cached_audio=audio)
                clips.append({"file": filename, "image_key": artwork,
                              "track_slug": track["slug"], "license": "CC0",
                              "duration": DURATION, "fps": FPS,
                              "bytes": output.stat().st_size,
                              "sha256": hashlib.sha256(output.read_bytes()).hexdigest()})
                print("Prepared Pick template:", filename, flush=True)
    (OUTPUT / "pick-template-manifest.json").write_text(
        json.dumps({"version": 1, "clips": clips}, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke-test", action="store_true")
    parser.add_argument("--prepare-pick-templates", action="store_true")
    parser.add_argument("--brand-preview", type=Path,
                        help="Write a still preview of the new social layout")
    args = parser.parse_args()
    if args.prepare_pick_templates:
        prepare_pick_templates()
        return
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
            make_video(image, "Parlay", Path(tmp) / "pick.mp4", fixture_audio=fixture,
                       pick={"event_name": "FC Barcelona vs Real Madrid",
                             "selection": "\n".join(f"Selección {i}: más de 2.5 goles y ambos anotan" for i in range(8)),
                             "american_odds": 250})
            info = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "json", str(Path(tmp) / "pick.mp4")]))
            assert float(info["format"]["duration"]) >= 12, "Parlay pages must all reach the encoded video"
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
        is_pick = job.get("video_version") == "pick-v2"
        prefix = "pick-v2-" if is_pick else "safe-v2-"
        output = OUTPUT / (prefix + hashlib.md5(identity.encode("utf-8")).hexdigest() + ".mp4")
        if output.exists() and output.stat().st_size > 30000:
            continue
        style = ("brand" if "/assets/social-brand/" in (job.get("image_url") or "")
                 else "promo" if job.get("style") == "promo" else "news")
        make_video(read_image(job.get("image_url"), required=is_pick), job.get("title"), output, style,
                   job.get("kicker"), job.get("music_url"), job.get("track_slug"),
                   selection_key=identity, pick=job if is_pick else None)
        print("Generated:", network, job.get("track_slug"), output.relative_to(ROOT))


if __name__ == "__main__":
    main()
