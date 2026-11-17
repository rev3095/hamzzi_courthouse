// 블록 → 한글 문서(.hwpx, OWPML) — hwpx-js(Apache-2.0)의 HWPXBuilder로 만든다 (DEC-025, 실험 기능).
// 빌더에는 문단 정렬 옵션이 없어, 만든 문서 모델에 정렬만 다른 문단 모양(paraPr)을 더해 연결한다.
// 브라우저 안에서만 만들어 내려받는다 (이름·주소·금액이 서버로 가지 않는다).
import { HWPXBuilder, write, type HWPXDocument, type ParaProperty } from "hwpx-js";
import type { Block } from "../fill";

export const HWPX_MIME = "application/hwp+zip";

const FONT = "맑은 고딕";

type Align = "CENTER" | "RIGHT";

/** 블록 → HWPX 문서 모델 (테스트에서 내용을 확인할 수 있게 따로 둔다) */
export function hwpxDocument(blocks: readonly Block[]): HWPXDocument {
  const b = new HWPXBuilder().setPageSettings({
    width: 210,
    height: 297,
    marginLeft: 25,
    marginRight: 25,
    marginTop: 30,
    marginBottom: 25,
  });
  const aligns: (Align | null)[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "blank":
        b.addEmptyParagraph();
        aligns.push(null);
        break;
      case "title":
        b.addParagraph(block.text, { fontSize: 18, bold: true, fontName: FONT });
        aligns.push("CENTER");
        break;
      case "heading":
        b.addParagraph(block.text, { fontSize: 12, bold: true, fontName: FONT });
        aligns.push("CENTER");
        break;
      case "center":
        b.addParagraph(block.text, { fontSize: 11, fontName: FONT });
        aligns.push("CENTER");
        break;
      case "right":
        b.addParagraph(block.text, { fontSize: 11, fontName: FONT });
        aligns.push("RIGHT");
        break;
      case "text":
        b.addParagraph(block.text, { fontSize: 11, fontName: FONT });
        aligns.push(null);
        break;
    }
  }
  const doc = b.build();
  const paras = doc.sections[0]?.paragraphs ?? [];
  const head = doc.head.paraProperties;
  const made = new Map<string, number>();
  let nextId = head.reduce((m, p) => Math.max(m, p.id), -1) + 1;
  paras.forEach((para, i) => {
    const align = aligns[i];
    if (!align) return;
    const key = `${para.paraPrIDRef}:${align}`;
    let id = made.get(key);
    if (id === undefined) {
      const base = head.find((p) => p.id === para.paraPrIDRef) ?? head[0];
      const copy: ParaProperty = { ...structuredClone(base), id: nextId++, alignment: align };
      head.push(copy);
      id = copy.id;
      made.set(key, id);
    }
    para.paraPrIDRef = id;
  });
  return doc;
}

/** 블록 → .hwpx 바이트 */
export function toHwpx(blocks: readonly Block[]): Uint8Array {
  return write(hwpxDocument(blocks));
}
