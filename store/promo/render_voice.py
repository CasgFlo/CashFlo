import os, subprocess, sys
from playwright.sync_api import sync_playwright
FPS = 30
html, voice, out = sys.argv[1], sys.argv[2], sys.argv[3]
silent = "_video_only.mp4"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1080, "height": 1920})
    pg.goto("file://" + os.path.abspath(html))
    pg.wait_for_timeout(800)
    end = pg.evaluate("VIDEO_END")
    frames = int(round(end * FPS))
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
                           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), silent],
                          stdin=subprocess.PIPE)
    for i in range(frames):
        pg.evaluate(f"render({i / FPS})")
        ff.stdin.write(pg.screenshot(type="png"))
    ff.stdin.close(); ff.wait(); b.close()
# Voice: loud enough for Reels (-14 LUFS), 48 kHz stereo, silence after the last word
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", voice,
                "-filter_complex", "[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad[a]",
                "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
                "-shortest", "-movflags", "+faststart", out], check=True)
os.remove(silent)
print("done", out, frames)
