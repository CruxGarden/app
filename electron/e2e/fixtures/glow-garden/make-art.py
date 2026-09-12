"""Pixel art for the Glow Garden demo, generated deterministically (no image library needed).

Run: python3 make-art.py  → gardener-sheet.png (4 walk frames, 32×32 each, in a row),
seed.png (32×32 glowing seed), garden-ground.png (800×600 tiled garden).
Authored for Crux Garden's demo Cruxspace; public domain (CC0).
"""
import struct, zlib, math, random

def png(path, w, h, pixels):  # pixels: list of rows of (r,g,b,a)
    raw = b''.join(b'\x00' + b''.join(struct.pack('BBBB', *p) for p in row) for row in pixels)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

T = (0, 0, 0, 0)
def rgba(h, a=255): return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)
PAL = {'.': T, 'h': rgba('#2e7d32'), 'H': rgba('#43a047'), 'f': rgba('#ffcc80'), 'e': rgba('#3e2723'),
       'b': rgba('#6d4c41'), 'B': rgba('#8d6e63'), 'l': rgba('#3949ab'), 'L': rgba('#5c6bc0'), 's': rgba('#212121'),
       'g': rgba('#a5d6a7'), 'w': rgba('#fff59d')}
# 16 wide × 24 tall figure, centred in a 32×32 frame; legs differ per frame.
BODY = [
 "......hhhh......",
 ".....hhhhhh.....",
 "....hHHHHHHh....",
 "...hhhhhhhhhh...",
 ".....ffffff.....",
 ".....fefeef.....",
 ".....ffffff.....",
 "......ffff......",
 "....bbBBBBbb....",
 "...bbBBBBBBbb...",
 "...b.BBBBBB.b...",
 "...f.BBBBBB.f...",
 ".....BBBBBB.....",
 ".....BBBBBB.....",
 ".....llllll.....",
]
LEGS = [
 ["....llll.llll...", "....LLL...LLL...", "....sss...sss..."],
 ["......ll.ll.....", "......LL.LL.....", "......ss.ss....."],
 ["...llll...llll..", "...LLL.....LLL..", "...sss.....sss.."],
 ["......ll.ll.....", "......LL.LL.....", "......ss.ss....."],
]
def frame(legs):
    rows = BODY + legs
    px = [[T] * 32 for _ in range(32)]
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            px[6 + y][8 + x] = PAL[c]
    return px
sheet = [[T] * 128 for _ in range(32)]
for i, legs in enumerate(LEGS):
    fr = frame(legs)
    for y in range(32):
        for x in range(32): sheet[y][i * 32 + x] = fr[y][x]
png('gardener-sheet.png', 128, 32, sheet)

seed = [[T] * 32 for _ in range(32)]
for y in range(32):
    for x in range(32):
        d = math.hypot(x - 15.5, y - 15.5)
        if d < 4: seed[y][x] = rgba('#fff9c4')
        elif d < 7: seed[y][x] = rgba('#ffd54f')
        elif d < 9.5: seed[y][x] = rgba('#ffb300')
        elif d < 13: seed[y][x] = rgba('#ffe082', int(140 * (13 - d) / 3.5))
png('seed.png', 32, 32, seed)

random.seed(7)
W, H = 800, 600
ground = [[rgba('#2f5d3a')] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        n = ((x // 16) + (y // 16)) % 2
        base = '#2f5d3a' if n else '#33653f'
        if random.random() < 0.06: base = '#3b7a4a'
        ground[y][x] = rgba(base)
for _ in range(900):  # grass blades
    x, y = random.randrange(W), random.randrange(H)
    for dy in range(3):
        if y - dy >= 0: ground[y - dy][x] = rgba('#8bc34a' if dy else '#6fa83a')
for _ in range(60):  # flowers
    x, y = random.randrange(2, W - 2), random.randrange(2, H - 2)
    c = random.choice(['#f48fb1', '#fff59d', '#b39ddb', '#ffab91'])
    for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]: ground[y + dy][x + dx] = rgba(c)
    ground[y][x] = rgba('#fff8e1')
# A stone path across the middle.
for x in range(0, W):
    yc = int(300 + 40 * math.sin(x / 90))
    for y in range(yc - 14, yc + 14):
        if 0 <= y < H and (x // 8 + y // 8) % 3 != 0: ground[y][x] = rgba('#9e9e8e' if (x + y) % 5 else '#b0b0a0')
png('garden-ground.png', W, H, ground)
print('wrote gardener-sheet.png seed.png garden-ground.png')
