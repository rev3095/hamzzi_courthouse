"use client";
// 질문창에 붙인 서류 사진 (F-015, DEC-052). 사진은 이 화면 메모리에만 있고 브라우저 저장소에 넣지 않는다.
// 고르는 즉시 브라우저에서 줄여 JPEG로 바꾼다(lib/client/casefile prepareImage) — 서버로 가는 것은 "서류 읽기"에 동의한 뒤다.
import { useCallback, useEffect, useRef, useState } from "react";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { prepareImage, type PreparedImage } from "@/lib/client/casefile";

export type Attachments = {
  items: PreparedImage[];
  /** 사진을 줄이는 중 */
  busy: boolean;
  error: string | null;
  add: (files: Iterable<File>) => Promise<void>;
  remove: (id: string) => void;
  clear: () => void;
};

const MAX = CASEFILE_LIMITS.maxImages;

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
          problem = `사진은 ${MAX}장까지 붙일 수 있어요.`;
          break;
        }
        const r = await prepareImage(file);
        if (!r.ok) {
          problem =
            r.error === "not_image"
              ? "사진 파일(JPG·PNG·WebP)만 붙일 수 있어요."
              : r.error === "too_large"
                ? "너무 큰 사진이 있어요. 더 작은 사진으로 다시 붙여 주세요."
                : "열 수 없는 사진이 있어요. 다른 사진으로 다시 붙여 주세요.";
          continue;
        }
        if (current.current.length >= MAX) {
          URL.revokeObjectURL(r.image.previewUrl);
          problem = `사진은 ${MAX}장까지 붙일 수 있어요.`;
          break;
        }
        commit([...current.current, r.image]);
      }
      setBusy(false);
      setError(problem);
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const gone = current.current.find((i) => i.id === id);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      commit(current.current.filter((i) => i.id !== id));
      setError(null);
    },
    [commit],
  );

  const clear = useCallback(() => {
    for (const i of current.current) URL.revokeObjectURL(i.previewUrl);
    commit([]);
    setError(null);
  }, [commit]);

  // 화면을 떠나면 미리보기 주소를 푼다
  useEffect(
    () => () => {
      for (const i of current.current) URL.revokeObjectURL(i.previewUrl);
    },
    [],
  );

  return { items, busy, error, add, remove, clear };
}

/** 끌어다 놓거나 붙여넣은 것 중 사진 파일만 */
export function imageFilesOf(data: DataTransfer | null): File[] {
  return data ? [...data.files].filter((f) => f.type.startsWith("image/")) : [];
}
