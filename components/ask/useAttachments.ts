"use client";
// 질문창에 붙인 서류 사진·문서 (F-015, DEC-052 · 2026-11-24 사진 30장·PDF·문서 추가). 파일은 이 화면 메모리에만 있고 브라우저 저장소에 넣지 않는다.
// 사진은 고르는 즉시 줄여 JPEG로, PDF는 그대로, 문서(한글·워드·파워포인트·엑셀·텍스트)는 글만 꺼낸다(lib/client/casefile prepareAttachment).
// 서버로 가는 것은 "서류 읽기"에 동의한 뒤다.
import { useCallback, useEffect, useRef, useState } from "react";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { isAttachable, prepareAttachment, type PreparedImage } from "@/lib/client/casefile";

export type Attachments = {
  items: PreparedImage[];
  /** 파일을 준비하는 중 */
  busy: boolean;
  error: string | null;
  add: (files: Iterable<File>) => Promise<void>;
  remove: (id: string) => void;
  clear: () => void;
};

const MAX = CASEFILE_LIMITS.maxImages;
const release = (i: PreparedImage) => {
  if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
};
const textChars = (items: PreparedImage[]) =>
  items.reduce((n, i) => n + (i.kind === "text" ? i.text.length : 0), 0);

export function useAttachments(): Attachments {
  const [items, setItems] = useState<PreparedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 동시에 여러 번 더해도 한도를 넘지 않게 지금 목록을 따로 들고 있는다
  const current = useRef<PreparedImage[]>([]);

  const commit = useCallback((next: PreparedImage[]) => {
    current.current = next;
    setItems(next);
  }, []);

  const add = useCallback(
    async (files: Iterable<File>) => {
      const list = [...files];
      if (list.length === 0) return;
      setError(null);
      setBusy(true);
      let problem: string | null = null;
      for (const file of list) {
        if (current.current.length >= MAX) {
          problem = `사진·문서는 ${MAX}개까지 붙일 수 있어요.`;
          break;
        }
        const r = await prepareAttachment(file);
        if (!r.ok) {
          problem =
            r.error === "not_image" || r.error === "unsupported"
              ? "사진·PDF·한글(hwp·hwpx)·워드·파워포인트·엑셀·텍스트 파일만 붙일 수 있어요."
              : r.error === "too_large"
                ? "너무 큰 파일이 있어요. 더 작은 파일로 다시 붙여 주세요."
                : r.error === "empty"
                  ? "글을 찾지 못한 문서가 있어요. 사진이나 PDF로 붙여 주세요."
                  : "열 수 없는 파일이 있어요. 암호가 걸린 문서는 PDF나 사진으로 붙여 주세요.";
          continue;
        }
        let item = r.image;
        if (item.kind === "text") {
          const left = CASEFILE_LIMITS.maxTextChars - textChars(current.current);
          if (left <= 0) {
            problem = `문서 글은 모두 합쳐 ${CASEFILE_LIMITS.maxTextChars.toLocaleString()}자까지 읽어요.`;
            continue;
          }
          if (item.text.length > left) {
            item = { ...item, text: item.text.slice(0, left) };
            problem = `문서 글이 길어 앞부분 ${CASEFILE_LIMITS.maxTextChars.toLocaleString()}자까지만 읽어요.`;
          }
        }
        if (current.current.length >= MAX) {
          release(item);
          problem = `사진·문서는 ${MAX}개까지 붙일 수 있어요.`;
          break;
        }
        commit([...current.current, item]);
      }
      setBusy(false);
      setError(problem);
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const gone = current.current.find((i) => i.id === id);
      if (gone) release(gone);
      commit(current.current.filter((i) => i.id !== id));
      setError(null);
    },
    [commit],
  );

  const clear = useCallback(() => {
    for (const i of current.current) release(i);
    commit([]);
    setError(null);
  }, [commit]);

  // 화면을 떠나면 미리보기 주소를 푼다
  useEffect(
    () => () => {
      for (const i of current.current) release(i);
    },
    [],
  );

  return { items, busy, error, add, remove, clear };
}

/** 끌어다 놓거나 붙여넣은 것 중 붙일 수 있는 파일(사진·PDF·문서)만 */
export function imageFilesOf(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter(isAttachable) : [];
}
