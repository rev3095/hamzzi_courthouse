"""서류 분석 예시(F-015) 가상 서류 그림 만들기. 무료 — 모델을 부르지 않는다.

evals/casefile-examples/docs/<id>.txt → public/casefile-examples/<id>.png
사용: uv run --no-project --with pillow python -X utf8 scripts/render_casefile_examples.py
서류 글은 직접 쓴 가상 문서다(실명·실제 상호·주소 없음, ○○로 가림).

줄 규칙: 첫 줄 "TITLE: 제목" · "@center/@right/@bold/@small 글" · "@hr" 가로줄 · " | "가 든 줄은 표 행
· "[인장]"이 든 줄 옆에 붉은 인장 자리 · 메신저: "@day 날짜", "<L 말", ">R 말", "@note 설명"
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "evals" / "casefile-examples" / "docs"
OUT = ROOT / "public" / "casefile-examples"
FONTS = ROOT / "public" / "fonts"
REG = str(FONTS / "NanumGothic-Regular.ttf")
BOLD = str(FONTS / "NanumGothic-Bold.ttf")

PAGE_W, MARGIN = 1240, 90
INNER = PAGE_W - 2 * MARGIN
F_TITLE = ImageFont.truetype(BOLD, 46)
F_BODY = ImageFont.truetype(REG, 25)
F_BOLD = ImageFont.truetype(BOLD, 26)
F_CELL = ImageFont.truetype(REG, 23)
F_SMALL = ImageFont.truetype(REG, 20)
F_STAMP = ImageFont.truetype(BOLD, 22)
INK = (20, 20, 20)
GREY = (110, 110, 110)


def wrap(d, text, font, width):
    out, cur = [], ""
    for ch in text:
        if d.textlength(cur + ch, font=font) > width and cur:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    out.append(cur)
    return out


def stamp(d, cx, cy):
    r = 46
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(200, 30, 30), width=5)
    for k, t in enumerate(["인", "장"]):
        tw = d.textlength(t, font=F_STAMP)
        d.text((cx - tw / 2, cy - 26 + k * 26), t, font=F_STAMP, fill=(200, 30, 30))


def bubble(d, y, text, left):
    maxw = int(INNER * 0.72)
    lines = wrap(d, text, F_CELL, maxw - 36)
    w = max(d.textlength(t, font=F_CELL) for t in lines) + 36
    h = len(lines) * 32 + 22
    x0 = MARGIN if left else PAGE_W - MARGIN - w
    fill = (240, 240, 240) if left else (255, 236, 140)
    d.rounded_rectangle((x0, y, x0 + w, y + h), radius=18, fill=fill)
    for j, t in enumerate(lines):
        d.text((x0 + 18, y + 11 + j * 32), t, font=F_CELL, fill=INK)
    return y + h + 16


def render(src: Path, dst: Path):
    lines = src.read_text(encoding="utf-8").splitlines()
    title = lines[0].removeprefix("TITLE:").strip()
    img = Image.new("RGB", (PAGE_W, 8000), "white")
    d = ImageDraw.Draw(img)
    y = MARGIN
    tw = d.textlength(title, font=F_TITLE)
    d.text(((PAGE_W - tw) / 2, y), title, font=F_TITLE, fill=INK)
    y += 84
    prev_table = False
    for raw in lines[1:]:
        line = raw.rstrip()
        is_table = " | " in line and not line.startswith("@")
        if prev_table and not is_table:
            y += 14
        prev_table = is_table
        if not line.strip():
            y += 16
            continue
        tag, _, rest = line.partition(" ")
        if line == "@hr":
            y += 8
            d.line((MARGIN, y, PAGE_W - MARGIN, y), fill=(150, 150, 150), width=2)
            y += 20
        elif tag == "@day":
            t = f"— {rest} —"
            d.text(((PAGE_W - d.textlength(t, font=F_SMALL)) / 2, y), t, font=F_SMALL, fill=GREY)
            y += 40
        elif tag in ("<L", ">R"):
            y = bubble(d, y, rest, tag == "<L")
        elif tag == "@note":
            for t in wrap(d, rest, F_SMALL, INNER - 40):
                d.text((MARGIN + 20, y), t, font=F_SMALL, fill=GREY)
                y += 30
            y += 10
        elif tag in ("@center", "@right", "@bold", "@small"):
            font = {"@bold": F_BOLD, "@small": F_SMALL}.get(tag, F_BODY)
            has_stamp = "[인장]" in rest
            text = rest.replace("[인장]", "").rstrip()
            for t in wrap(d, text, font, INNER - (120 if has_stamp else 0)):
                w = d.textlength(t, font=font)
                if tag == "@center":
                    x = (PAGE_W - w) / 2
                elif tag == "@right":
                    x = PAGE_W - MARGIN - w - (110 if has_stamp else 0)
                else:
                    x = MARGIN
                d.text((x, y), t, font=font, fill=GREY if tag == "@small" else INK)
                y += 34 if tag == "@small" else 40
            if has_stamp:
                stamp(d, PAGE_W - MARGIN - 50, y - 6)
                y += 50
        elif " | " in line:
            cells = [c.strip() for c in line.split(" | ")]
            first = 0.24 if len(cells) == 2 else 1 / len(cells)
            widths = [INNER * first] + [INNER * (1 - first) / (len(cells) - 1)] * (len(cells) - 1)
            wrapped = [wrap(d, c, F_CELL, w - 18) for c, w in zip(cells, widths, strict=True)]
            h = max(len(w) for w in wrapped) * 31 + 16
            x = MARGIN
            for i, (w, cw) in enumerate(zip(wrapped, widths, strict=True)):
                if i == 0 and len(cells) == 2:
                    d.rectangle((x, y, x + cw, y + h), fill=(246, 246, 246))
                d.rectangle((x, y, x + cw, y + h), outline=(70, 70, 70), width=1)
                for j, t in enumerate(w):
                    d.text((x + 9, y + 8 + j * 31), t, font=F_CELL, fill=INK)
                x += cw
            y += h
        else:
            for t in wrap(d, line, F_BODY, INNER):
                d.text((MARGIN, y), t, font=F_BODY, fill=INK)
                y += 38
    img.crop((0, 0, PAGE_W, y + MARGIN)).save(dst, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for src in sorted(SRC.glob("*.txt")):
        dst = OUT / f"{src.stem}.png"
        render(src, dst)
        print(dst.name, dst.stat().st_size)


if __name__ == "__main__":
    main()
