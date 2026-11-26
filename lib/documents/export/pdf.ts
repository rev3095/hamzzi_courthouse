// 블록 → PDF — pdf-lib·@pdf-lib/fontkit(MIT)과 나눔고딕(SIL OFL, public/fonts)으로 만든다 (DEC-025).
// 글꼴은 PDF를 고를 때만 브라우저가 내려받는다. 브라우저 안에서만 만들어 내려받는다.
//
// 글꼴은 **통째로** 넣는다 (subset: false). 2026-11-26에 내보낸 PDF를 실제로 그려 보니(PDFium·MuPDF) pdf-lib의
// '쓴 글자만 넣기'(subset: true)가 한글 글자 대부분을 빠뜨려 빈 문서처럼 보였다 — 글자 추출(복사·검색)은 정상이라
// 기존 검사가 잡지 못했다. 통째로 넣으면 파일이 커지므로 글꼴은 Regular 하나만 넣고, 굵은 글자(제목·소제목)는
// 글자 윤곽선을 함께 칠해 굵게 보이게 한다 (굵은 글꼴 파일을 따로 넣지 않는다. 글자는 한 번만 그려 복사해도 겹치지 않는다).
// 나눔고딕에 없는 글자(원문자 ①②… 등)는 빈칸이 되지 않게 그리기 전에 바꾼다 (pdfSafeText).
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  TextRenderingMode,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { Block } from "../fill";

export const PDF_MIME = "application/pdf";
export const PDF_FONT_URLS = {
  regular: "/fonts/NanumGothic-Regular.ttf",
} as const;

export type PdfFonts = { regular: Uint8Array };

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
/** 굵게 보이도록 글자 윤곽선에 칠하는 선 굵기 (글자 크기에 대한 비율) */
const BOLD_STROKE = 0.035;
const INK = rgb(0.1, 0.1, 0.1);

/** 글꼴에 없을 때 대신 쓰는 글자 (뜻이 같은 흔한 글자). 서식이 새 기호를 쓰면 여기에 더한다 — 검사가 빠진 글자를 알려 준다 */
const PDF_FALLBACK: Record<string, string> = {
  "∼": "~", // 물결표 (기간 표시)
  "✔": "V", // 체크 표시
};

/**
 * 글꼴에 없는 글자를 PDF에서 빈칸으로 두지 않는다: 원문자(①~⑳)는 "(1)"~"(20)"으로, 그 밖의 기호는
 * PDF_FALLBACK의 글자로 바꾼다. 글꼴에 있는 글자는 건드리지 않는다. has = 글꼴에 그 글자가 있는지.
 */
export function pdfSafeText(text: string, has: (codePoint: number) => boolean): string {
  return text.replace(/[①-⑳∼✔]/g, (c) => {
    const cp = c.codePointAt(0)!;
    if (has(cp)) return c;
    return cp >= 0x2460 && cp <= 0x2473 ? `(${cp - 0x245f})` : (PDF_FALLBACK[c] ?? c);
  });
}

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
  // 통째로 넣는다 — subset: true는 글자가 빠진다 (파일 머리말 참고)
  const font: PDFFont = await pdf.embedFont(fonts.regular, { subset: false });
  const charset = new Set(font.getCharacterSet());
  const has = (cp: number) => charset.has(cp);
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
    const lineHeight = style.size * LEADING;
    if (block.kind === "blank") {
      y -= lineHeight * 0.6;
      continue;
    }
    if (block.kind === "title") y -= 4;
    const w = (s: string) => font.widthOfTextAtSize(s, style.size);
    for (const line of wrapLine(pdfSafeText(block.text, has), maxWidth, w)) {
      newPageIfNeeded(lineHeight);
      y -= lineHeight;
      const lw = w(line);
      const x =
        block.kind === "title" || block.kind === "heading" || block.kind === "center"
          ? MARGIN.left + (maxWidth - lw) / 2
          : block.kind === "right"
            ? MARGIN.left + maxWidth - lw
            : MARGIN.left;
      // 굵은 글자: 채우기 + 윤곽선 (drawText가 여는 그래픽 상태가 바깥 설정을 이어받는다)
      if (style.bold)
        page.pushOperators(
          pushGraphicsState(),
          setTextRenderingMode(TextRenderingMode.FillAndOutline),
          setLineWidth(style.size * BOLD_STROKE),
          setStrokingColor(INK),
        );
      page.drawText(line, { x, y, size: style.size, font, color: INK });
      if (style.bold) page.pushOperators(popGraphicsState());
    }
    if (block.kind === "title") y -= 10;
  }
  return pdf.save();
}
