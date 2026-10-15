import os, subprocess
from playwright.sync_api import sync_playwright
FPS = 30
out = "cashflo-wczesny-dostep.mp4"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1080, "height": 1920})
    pg.goto("file://" + os.path.abspath("video.html"))
    pg.wait_for_timeout(800)
    end = pg.evaluate("VIDEO_END")
    frames = int(round(end * FPS))
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest", "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out,
    ], stdin=subprocess.PIPE)
    for i in range(frames):
        pg.evaluate(f"render({i / FPS})")
        ff.stdin.write(pg.screenshot(type="png"))
    ff.stdin.close()
    ff.wait()
    b.close()
print("frames", frames, "->", out, os.path.getsize(out) // 1024, "KB")
