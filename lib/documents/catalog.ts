// 문서 작성 목록 (/documents, DEC-067): 서식을 분야별로 묶는다. 순서·묶음만 정하고 문안은 DOCUMENT_SPECS를 쓴다.
import type { DocumentKind } from "@/lib/procedure/steps";

export type DocumentGroup = { id: string; label: string; kinds: readonly DocumentKind[] };

export const DOCUMENT_GROUPS: readonly DocumentGroup[] = [
  {
    id: "money",
    label: "돈·계약 (민사)",
    kinds: [
      "demand-letter",
      "payment-order",
      "complaint",
      "answer",
      "order-objection",
      "decision-objection",
      "civil-mediation",
      "property-disclosure",
    ],
  },
  { id: "lease", label: "집·임대차", kinds: ["lease-registration", "lease-mediation"] },
  {
    id: "criminal",
    label: "고소·형사",
    kinds: [
      "criminal-complaint",
      "trade-fraud-complaint",
      "defamation-complaint",
      "obscenity-complaint",
      "compensation-order",
    ],
  },
  {
    id: "labor",
    label: "일·노동",
    kinds: ["wage-petition", "wage-advance", "dismissal-remedy", "dismissal-review"],
  },
  { id: "finance", label: "금융", kinds: ["financial-mediation"] },
];
