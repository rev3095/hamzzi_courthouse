// F-015 서류 분석 — 문서 파일에서 글 꺼내기 (2026-11-24 문서 읽기). ZIP은 테스트 안에서 직접 만든다(압축 없음·deflate 둘 다).
import { deflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { extractDocText, isTextDoc } from "./docs";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** 아주 작은 ZIP 작성기 (테스트용) */
function zip(files: Record<string, string>, deflate = true): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(content);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const crc = crc32(raw);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, deflate ? 8 : 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

const fileOf = (bytes: Uint8Array | string, name: string) => new File([bytes as BlobPart], name);

describe("F-015 문서 글 꺼내기", () => {
  test("확장자로 문서 여부를 본다", () => {
    expect(isTextDoc(fileOf("", "a.hwp"))).toBe(true);
    expect(isTextDoc(fileOf("", "a.HWPX"))).toBe(true);
    expect(isTextDoc(fileOf("", "a.jpg"))).toBe(false);
  });

  test("워드(docx): 문단마다 줄을 나눈다", async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>내용증명</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">보증금 &amp; 반환</w:t></w:r><w:r><w:t>을 요구합니다</w:t></w:r></w:p></w:body></w:document>';
    const r = await extractDocText(fileOf(zip({ "word/document.xml": xml }), "통지.docx"));
    expect(r).toEqual({ ok: true, text: "내용증명\n보증금 & 반환을 요구합니다" });
  });

  test("파워포인트(pptx): 슬라이드 순서대로", async () => {
    const slide = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const r = await extractDocText(
      fileOf(
        zip({ "ppt/slides/slide10.xml": slide("열"), "ppt/slides/slide2.xml": slide("둘") }, false),
        "발표.pptx",
      ),
    );
    expect(r.ok && r.text).toBe("[슬라이드 1]\n둘\n[슬라이드 2]\n열");
  });

  test("한글(hwpx)·엑셀(xlsx)", async () => {
    const hwpx = await extractDocText(
      fileOf(
        zip({ "Contents/section0.xml": "<hp:p><hp:run><hp:t>계약서 본문</hp:t></hp:run></hp:p>" }),
        "계약.hwpx",
      ),
    );
    expect(hwpx).toEqual({ ok: true, text: "계약서 본문" });
    const xlsx = await extractDocText(
      fileOf(zip({ "xl/sharedStrings.xml": "<sst><si><t>입금 내역</t></si></sst>" }), "표.xlsx"),
    );
    expect(xlsx).toEqual({ ok: true, text: "입금 내역" });
  });

  test("텍스트, 빈 문서, 깨진 파일", async () => {
    expect(await extractDocText(fileOf("  첫 줄\r\n둘째 줄 ", "메모.txt"))).toEqual({
      ok: true,
      text: "첫 줄\n둘째 줄",
    });
    expect(await extractDocText(fileOf("   ", "빈.txt"))).toEqual({ ok: false, error: "empty" });
    expect(await extractDocText(fileOf("not a zip", "깨짐.docx"))).toEqual({
      ok: false,
      error: "broken",
    });
    expect(await extractDocText(fileOf("x", "그림.hwp"))).toEqual({ ok: false, error: "broken" });
  });
});
