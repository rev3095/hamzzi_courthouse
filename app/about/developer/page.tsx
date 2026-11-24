// 개발자·문의 (DEC-051): 개발자 연락처(사용자가 공개를 요청한 이메일)와 문의 남기기 양식.
import type { Metadata } from "next";
import { AboutBlock, AboutShell } from "@/components/about/AboutShell";
import { ContactForm, EmailReveal } from "@/components/about/ContactForm";
import { DEVELOPER } from "@/lib/about/content";

export const metadata: Metadata = { title: "개발자·문의 · 햄찌법원" };

export default function DeveloperPage() {
  return (
    <AboutShell current="/about/developer" title="개발자·문의">
      {DEVELOPER.map((s) => (
        <AboutBlock key={s.title} section={s} />
      ))}
      <section>
        <h2 className="font-display text-ink text-lg font-bold">이메일</h2>
        <p className="text-muted mt-2">
          메일에는 개인정보나 사건 내용을 적지 말아 주세요. 사건에 대한 법률 상담에는 답하지 못해요.
        </p>
        <div className="mt-3">
          <EmailReveal />
        </div>
      </section>
      <section id="contact" className="scroll-mt-24">
        <h2 className="font-display text-ink text-lg font-bold">문의 남기기</h2>
        <div className="mt-3">
          <ContactForm />
        </div>
      </section>
    </AboutShell>
  );
}
