// 한 분석 요청에서 법제처로부터 가져온 근거 자료 모음 (DEC-009, F-005 AC2 ①).
// 인용 검증기는 "그 요청에서 가져온 자료인가"를 이 모음으로 판정하고, 원문 구절 대조(②)도 여기 텍스트로 한다.
// 요청 메모리에서만 쓰고 저장하지 않는다 (판례 본문 미저장, DEC-007).

import { caseKey, statuteKey } from "./normalize";
import type { ArticleHit, CaseDetail, CaseHit } from "./types";

export type EvidenceItem =
  | { kind: "statute"; key: string; ref: ArticleHit }
  | { kind: "case"; key: string; ref: CaseHit | CaseDetail };

export class EvidenceSet {
  private readonly items = new Map<string, EvidenceItem>();

  addArticle(article: ArticleHit): string {
    const key = statuteKey(article.lawName, article.articleNo);
    this.items.set(key, { kind: "statute", key, ref: article });
    return key;
  }

  /** 같은 판례를 상세로 다시 넣으면 상세가 목록 항목을 덮는다 */
  addCase(c: CaseHit | CaseDetail): string {
    const key = caseKey(c.caseNo);
    const prev = this.items.get(key);
    if (!(prev?.kind === "case" && "fromBody" in prev.ref && !("fromBody" in c))) {
      this.items.set(key, { kind: "case", key, ref: c });
    }
    return key;
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  get(key: string): EvidenceItem | undefined {
    return this.items.get(key);
  }

  findStatute(lawName: string, articleNo: string): EvidenceItem | undefined {
    return this.items.get(statuteKey(lawName, articleNo));
  }

  findCase(caseNo: string): EvidenceItem | undefined {
    return this.items.get(caseKey(caseNo));
  }

  /** 원문 구절 대조(F-005 AC2 ②)에 쓰는 원문. 판례는 판시사항·요지·(fromBody면) 본문 일부 */
  sourceText(key: string): string {
    const item = this.items.get(key);
    if (!item) return "";
    if (item.kind === "statute") return item.ref.text;
    const ref = item.ref;
    if (!("fromBody" in ref)) return ref.caseName;
    return [ref.holding, ref.summary, ref.bodyExcerpt].filter(Boolean).join("\n");
  }

  list(): EvidenceItem[] {
    return [...this.items.values()];
  }
}
