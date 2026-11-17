// 블록 → PDF — pdf-lib·@pdf-lib/fontkit(MIT)과 나눔고딕(SIL OFL, public/fonts)으로 만든다 (DEC-025).
// 글꼴은 PDF를 고를 때만 브라우저가 내려받고, 쓴 글자만 PDF에 넣는다(subset). 브라우저 안에서만 만들어 내려받는다.
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Block } from "../fill";

export const PDF_MIME = "application/pdf";
export const PDF_FONT_URLS = {
  regular: "/fonts/NanumGothic-Regular.ttf",
  bold: "/fonts/NanumGothic-Bold.ttf",
} as const;

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };

const PAGE = { width: 595.28, height: 841.89 }; // A4 (pt)
const MARGIN = { left: 68, right: 68, top: 80, bottom: 68 };
const STYLE: Record<Block["kind"], { size: number; bold: boolean }> = {
  title: { size: 18, bold: true },
  heading: { size: 12, bold: true },
  text: { size: 11, bold: false },
  center: { size: 11, bold: false },
  right: { size: 11, bold: false },
  blank: { size: 11, bold: false },
};
const LEADING = 1.65;

/** 너비에 맞게 줄을 나눈다. 띄어쓰기에서 먼저 끊고, 안 되면 글자 단위로 끊는다 */
export function wrapLine(text: string, maxWidth: number, width: (s: string) => number): string[] {
  if (!text) return [""];
  const out: string[] = [];
  let rest = text;
  while (rest && width(rest) > maxWidth) {
    let cut = 1;
    while (cut < rest.length && width(rest.slice(0, cut + 1)) <= maxWidth) cut++;
    const space = rest.lastIndexOf(" ", cut);
    if (space > cut * 0.5) cut = space;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out.length ? out : [""];
}

export async function toPdf(
  blocks: readonly Block[],
  fonts: PdfFonts,
  meta: { title: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  pdf.setTitle(meta.title);
  pdf.setCreator("햄찌법원");
  pdf.setProducer("햄찌법원");

  const maxWidth = PAGE.width - MARGIN.left - MARGIN.right;
  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN.top;

  const newPageIfNeeded = (lineHeight: number) => {
    if (y - lineHeight < MARGIN.bottom) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - MARGIN.top;
    }
  };

  for (const block of blocks) {
    const style = STYLE[block.kind];
    const font: PDFFont = style.bold ? bold : regular;
    const lineHeight = style.size * LEADING;
    if (block.kind === "blank") {
      y -= lineHeight * 0.6;
      continue;
    }
    if (block.kind === "title") y -= 4;
    const w = (s: string) => font.widthOfTextAtSize(s, style.size);
    for (const line of wrapLine(block.text, maxWidth, w)) {
      newPageIfNeeded(lineHeight);
      y -= lineHeight;
      const lw = w(line);
      const x =
        block.kind === "title" || block.kind === "heading" || block.kind === "center"
          ? MARGIN.left + (maxWidth - lw) / 2
          : block.kind === "right"
            ? MARGIN.left + maxWidth - lw
            : MARGIN.left;
      page.drawText(line, { x, y, size: style.size, font, color: rgb(0.1, 0.1, 0.1) });
    }
    if (block.kind === "title") y -= 10;
  }
  return pdf.save();
}
