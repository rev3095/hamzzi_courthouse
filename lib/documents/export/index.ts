// 내보내기 형식 고르기 (DEC-025). 형식별 코드는 고를 때만 불러온다(dynamic import) — 화면 첫 로딩을 가볍게.
// 모두 브라우저 안에서 만든다. 서버로 문서 내용을 보내지 않는다.
import type { Block } from "../fill";

export type ExportFormat = "hwpx" | "docx" | "pdf";

export const EXPORT_FORMATS: {
  value: ExportFormat;
  label: string;
  ext: string;
  note: string;
}[] = [
  {
    value: "hwpx",
    label: "한글 (HWPX)",
    ext: "hwpx",
    note: "한글·한컴오피스에서 열어요 (실험 기능)",
  },
  { value: "docx", label: "워드 (DOCX)", ext: "docx", note: "MS 워드·한글·구글 문서에서 열어요" },
  { value: "pdf", label: "PDF", ext: "pdf", note: "고칠 수 없는 인쇄용 문서예요" },
];

export type BuiltFile = { data: Uint8Array; mime: string; filename: string };

/** PDF 글꼴은 이 함수로 받는다 (브라우저: fetch, 테스트: 파일 읽기) */
export type FontLoader = () => Promise<{ regular: Uint8Array; bold: Uint8Array }>;

export async function buildFile(
  format: ExportFormat,
  blocks: readonly Block[],
  meta: { title: string; basename: string },
  loadFonts: FontLoader,
): Promise<BuiltFile> {
  const ext = EXPORT_FORMATS.find((f) => f.value === format)!.ext;
  const filename = `${meta.basename}.${ext}`;
  if (format === "docx") {
    const { toDocx, DOCX_MIME } = await import("./docx");
    return { data: toDocx(blocks), mime: DOCX_MIME, filename };
  }
  if (format === "hwpx") {
    const { toHwpx, HWPX_MIME } = await import("./hwpx");
    return { data: toHwpx(blocks), mime: HWPX_MIME, filename };
  }
  const { toPdf, PDF_MIME } = await import("./pdf");
  return { data: await toPdf(blocks, await loadFonts(), meta), mime: PDF_MIME, filename };
}

/** 브라우저용 글꼴 불러오기 (public/fonts, 같은 사이트) */
export const fetchFonts: FontLoader = async () => {
  const { PDF_FONT_URLS } = await import("./pdf");
  const get = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("font");
    return new Uint8Array(await res.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([get(PDF_FONT_URLS.regular), get(PDF_FONT_URLS.bold)]);
  return { regular, bold };
};

/** 내려받기 (브라우저). 파일은 메모리에서 바로 내려받고 어디에도 남기지 않는다 */
export function downloadFile(file: BuiltFile) {
  const url = URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
