"""앱(Capacitor, mobile/) 아이콘·시작 화면 만들기 (DEC-048).

Capacitor가 처음 만든 기본 그림(Capacitor 로고)을 햄찌 얼굴로 바꾼다. 파일 이름·크기는 그대로 두고 내용만 덮어쓴다.
얼굴 자르기와 색은 scripts/make_app_icons.py(웹·TWA 아이콘)와 같다.

- Android mipmap-*/ic_launcher.png·ic_launcher_round.png : 크림 바탕 + 얼굴 (둥근 것은 원 밖 투명)
- Android mipmap-*/ic_launcher_foreground.png : 적응형 아이콘 앞면 (투명 바탕, 가운데 안전 영역 안)
- Android values/ic_launcher_background.xml : 적응형 아이콘 뒷면 색 = 크림
- Android drawable*/splash.png : 시작 화면 (크림 바탕 + 가운데 얼굴)
- iOS AppIcon 1024 (알파 없음, Apple 요구) · Splash 2732

실행: python -X utf8 scripts/make_mobile_assets.py  (Pillow 필요, `npx cap add` 뒤 또는 마스코트를 바꾼 뒤)
"""

from pathlib import Path

from PIL import Image, ImageDraw

import make_app_icons as base

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "mobile" / "android" / "app" / "src" / "main" / "res"
IOS = ROOT / "mobile" / "ios" / "App" / "App" / "Assets.xcassets"
CREAM_HEX = "#F4EEE1"


def face(size: int) -> Image.Image:
    return base.head().resize((size, size), Image.LANCZOS)


def square_icon(size: int) -> Image.Image:
    return base.icon(size, 0.92)


def round_icon(size: int) -> Image.Image:
    img = square_icon(size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def foreground(size: int) -> Image.Image:
    # 적응형 아이콘은 108dp 가운데 지름 66dp만 늘 보인다 → 얼굴을 60% 크기로
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s = round(size * 0.6)
    canvas.alpha_composite(face(s), ((size - s) // 2, (size - s) // 2))
    return canvas


def splash(w: int, h: int, ratio: float = 0.42) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), base.CREAM)
    s = round(min(w, h) * ratio)
    canvas.alpha_composite(face(s), ((w - s) // 2, (h - s) // 2))
    return canvas


def main() -> None:
    n = 0
    for png in sorted(RES.glob("*/*.png")):
        w, h = Image.open(png).size
        name = png.name
        if name == "ic_launcher.png":
            img = square_icon(w)
        elif name == "ic_launcher_round.png":
            img = round_icon(w)
        elif name == "ic_launcher_foreground.png":
            img = foreground(w)
        elif name == "splash.png":
            img = splash(w, h)
        else:
            continue
        img.save(png)
        n += 1
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{CREAM_HEX}</color>\n</resources>\n',
        encoding="utf-8",
    )
    if IOS.exists():
        square_icon(1024).convert("RGB").save(IOS / "AppIcon.appiconset" / "AppIcon-512@2x.png")
        for p in sorted((IOS / "Splash.imageset").glob("*.png")):
            w, h = Image.open(p).size
            splash(w, h, 0.28).convert("RGB").save(p)
            n += 1
        n += 1
    print(f"그림 {n}개를 바꿨어요")


if __name__ == "__main__":
    main()
