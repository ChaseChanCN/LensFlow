"""Rebuild a paper/charcoal particle portrait from the supplied ASCII source.

No photographic source or alpha exists. Recover the foreground envelope from
continuous glyph support and exterior connectivity; never classify all black
pixels as background or all enclosed pixels as clothing.
All anatomy and shading comes from the source, never hand-authored face paths.
Requires Pillow and numpy. Run from the repository root.
"""
from pathlib import Path
from collections import deque
import hashlib
import json
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/assets/light-portrait-source.png'
OUT = ROOT / 'frontend/public/light-portrait'
OUT.mkdir(parents=True, exist_ok=True)
rgb = np.asarray(Image.open(SOURCE).convert('RGB'), dtype=np.float32) / 255
h, w = rgb.shape[:2]
# Max RGB is used only to locate glyph support; source shading uses luma.
stroke = rgb.max(axis=2)
support_image = np.asarray(Image.fromarray((stroke * 255).astype('uint8')).filter(ImageFilter.MaxFilter(15)))
support = support_image > 12
mask = np.zeros((h, w), dtype=np.uint8)
left = np.full(h, np.nan)
right = np.full(h, np.nan)
for y in range(h):
    xs = np.flatnonzero(support[y])
    if len(xs) >= 8:
        left[y], right[y] = np.quantile(xs, [.005, .995])
valid = np.flatnonzero(np.isfinite(left))
for y in range(valid[0], valid[-1] + 1):
    l = np.interp(y, valid, left[valid])
    r = np.interp(y, valid, right[valid])
    # Initial envelope. Open lower-body negative space is removed below.
    mask[y, max(0, int(l)):min(w, int(r) + 1)] = 255

# The source has open background between the lower garment/legs. A row hull
# incorrectly fills it. Follow empty space CONNECTED to the exterior, with
# dilated glyph support acting as a barrier; preserve enclosed dark texture.
# This is a semantic correction confirmed by the user, not a dark-pixel cutout.
lower_start = int(h * .585)
barrier = (support_image > 3)[lower_start::4, ::4]
empty = ~barrier
exterior = np.zeros_like(empty)
queue = deque()
bh, bw = empty.shape
for x in range(bw):
    if empty[-1, x]:
        exterior[-1, x] = True
        queue.append((bh-1, x))
for y in range(bh):
    for x in (0, bw-1):
        if empty[y, x] and not exterior[y, x]:
            exterior[y, x] = True
            queue.append((y, x))
while queue:
    y, x = queue.popleft()
    for yy, xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
        if 0 <= yy < bh and 0 <= xx < bw and empty[yy,xx] and not exterior[yy,xx]:
            exterior[yy,xx] = True
            queue.append((yy,xx))
open_background = np.asarray(Image.fromarray(exterior.astype('uint8') * 255).resize((w,h-lower_start), Image.Resampling.NEAREST)) > 0
mask[lower_start:][open_background] = 0
alpha_image = Image.fromarray(mask).filter(ImageFilter.GaussianBlur(2.2))
alpha = np.asarray(alpha_image, dtype=np.float32) / 255
# Sparse, faint marks below the waist are weak source evidence, not opaque
# black cloth. Carry their source coverage into alpha instead of expanding
# them into dark islands around the newly restored negative space.
lower_evidence = np.asarray(Image.fromarray((stroke*255).astype('uint8')).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1)), dtype=np.float32) / 255
transition = np.clip((np.arange(h)[:,None]-lower_start)/45,0,1)
alpha *= (1-transition) + transition*np.power(lower_evidence,.45)
alpha_image = Image.fromarray((alpha*255).astype('uint8'))
# Close only the tiny gaps inside the original printed glyphs. This recovers
# local tone while retaining eyes, fingers, hair strands and garment folds.
luma = rgb @ np.array([.299, .587, .114], dtype=np.float32)
tone_image = Image.fromarray((luma * 255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.65))
tone = np.asarray(tone_image, dtype=np.float32) / 255
tone = np.clip((tone - .035) / .88, 0, 1)
gy, gx = np.gradient(tone)
edge = np.hypot(gx, gy)

rng = np.random.default_rng(72419)
rows = []
step = 3.0
# These regions change sampling resolution only, never anatomy or tone.
def detail_region(x, y):
    x, y = x * 1426 / w, y * 1264 / h
    return (535 < x < 705 and 145 < y < 300) or (635 < x < 735 and 285 < y < 400) or (395 < x < 600 and 410 < y < 755)
locations = [(x,y,False) for y in np.arange(valid[0]+1,valid[-1],step) for x in np.arange(0,w,step) if not detail_region(x,y)]
locations += [(x,y,True) for y in np.arange(145*h/1264,755*h/1264,1.75) for x in np.arange(395*w/1426,735*w/1426,1.75) if detail_region(x,y)]
for x, y, detailed in locations:
    # Tiny deterministic offset breaks the regular grid, never animates.
    px = x + rng.uniform(-.12, .12)
    py = y + rng.uniform(-.10, .10)
    ix, iy = int(np.clip(px, 0, w-1)), int(np.clip(py, 0, h-1))
    a = float(alpha[iy, ix])
    if a < .03 or rng.random() > a:
        continue
    local_tone = float(tone[iy, ix])
    ink = float((1-local_tone) ** .88)
    if ink < .025:
        continue
    # Glyph coverage carries the tones, not a flat opaque silhouette.
    char = min(7, int(ink * 8))
    if edge[iy, ix] > .035 and rng.random() < .45:
        char = 8  # short horizontal scan line
    elif rng.random() < .24:
        char = 9  # fine line, a second texture scale
    size = (4.8 + 1.1 * ink) if detailed else (7.0 + 1.8 * ink)
    # Stable features: stronger edges breathe less; positions never move.
    stability = float(np.clip(edge[iy, ix] * 12, 0, 1))
    rows.append([px, h-py, ink * .98, size, char, rng.uniform(0, 6.283185), rng.uniform(5, 14), stability])

data = np.asarray(rows, dtype='<f4')
data.tofile(OUT / 'particles.bin')
radius = data[:, 3] / 2
bounds = [float(np.min(data[:, 0]-radius)), float(np.min(data[:, 1]-radius)), float(np.max(data[:, 0]+radius)), float(np.max(data[:, 1]+radius))]
metadata = dict(schema=1, count=len(data), stride=8, image=[w,h], bounds=bounds,
                fields=['x','y','ink','size','glyph','phase','period','stability'],
                source='scripts/assets/light-portrait-source.png', sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                glyphs=['.',':','+','=','*','#','%','@','short-line','fine-line'],
                preprocessing='glyph-support envelope; exterior-connected lower negative space removed; local glyph closing; charcoal resampling',
                limitations='ASCII source only; no photographic source or ground-truth foreground alpha')
(OUT / 'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
# Diagnostic masks/tones are development evidence, never displayed as a photo.
evidence = ROOT / 'docs/light-portrait-rebuild'
evidence.mkdir(parents=True,exist_ok=True)
alpha_image.save(evidence/'inferred-foreground.png')
tone_image.save(evidence/'recovered-source-tone.png')
print(json.dumps({'count':len(data),'bytes':data.nbytes,'bounds':bounds}))
