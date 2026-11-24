// 서류 분석 (F-015·F-016) — 브라우저에서 문서 파일의 글만 꺼낸다 (2026-11-24 사용자 요청: 한글·워드·파워포인트·엑셀·텍스트).
// 파일은 서버로 보내지 않고 꺼낸 글만 보낸다. 서버가 그 글의 개인정보를 가린 뒤 모델에 보낸다 (절대 규칙 4).
// 외부 라이브러리 없이: hwpx·docx·pptx·xlsx = ZIP 안의 XML, hwp(5.0) = OLE 복합 문서 안의 압축된 본문 레코드.
// 압축 풀기는 브라우저 기본 DecompressionStream("deflate-raw")을 쓴다.

export type TextDocResult =
  { ok: true; text: string } | { ok: false; error: "unsupported" | "empty" | "broken" };

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function isTextDoc(file: File): boolean {
  return ["hwp", "hwpx", "docx", "pptx", "xlsx", "txt", "md", "csv"].includes(extOf(file.name));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(data as BufferSource);
      c.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// --- ZIP (중앙 디렉터리만 읽는다) -------------------------------------------------------------
async function unzip(
  buf: Uint8Array,
  want: (name: string) => boolean,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip");
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (u32(buf, p) !== 0x02014b50) break;
    const method = u16(buf, p + 10);
    const csize = u32(buf, p + 20);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const local = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lName = u16(buf, local + 26);
    const lExtra = u16(buf, local + 28);
    const start = local + 30 + lName + lExtra;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
  }
  return out;
}

const decodeXmlEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** XML에서 글 조각(<w:t>·<a:t>·<hp:t>·<t>)을 문단 단위로 모은다 */
function xmlText(xml: string, textTag: string, paraTag: string): string {
  const paras = xml.split(new RegExp(`</${paraTag}>`));
  const re = new RegExp(`<${textTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${textTag}>`, "g");
  return paras
    .map((p) =>
      [...p.matchAll(re)].map((m) => decodeXmlEntities(m[1].replace(/<[^>]+>/g, ""))).join(""),
    )
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

const naturalOrder = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

async function zipDocText(buf: Uint8Array, ext: string): Promise<string> {
  const dec = new TextDecoder();
  if (ext === "docx") {
    const files = await unzip(buf, (n) =>
      /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n),
    );
    const order = [...files.keys()].sort((a, b) =>
      a.includes("document") ? -1 : b.includes("document") ? 1 : naturalOrder(a, b),
    );
    return order.map((n) => xmlText(dec.decode(files.get(n)), "w:t", "w:p")).join("\n");
  }
  if (ext === "pptx") {
    const files = await unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    return [...files.keys()]
      .sort(naturalOrder)
      .map((n, i) => `[슬라이드 ${i + 1}]\n${xmlText(dec.decode(files.get(n)), "a:t", "a:p")}`)
      .join("\n");
  }
  if (ext === "xlsx") {
    const files = await unzip(buf, (n) => n === "xl/sharedStrings.xml");
    const xml = files.get("xl/sharedStrings.xml");
    return xml ? xmlText(dec.decode(xml), "t", "si") : "";
  }
  // hwpx: Contents/section0.xml …
  const files = await unzip(buf, (n) => /^Contents\/section\d+\.xml$/i.test(n));
  return [...files.keys()]
    .sort(naturalOrder)
    .map((n) => xmlText(dec.decode(files.get(n)), "hp:t", "hp:p"))
    .join("\n");
}

// --- HWP 5.0 (OLE 복합 문서) -------------------------------------------------------------------
type CfbEntry = { name: string; type: number; start: number; size: number };

function readCfb(buf: Uint8Array) {
  if (u32(buf, 0) !== 0xe011cfd0 || u32(buf, 4) !== 0xe11ab1a1) throw new Error("cfb");
  const sectorSize = 1 << u16(buf, 0x1e);
  const miniSize = 1 << u16(buf, 0x20);
  const fatCount = u32(buf, 0x2c);
  const dirStart = u32(buf, 0x30);
  const miniCutoff = u32(buf, 0x38);
  const miniFatStart = u32(buf, 0x3c);
  let difatNext = u32(buf, 0x44);
  const sectorOff = (s: number) => (s + 1) * sectorSize;
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < fatCount; i++)
    fatSectors.push(u32(buf, 0x4c + i * 4));
  while (fatSectors.length < fatCount && difatNext < 0xfffffffa) {
    const o = sectorOff(difatNext);
    for (let i = 0; i < sectorSize / 4 - 1 && fatSectors.length < fatCount; i++)
      fatSectors.push(u32(buf, o + i * 4));
    difatNext = u32(buf, o + sectorSize - 4);
  }
  const fat: number[] = [];
  for (const s of fatSectors) {
    const o = sectorOff(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(buf, o + i * 4));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let s = start; s < 0xfffffffa && out.length < 1_000_000; s = table[s] ?? 0xfffffffe)
      out.push(s);
    return out;
  };
  const readChain = (start: number) => {
    const sectors = chain(start, fat);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) =>
      out.set(buf.subarray(sectorOff(s), sectorOff(s) + sectorSize), i * sectorSize),
    );
    return out;
  };
  const dir = readChain(dirStart);
  const entries: CfbEntry[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLen = u16(dir, o + 0x40);
    let name = "";
    for (let i = 0; i + 2 < nameLen; i += 2) name += String.fromCharCode(u16(dir, o + i));
    entries.push({
      name,
      type: dir[o + 0x42],
      start: u32(dir, o + 0x74),
      size: u32(dir, o + 0x78),
    });
  }
  const root = entries[0];
  const miniStream = root ? readChain(root.start) : new Uint8Array();
  const miniFat: number[] = [];
  if (miniFatStart < 0xfffffffa) {
    const mf = readChain(miniFatStart);
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
  }
  const stream = (e: CfbEntry): Uint8Array => {
    if (e.size < miniCutoff) {
      const sectors = chain(e.start, miniFat);
      const out = new Uint8Array(sectors.length * miniSize);
      sectors.forEach((s, i) =>
        out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize),
      );
      return out.subarray(0, e.size);
    }
    return readChain(e.start).subarray(0, e.size);
  };
  return { entries, stream };
}

/** HWPTAG_PARA_TEXT(67) 레코드의 UTF-16 글. 제어 문자 중 확장·인라인 제어(8글자 단위)는 건너뛴다 */
function hwpRecordsText(data: Uint8Array): string {
  const paras: string[] = [];
  let p = 0;
  while (p + 4 <= data.length) {
    const head = u32(data, p);
    const tag = head & 0x3ff;
    let size = head >>> 20;
    p += 4;
    if (size === 0xfff) {
      size = u32(data, p);
      p += 4;
    }
    if (tag === 67) {
      let s = "";
      for (let i = 0; i + 1 < size;) {
        const c = u16(data, p + i);
        if (c < 32) {
          if (c === 10 || c === 13) s += "\n";
          else if (c === 9) s += " ";
          // 0·24~31은 한 글자, 나머지 제어는 8글자(16바이트) 묶음
          i += c === 0 || (c >= 24 && c <= 31) || c === 10 || c === 13 ? 2 : 16;
          continue;
        }
        s += String.fromCharCode(c);
        i += 2;
      }
      paras.push(s.trim());
    }
    p += size;
  }
  return paras.filter(Boolean).join("\n");
}

async function hwpText(buf: Uint8Array): Promise<string> {
  const { entries, stream } = readCfb(buf);
  const header = entries.find((e) => e.name === "FileHeader");
  const flags = header ? u32(stream(header), 36) : 1;
  const compressed = (flags & 1) === 1;
  if (flags & 2) throw new Error("encrypted");
  // 배포용 문서(ViewText)는 암호화돼 있어 읽지 못한다 — BodyText의 Section만 본다
  const sections = entries
    .filter((e) => e.type === 2 && /^Section\d+$/.test(e.name))
    .sort((a, b) => naturalOrder(a.name, b.name));
  const out: string[] = [];
  for (const s of sections) {
    const raw = stream(s);
    out.push(hwpRecordsText(compressed ? await inflateRaw(raw) : raw));
  }
  return out.join("\n");
}

async function plainText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // 깨진 글자가 많으면 옛 한글 인코딩(EUC-KR·CP949)으로 다시 읽는다
  const broken = (utf8.match(/�/g) ?? []).length;
  if (broken > 5) {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

/** 문서 파일에서 글을 꺼낸다. 실패하면 이유만 돌려준다 (파일 내용은 담지 않는다) */
export async function extractDocText(file: File): Promise<TextDocResult> {
  const ext = extOf(file.name);
  try {
    let text: string;
    if (ext === "txt" || ext === "md" || ext === "csv") text = await plainText(file);
    else {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (ext === "hwp") text = await hwpText(buf);
      else if (["hwpx", "docx", "pptx", "xlsx"].includes(ext)) text = await zipDocText(buf, ext);
      else return { ok: false, error: "unsupported" };
    }
    const clean = text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return clean ? { ok: true, text: clean } : { ok: false, error: "empty" };
  } catch {
    return { ok: false, error: "broken" };
  }
}
