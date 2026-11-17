"""앱 아이콘 만들기 (Google Play / TWA, docs/08_Google_Play_배포.md).

햄찌 판사 전신 그림(public/mascot/hamzzi-judge.webp)에서 얼굴 부분을 잘라
브랜드 크림 바탕(--cream #F4EEE1, docs/05_브랜드_가이드.md 3절) 위에 올린다.

- public/icons/icon-{192,512}.png          : 일반 아이콘 (얼굴이 화면 대부분)
- public/icons/icon-maskable-{192,512}.png : 마스커블 (가운데 지름 80% 안전 영역 안)
- twa/store/play-icon-512.png              : Play 스토어 등록 아이콘 (512×512, 32비트 PNG)
- twa/store/feature-graphic-1024x500.png   : Play 스토어 그래픽 이미지 초안

실행: python -X utf8 scripts/make_app_icons.py  (Pillow 필요)
마스코트 그림을 바꾸면 다시 실행한다.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "mascot" / "hamzzi-judge.webp"
ICONS = ROOT / "public" / "icons"
STORE = ROOT / "twa" / "store"

CREAM = (0xF4, 0xEE, 0xE1, 255)  # --cream
INK = (0x1A, 0x22, 0x33, 255)  # --ink
GOLD = (0xA9, 0x87, 0x3C, 255)  # --gold
MUTED = (0x5A, 0x62, 0x72, 255)  # --muted

# 전신 그림(480×635)에서 모자·귀·얼굴·옷깃까지 들어가는 정사각형
HEAD_BOX = (40, 0, 470, 430)


def head() -> Image.Image:
    return Image.open(SRC).convert("RGBA").crop(HEAD_BOX)


def icon(size: int, scale: float, dy: float = 0.0) -> Image.Image:
    """scale = 캔버스 대비 얼굴 정사각형 크기, dy = 세로 이동(캔버스 비율)."""
    canvas = Image.new("RGBA", (size, size), CREAM)
    s = round(size * scale)
    face = head().resize((s, s), Image.LANCZOS)
    x = (size - s) // 2
    y = (size - s) // 2 + round(size * dy)
    canvas.alpha_composite(face, (x, y))
    return canvas


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    for name in ("malgunbd.ttf" if bold else "malgun.ttf", "NotoSansKR-Bold.otf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def feature_graphic() -> Image.Image:
    w, h = 1024, 500
    canvas = Image.new("RGBA", (w, h), CREAM)
    judge = Image.open(SRC).convert("RGBA")
    jh = 440
    jw = round(judge.width * jh / judge.height)
    canvas.alpha_composite(judge.resize((jw, jh), Image.LANCZOS), (w - jw - 70, h - jh))
    d = ImageDraw.Draw(canvas)
    d.rectangle((80, 150, 84, 330), fill=GOLD)
    d.text((110, 150), "햄찌법원", font=font(88), fill=INK)
    d.text((112, 268), "법령·판례 근거로 정리하는", font=font(32, bold=False), fill=MUTED)
    d.text((112, 310), "AI 법률 정보 서비스", font=font(32, bold=False), fill=MUTED)
    return canvas


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    STORE.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        icon(size, 0.92, 0.04).save(ICONS / f"icon-{size}.png", optimize=True)
        # 안전 영역: 가운데 지름 80% 원. 얼굴 정사각형을 64%로 줄이면 그림(투명 모서리 제외)이 원 안에 든다.
        icon(size, 0.64, 0.02).save(ICONS / f"icon-maskable-{size}.png", optimize=True)
    icon(512, 0.92, 0.04).save(STORE / "play-icon-512.png", optimize=True)
    feature_graphic().convert("RGB").save(STORE / "feature-graphic-1024x500.png", optimize=True)
    print("ok")


if __name__ == "__main__":
    main()
