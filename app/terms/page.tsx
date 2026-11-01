// 이용약관 초안 (PRD 10 고지, N1). 법무 검토 후 확정한다.
import type { Metadata } from "next";
import { PolicyPage, Section } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "이용약관 · 햄찌법원" };

export default function TermsPage() {
  return (
    <PolicyPage current="/terms" title="이용약관">
      <Section title="1. 서비스 성격">
        <p>
          햄찌법원은 법률 정보를 찾아 정리해 보여 드리는 참고용 서비스예요. 법률 자문이 아니며,
          변호사·법무사의 상담을 대신하지 않아요. 햄찌 판사는 AI 캐릭터이고 실제 판사·변호사가
          아니에요.
        </p>
        <p>
          결과는 이번 검색에서 찾은 법령·판례를 근거로 만든 것이라 빠진 자료가 있을 수 있고, 사건의
          결과를 예측하거나 보장하지 않아요. 중요한 결정 전에는 전문가와 상담해 주세요.
        </p>
      </Section>
      <Section title="2. 데모 기간 이용 조건">
        <p>
          로그인하지 않고 질문을 3번(이어 묻기 포함)까지 할 수 있어요. 같은 네트워크에서는 하루에
          분석할 수 있는 횟수가 정해져 있어요. 분석에 실패한 시도는 횟수에 세지 않아요.
        </p>
        <p>데모 기간에는 기능과 횟수가 바뀌거나 서비스가 멈출 수 있어요.</p>
      </Section>
      <Section title="3. 이용자의 약속">
        <p>
          다른 사람을 알아볼 수 있는 정보는 빼고 적어 주세요. 서비스를 자동으로 반복 호출하거나
          제한을 피하려는 행위는 하지 말아 주세요.
        </p>
      </Section>
      <Section title="4. 책임의 한계">
        <p>책임 범위와 분쟁 해결 방법은 법무 검토 후 이 문서에 적을 예정이에요.</p>
      </Section>
    </PolicyPage>
  );
}
