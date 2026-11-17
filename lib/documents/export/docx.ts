// 블록 → Word 문서(.docx, WordprocessingML) — 의존성 없이 직접 만든다 (DEC-025). 브라우저 안에서만 만들어 내려받는다.
// A4, 맑은 고딕. 제목은 가운데·크게, 소제목은 굵게, 서명줄은 오른쪽 정렬.
import type { Block } from "../fill";
import { zipStore } from "./zip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** XML 특수 문자 이스케이프 + XML 1.0에서 쓸 수 없는 제어 문자 제거 */
export function xmlEscape(s: string): string {
  return s
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function run(text: string, opts: { bold?: boolean; size?: number } = {}): string {
  const rpr = [opts.bold ? "<w:b/>" : "", opts.size ? `<w:sz w:val="${opts.size}"/>` : ""].join("");
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function paragraph(b: Block): string {
  switch (b.kind) {
    case "blank":
      return "<w:p/>";
    case "title":
      return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>${run(b.text, { bold: true, size: 36 })}</w:p>`;
    case "heading":
      return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>${run(b.text, { bold: true, size: 24 })}</w:p>`;
    case "center":
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(b.text)}</w:p>`;
    case "right":
      return `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run(b.text)}</w:p>`;
    case "text":
      return `<w:p>${run(b.text)}</w:p>`;
  }
}

export function documentXml(blocks: readonly Block[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${W}><w:body>${blocks.map(paragraph).join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const DOC_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>` +
  `<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕" w:cs="Malgun Gothic"/>` +
  `<w:sz w:val="22"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  `</w:styles>`;

/** 블록 → .docx 바이트 */
export function toDocx(blocks: readonly Block[]): Uint8Array {
  return zipStore([
    { name: "[Content_Types].xml", data: CONTENT_TYPES },
    { name: "_rels/.rels", data: ROOT_RELS },
    { name: "word/document.xml", data: documentXml(blocks) },
    { name: "word/_rels/document.xml.rels", data: DOC_RELS },
    { name: "word/styles.xml", data: STYLES },
  ]);
}
