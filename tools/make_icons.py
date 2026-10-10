"""產生主畫面圖示：python tools/make_icons.py（需要 Pillow）"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (17, 19, 24)
# T 方塊 + I 方塊 + O 方塊組成的圖案（格子座標, 顏色）
BLOCKS = [
    ((1, 0), (178, 90, 232)), ((0, 1), (178, 90, 232)), ((1, 1), (178, 90, 232)), ((2, 1), (178, 90, 232)),
    ((0, 3), (63, 208, 232)), ((1, 3), (63, 208, 232)), ((2, 3), (63, 208, 232)), ((3, 3), (63, 208, 232)),
    ((3, 1), (247, 208, 56)), ((4, 1), (247, 208, 56)), ((3, 2), (247, 208, 56)), ((4, 2), (247, 208, 56)),
    ((4, 3), (239, 75, 75)), ((0, 2), (79, 214, 107)),
]


def make(size: int, name: str) -> None:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    cols, rows = 5, 4
    cell = size * 0.6 / cols  # 留邊給 maskable 安全區
    ox = (size - cell * cols) / 2
    oy = (size - cell * rows) / 2
    gap = max(1, cell * 0.07)
    for (x, y), color in BLOCKS:
        x0 = ox + x * cell + gap
        y0 = oy + y * cell + gap
        d.rounded_rectangle([x0, y0, x0 + cell - 2 * gap, y0 + cell - 2 * gap], radius=cell * 0.12, fill=color)
    img.save(OUT / name)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    make(192, "icon-192.png")
    make(512, "icon-512.png")
    make(180, "apple-touch-icon.png")
    print("done")
