"use client";
// 발표 자료 디자인 탭의 슬라이드 9장. 내용은 claude.ai 아티팩트 "햄찌법원 발표 자료"(2026-11-15판, 9장·5분)를 그대로 옮겼다.
// 색·글꼴·모서리는 DeckDesigner의 Design 값(CSS 변수 --d-*)을 따른다. 클래스는 deck.css의 hzd- 접두어.
// 원본 4장(해결)·9장(약속)의 실제 화면 캡처는 글 카드·간단한 화면 모양으로 바꿨다.
import type { CSSProperties, ReactNode } from "react";
import type { MascotMood } from "@/lib/mascot/moods";
import { HamzziJudge } from "../HamzziJudge";

/** deck.css 클래스 이름 */
const k = (...names: string[]) => names.map((n) => `hzd-${n}`).join(" ");

type Vars = CSSProperties;

function Slide({
  v,
  n,
  eyebrow,
  title,
  source,
  dark = false,
  children,
}: {
  v: Vars;
  n?: number;
  eyebrow?: string;
  title?: ReactNode;
  source?: string;
  dark?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={k("slide", ...(dark ? ["title"] : []))} style={v}>
      <div className={k("in")}>
        {eyebrow && <div className={k("eyebrow")}>{eyebrow}</div>}
        {title && <div className={k("h", "htop")}>{title}</div>}
        {children}
        {source && <div className={k("src")}>{source}</div>}
        {n && (
          <div className={k("foot")}>
            <span>햄찌법원</span>
            <span>{n}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 1 · 표지 */
export function CoverSlide({ v, mood }: { v: Vars; mood: MascotMood }) {
  return (
    <div className={k("slide", "title")} style={v}>
      <div className={k("in")}>
        <div className={k("eyebrow")} style={{ marginTop: "8cqw" }}>
          2026년 청년 창업아이디어 경진대회
        </div>
        <div className={k("tt")}>햄찌법원</div>
        <div className={k("ts")}>
          변호사 없이 내 사건을 준비하는
          <br />
          가장 쉬운 법률 길잡이
        </div>
        <div className={k("mas")}>
          <span className={k("bubble")}>무슨 일이 있었나요? 편하게 말해 주세요!</span>
          <HamzziJudge size={240} mood={mood} interactive={false} />
          <span className={k("masnote")}>AI 캐릭터</span>
        </div>
      </div>
    </div>
  );
}

/** 2 · 문제 */
export function ProblemSlide({ v }: { v: Vars }) {
  const stats: [string, string, boolean][] = [
    ["81%", "소액 사건 중 양쪽 모두 변호사 없이 진행 (2024년)", false],
    ["80.7%", "없는 판례가 인용된 서면을 받아 본 법관 (응답 기준)", true],
    ["69.5%", "그 서면을 낸 쪽이 소송 당사자인 경우", true],
  ];
  return (
    <Slide
      v={v}
      n={2}
      eyebrow="문제"
      title="민사 사건 10건 중 9건은 변호사 없이 진행됩니다"
      source="출처: 대법원 2025 사법연감(머니투데이 2026.5, 매일신문 2026.4 인용), 법률신문 2026.11.2 (대법원 법관 설문)"
    >
      <div className={k("two")}>
        <div>
          <div className={k("big")}>90%</div>
          <div className={k("cap")}>
            2024년 민사 사건 가운데 약 70만 5천 건이 한쪽 이상 변호사 없이 진행됐습니다.
            <b>당사자들은 이미 AI에게 묻고 있습니다.</b>
          </div>
        </div>
        <div>
          {stats.map(([num, text, accent]) => (
            <div key={num} className={k("st")}>
              <i className={accent ? k("accent") : undefined}>{num}</i>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

/** 3 · 빈자리 */
function GapSlide({ v }: { v: Vars }) {
  const steps: { price: string; lines: string[]; h: number; on?: boolean }[] = [
    { price: "4,850원", lines: ["내용증명 직접 발송"], h: 26 },
    {
      price: "무료~1만 원 이내",
      lines: ["햄찌법원", "기본 기능 무료", "Pro 월 9,900원", "첫 3개월 2,900원"],
      h: 50,
      on: true,
    },
    { price: "20만 원", lines: ["지급명령", "온라인 대행"], h: 61 },
    { price: "30만~50만 원", lines: ["변호사", "서면 첨삭"], h: 76 },
    { price: "80만 원~", lines: ["변호사 선임", "(청구 300만 원 기준)"], h: 100 },
  ];
  return (
    <Slide
      v={v}
      n={3}
      eyebrow="빈자리"
      title="5천 원과 20만 원 사이에 도움받을 곳이 없습니다"
      source="출처: 우편 요금 고시 인용 서식 사이트, 머니백 요금 페이지(부가세·실비 별도), ONION 출시 보도. 선임료는 비공식 범위입니다."
    >
      <div className={k("stairs")}>
        {steps.map((st) => (
          <div
            key={st.price}
            className={k("card", "stair", ...(st.on ? ["on"] : []))}
            style={{ height: `${st.h}%` }}
          >
            <b>{st.price}</b>
            {st.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        ))}
      </div>
    </Slide>
  );
}

/** 4 · 해결 */
function SolutionSlide({ v }: { v: Vars }) {
  const cards: [string, string, string, number][] = [
    [
      "01",
      "일상 말로 묻기",
      "“전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준다고 하면서 돌려주지 않아요.”",
      4,
    ],
    ["02", "법령·판례 실시간 조회", "법제처에서 관련 조문과 판례를 바로 찾아요", 4],
    ["03", "인용을 다시 확인", "답에 쓴 인용을 다시 조회해 실제로 있는 것에만 ‘검증됨’", 4],
    [
      "04",
      "절차 타임라인과 마일스톤",
      "증거 정리부터 강제집행까지 일곱 단계 · 혼자 가능 / 상황에 따라 / 전문가 권장",
      6,
    ],
    ["05", "첫 단계 추천", "규칙에 따라 고른 안내 — 사건 결과를 판단하지 않아요", 3],
    ["06", "심층 질문", "막히는 단계는 더 물어볼 수 있어요", 3],
  ];
  return (
    <Slide
      v={v}
      n={4}
      eyebrow="해결"
      title="질문에서 다음 행동까지, 여섯 단계로 안내합니다"
      source="원본 발표 자료에는 단계마다 배포된 실제 화면(hamzzi-courthouse.vercel.app)이 들어갑니다. 타임라인은 참고용이며 사건 결과를 판단하지 않습니다."
    >
      <div className={k("grid12")}>
        {cards.map(([num, head, body, span]) => (
          <div key={num} className={k("card")} style={{ gridColumn: `span ${span}` }}>
            <div className={k("cardh")}>
              <i className={k("accent")}>{num}</i> {head}
            </div>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

/** 5 · 차별점 */
function CompareSlide({ v }: { v: Vars }) {
  const rows: [string, string, string, string, string][] = [
    ["대상", "변호사·법률 전문가 (자격 인증)", "누구나", "일반인", "변호사 없이 준비하는 일반인"],
    [
      "가격",
      "월 23,760~83,160원 (할인가)",
      "무료~월 구독",
      "20만~50만 원",
      "기본 무료 · Pro 월 9,900원 (첫 3개월 2,900원)",
    ],
    [
      "근거",
      "판례 542만 건 연동",
      "원문 확인 없음 · 허위 판례 보도 다수",
      "변호사가 처리",
      "법제처 원문을 다시 조회해 확인",
    ],
    ["역할", "전문가의 리서치·서면", "초안 생성", "대신 해 줌", "스스로 하도록 안내"],
    ["말투", "전문가용", "일반 대화", "실무형", "귀여운 햄스터 말투"],
  ];
  return (
    <Slide
      v={v}
      n={5}
      eyebrow="차별점"
      title="판례 수보다, 혼자 하는 사람을 위한 도구입니다"
      source="출처: 슈퍼로이어 요금·홈 페이지(2026.11.14 확인), 머니백 요금 페이지, ONION 출시 보도, 법률신문."
    >
      <table className={k("table")}>
        <thead>
          <tr>
            <th />
            <th>슈퍼로이어</th>
            <th>범용 AI 챗봇</th>
            <th>대행·첨삭 서비스</th>
            <th className={k("me")}>햄찌법원</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td key={i} className={i === 4 ? k("me") : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Slide>
  );
}

/** 6 · 비용 */
function CostSlide({ v }: { v: Vars }) {
  const tiles: [string, string, string, boolean][] = [
    ["약 7원", "질문 1건의 AI 비용", "Claude Haiku 5.5 · 실측 토큰량 기준", true],
    ["약 70원", "사건 1건을 끝까지", "한 사람이 질문 10번을 한다고 가정", false],
    ["21원", "질문당 비용 상한", "넘으면 호출하지 않도록 코드로 막아 둠", false],
  ];
  const bars: [string, string, number][] = [
    ["0.7", "이용자 100명", 2],
    ["6.7", "1,000명", 11],
    ["66.5", "10,000명", 86],
  ];
  return (
    <Slide
      v={v}
      n={6}
      eyebrow="비용"
      title="질문 1건 원가 약 7원, 그래서 무료가 가능합니다"
      source="환율 1달러 1,400원 가정. 토큰량은 평가 12건 실측 평균이며, Haiku로 낸 답변의 품질은 추가 측정이 필요합니다."
    >
      <div className={k("two")} style={{ gridTemplateColumns: "46% 1fr" }}>
        <div className={k("tiles")}>
          {tiles.map(([num, head, sub, accent]) => (
            <div key={num} className={k("tile")}>
              <i className={accent ? k("accent") : undefined}>{num}</i>
              <div>
                <b>{head}</b>
                <span>{sub}</span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className={k("ct")}>월 AI 비용 (만 원, 1인 10질문 가정)</div>
          <div className={k("bars")}>
            {bars.map(([num, , h]) => (
              <div key={num}>
                {num}
                <u style={{ height: `${h}%` }} />
              </div>
            ))}
          </div>
          <div className={k("blab")}>
            {bars.map(([num, label]) => (
              <span key={num}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </Slide>
  );
}

/** 7 · 법과 수익 */
function LawSlide({ v }: { v: Vars }) {
  const revenue: [string, string, string][] = [
    ["수익 1", "서식 자동 완성", "문답으로 빈칸을 채우는 표준 서식"],
    ["수익 2", "편의 기능 구독", "기록 보관, 기한 알림, 비용 계산"],
    ["수익 3", "기관 납품", "지자체·청년센터·법률구조 기관"],
  ];
  return (
    <Slide
      v={v}
      n={7}
      eyebrow="법과 수익"
      title="정보는 무료로, 판단은 전문가에게 맡깁니다"
      source="근거: 변호사법 제109조·제34조, 표준 서식 자동 작성 적법 판결 보도(2026.3). 유료 기능은 변호사 검토 후 도입합니다."
    >
      <div className={k("grid12")}>
        <div className={k("card", "list")} style={{ gridColumn: "span 6" }}>
          <div className={k("cardh", "accent")}>DO</div>
          <ul>
            <li>법령·판례 검색과 쉬운 요약</li>
            <li>절차와 필요한 서류 안내</li>
            <li>공공 서식과 상담 기관으로 연결</li>
            <li>AI 생성임과 법률 자문이 아님을 표시</li>
          </ul>
        </div>
        <div className={k("card", "list")} style={{ gridColumn: "span 6" }}>
          <div className={k("cardh", "no")}>DON&apos;T</div>
          <ul>
            <li>승패 판단과 결과 단정</li>
            <li>돈을 받는 개별 사건 상담</li>
            <li>소장 같은 문서의 대리 작성 판매</li>
            <li>변호사 알선 수수료</li>
          </ul>
        </div>
        {revenue.map(([tag, head, sub]) => (
          <div key={tag} className={k("card", "tint")} style={{ gridColumn: "span 4" }}>
            <span className={k("tag")}>{tag}</span>
            <div className={k("cardh")}>{head}</div>
            <p>{sub}</p>
          </div>
        ))}
      </div>
    </Slide>
  );
}

/** 8 · 계획 */
function PlanSlide({ v }: { v: Vars }) {
  const plan: [string, string, string, boolean][] = [
    ["2026.11", "품질 검증", "변호사 검수와 답변 품질 평가", false],
    ["2026.12 이후", "이천 시범", "청년 100명과 임대차·임금체불부터", true],
    ["2027 상반기", "기관 연계", "상담 창구에 사전 정리 도구로 제공", false],
    ["2027 하반기", "지역 확장", "경기 동남부 지자체로 확대", false],
  ];
  return (
    <Slide
      v={v}
      n={8}
      eyebrow="계획"
      title="이천에서 먼저 검증하고 넓힙니다"
      source="출처: 이천시청 열린무료법률상담 안내 (2026.11 확인)"
    >
      <div className={k("grid12")}>
        {plan.map(([when, head, sub, on]) => (
          <div
            key={when}
            className={k("card", ...(on ? ["on"] : []))}
            style={{ gridColumn: "span 3" }}
          >
            <span className={k("tag")}>{when}</span>
            <div className={k("cardh", "lg")}>{head}</div>
            <p>{sub}</p>
          </div>
        ))}
        <div className={k("card", "tint")} style={{ gridColumn: "span 6" }}>
          <span className={k("tag")}>이천의 현재 법적 도움 창구</span>
          <div className={k("cardh")}>
            시청 무료법률상담은 매월 2회, 월요일 오후 2~6시에만 열립니다.
          </div>
        </div>
        <div className={k("card", "tint")} style={{ gridColumn: "span 6" }}>
          <span className={k("tag")}>필요한 지원</span>
          <div className={k("cardh")}>
            시 무료법률상담·청년 창구 연계, 변호사 자문 연결, 시범 이용자 모집
          </div>
        </div>
      </div>
    </Slide>
  );
}

/** 9 · 약속 (표지 배경 색을 쓴다) */
function PromiseSlide({ v, mood }: { v: Vars; mood: MascotMood }) {
  const promises = [
    "법령·판례 근거 없이 말하지 않습니다",
    "결과를 단정하지 않습니다",
    "개인정보는 가려서 다룹니다",
  ];
  return (
    <Slide v={v} dark>
      <div className={k("eyebrow")} style={{ opacity: 0.75 }}>
        햄찌법원의 약속
      </div>
      <div className={k("tt")} style={{ fontSize: "5.4cqw" }}>
        귀엽지만,
        <br />
        답은 진지하게
      </div>
      <ol className={k("promise")}>
        {promises.map((p, i) => (
          <li key={p}>
            <i className={k("accent")}>{String(i + 1).padStart(2, "0")}</i>
            {p}
          </li>
        ))}
      </ol>
      <div className={k("url")}>hamzzi-courthouse.vercel.app</div>
      <div className={k("phone")}>
        <span className={k("chip")}>AI 생성 · 법률 자문 아님</span>
        <HamzziJudge size={120} mood={mood} interactive={false} />
        <b>햄찌 판사의 정리</b>
        <span>AI 캐릭터 · 근거 법령·판례 인용</span>
        <span className={k("line")} />
        <span className={k("line", "short")} />
      </div>
    </Slide>
  );
}

/** 발표 순서대로 9장 */
export function DeckSlides({ v, mood }: { v: Vars; mood: MascotMood }) {
  return (
    <>
      <CoverSlide v={v} mood={mood} />
      <ProblemSlide v={v} />
      <GapSlide v={v} />
      <SolutionSlide v={v} />
      <CompareSlide v={v} />
      <CostSlide v={v} />
      <LawSlide v={v} />
      <PlanSlide v={v} />
      <PromiseSlide v={v} mood={mood} />
    </>
  );
}
