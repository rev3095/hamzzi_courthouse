// 출처 표기 (법제처 Open API 이용안내: 출처 표기 의무, docs/research/01). 문구는 법제처 이용조건 확인 후 확정한다.
import type { Metadata } from "next";
import { PolicyPage, Section } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "출처 표기 · 햄찌법원" };

export default function SourcesPage() {
  return (
    <PolicyPage current="/sources" title="출처 표기">
      <Section title="법령·판례">
        <p>
          햄찌법원의 법령·판례 정보는 법제처 국가법령정보센터 Open API(open.law.go.kr)에서 가져와요.
          결과 화면의 각 항목에 있는 &lsquo;원문 보기&rsquo;를 누르면 국가법령정보센터의 원문으로
          연결돼요.
        </p>
        <p>
          판결문 원문은 저장하지 않고 법제처 링크로 연결해요. 답변에 인용한 조문·사건번호는 법제처
          재조회로 실제로 있는지 확인하고, 인용 구절은 그때 가져온 원문과 글자 그대로 같은지
          비교해요. 다르면 &lsquo;확인 필요&rsquo;로 표시해요.
        </p>
      </Section>
      <Section title="예시 질문">
        <p>
          예시 질문은 햄찌법원이 직접 작성한 가상 사연이에요. 예시 답변은 미리 분석해 둔 것이고,
          인용 확인(재조회)도 예시를 만들 때 한 번 한 결과예요. 보실 때 다시 조회하지는 않아요.
        </p>
      </Section>
    </PolicyPage>
  );
}
