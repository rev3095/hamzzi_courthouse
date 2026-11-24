// 이용약관 초안 (PRD 10 고지, N1). 법무 검토 후 확정한다.
import type { Metadata } from "next";
import { PolicyPage, Section } from "@/components/PolicyPage";
import { ANON_QUESTION_LIMIT, USER_QUESTION_LIMIT } from "@/lib/inquiries/policy";

export const metadata: Metadata = { title: "이용약관 · 햄찌법원" };

export default function TermsPage() {
  return (
    <PolicyPage current="/terms" title="이용약관">
      <Section title="1. 서비스 성격">
        <p>
          햄찌법원은 무료 법률 상담·문서 대리 작성 서비스예요. 이용료·상담료·문서 작성료를 받지
          않고, 수익을 받지 않아요. 햄찌 판사는 AI 캐릭터이고 실제 판사·변호사가 아니에요.
        </p>
        <p>
          답변과 문서는 AI가 법제처 법령·판례를 먼저 근거로 삼아 쓰고, 찾지 못한 부분은 AI가 아는
          법령·판례로 채워요. 그래서 빠지거나 틀린 자료가 있을 수 있고, 사건의 결과를 예측하거나
          보장하지 않아요. 문서는 내기 전에 내용을 한 번 더 읽어 봐 주세요.
        </p>
      </Section>
      <Section title="2. 데모 기간 이용 조건">
        <p>
          로그인하지 않고 하루에 질문을 {ANON_QUESTION_LIMIT}번(이어 묻기 포함)까지 할 수 있어요.
          {process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1" &&
            ` Google 계정으로 로그인하면 하루 ${USER_QUESTION_LIMIT}번까지 할 수 있어요(로그인은 Google로만 해요).`}
          같은 네트워크에서는 하루에 분석할 수 있는 횟수가 정해져 있어요. 분석에 실패한 시도는
          횟수에 세지 않아요.
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
        <p>책임 범위와 분쟁 해결 방법은 이 문서에 적을 예정이에요.</p>
      </Section>
    </PolicyPage>
  );
}
