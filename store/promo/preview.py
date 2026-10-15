import sys
from playwright.sync_api import sync_playwright
from PIL import Image
times = [float(x) for x in sys.argv[1:]] or [1.6, 3.6, 7.0, 10.6, 14.2, 20.0]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1080, "height": 1920})
    pg.goto("file://" + __import__("os").path.abspath("video.html"))
    pg.wait_for_timeout(500)
    shots = []
    for t in times:
        pg.evaluate(f"render({t})")
        f = f"prev_{t:05.2f}.png"
        pg.screenshot(path=f)
        shots.append(f)
    b.close()
ims = [Image.open(f).convert("RGB").resize((360, 640)) for f in shots]
cols = 3
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 370, rows * 650), "white")
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 370, (i // cols) * 650))
sheet.save("preview.png")
print("ok", shots)
