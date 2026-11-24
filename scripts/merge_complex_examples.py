"""복잡한 예시(evals/examples-complex)를 lib/demo/examples.json에 반영한다 (무료, 모델 호출 없음, DEC-059).

사용: python -X utf8 scripts/merge_complex_examples.py
- 예시마다 쪽(원고·피고 / 고소인·피의자 / 신청인)별 답변을 sides로 넣는다. 화면 질문은 요약 질문(summary),
  답변은 복잡한 상황(context)으로 만든 것이다.
- 인용 검증을 통과한(verified) 문단만 남긴다. 남은 문단이 2개 미만인 쪽은 넣지 않는다.
- 첫 쪽의 요약 질문·답변이 예시의 question·result가 된다. 바꾸기 전의 짧은 질문은 재생하지 않는다
  (그 질문을 한 쪽이 걸러졌으면 반대쪽 답이 나가고, 짧은 질문만 보는 화면에는 답변의 바탕인 상황 글이 없다).
- 쪽이 하나도 남지 않은 예시는 그대로 둔다. 원본(바꾸기 전)은 git 기록에 있고, 다시 실행해도 같은 결과다.
- 문서 작성 절차·초안은 생성 때 거른 뒤(scripts/gen-complex-docs.mjs) 여기서 한 번 더 거른다:
  · 조문: 법령 이름까지 그 쪽의 검증된 근거와 맞아야 한다(정식 이름 또는 약칭 표와 공백 없이 일치).
    이름 없는 조문("같은 법 제N조", "제N조")은 바로 앞에 나온 법령 이름을 이어받는다.
  · 숫자+단위(일·주·개월·년·원·% 등)와 한글 수사(열흘·한 달 등): 상황 글(날짜 꼴은 뺀다)이나 검증된 인용 구절에
    같은 꼴이 있어야 한다 — 기한·비용을 모델이 만들지 않게 (절대 규칙 3)
"""

import io
import json
import os
import re

EXAMPLES = "lib/demo/examples.json"
DIR = "evals/examples-complex"
MIN_POINTS = 2

# 흔한 약칭 → 정식 이름(공백 없음)
ABBR = {
    "전자상거래법": "전자상거래등에서의소비자보호에관한법률",
    "정보통신망법": "정보통신망이용촉진및정보보호등에관한법률",
    "상가임대차법": "상가건물임대차보호법",
    "상가건물임대차법": "상가건물임대차보호법",
    "주택임대차법": "주택임대차보호법",
    "성폭력처벌법": "성폭력범죄의처벌등에관한특례법",
    "스토킹처벌법": "스토킹범죄의처벌등에관한법률",
    "가정폭력처벌법": "가정폭력범죄의처벌등에관한특례법",
    "채무자회생법": "채무자회생및파산에관한법률",
    "산재보험법": "산업재해보상보험법",
    "학교폭력예방법": "학교폭력예방및대책에관한법률",
    "학폭법": "학교폭력예방및대책에관한법률",
    "상증세법": "상속세및증여세법",
    "통신사기피해환급법": "전기통신금융사기피해방지및피해자산환급에관한특별법",
    "의료분쟁조정법": "의료사고피해구제및의료분쟁조정등에관한법률",
    "집합건물법": "집합건물의소유및관리에관한법률",
    "자배법": "자동차손해배상보장법",
    "교특법": "교통사고처리특례법",
    "양육비이행법": "양육비이행확보및지원에관한법률",
    "대부업법": "대부업등의등록및금융이용자보호에관한법률",
    "군인복무기본법": "군인의지위및복무에관한기본법",
    "질서위반행위법": "질서위반행위규제법",
}
# 본법을 가리키는 말. "같은 법 시행령"·"영"·"같은 법 시행규칙"·"규칙"은 따로 (시행령·시행규칙을 이어받는다)
SAME = {"같은법", "이법", "동법", "법"}
SAME_DECREE = {"같은법시행령", "같은영", "영", "시행령"}
SAME_RULE = {"같은법시행규칙", "같은규칙", "규칙", "시행규칙"}
LAW_ARTICLE = re.compile(
    r"((?:[가-힣ㆍ·]+\s){0,12}[가-힣ㆍ·]*(?:법|법률|령|규칙)(?:\s*시행령|\s*시행규칙)?)?(?:상)?\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?"
)
CASE_NO = re.compile(r"\d{2,4}\s?(?![년월일])[가-힣]{1,4}\s?\d{2,7}")
SENT = re.compile(r"(?<=[.?!다요])\s+(?=\S)")
UNIT = r"(?:개월|주일|주|일|년|시간|만\s*원|억\s*원|천\s*원|원|%|퍼센트|배)"
NUM_UNIT = re.compile(r"(\d[\d,.]*)\s*(" + UNIT + ")")
# "1억 5천만 원", "3천만 원" 같은 금액은 통째로 한 토큰
MONEY = re.compile(
    r"\d+\s*억(?:\s*\d+\s*천)?(?:\s*\d+\s*백)?\s*만?\s*원|\d+\s*천\s*만?\s*원"
)
DATE = re.compile(
    r"(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}\s*년|\d{4}\s*[.\-]\s*\d{1,2}\s*[.\-]\s*\d{1,2}\.?"
)
WORD_NUM = re.compile(r"하루|이틀|사흘|나흘|닷새|엿새|이레|열흘|보름|반년")
# 한글 수사를 숫자 꼴로 맞춘다 — 상황 글의 '한 시간쯤'과 초안의 '1시간'을 같은 사실로 본다. 달 → 개월, 해 → 년
KOR_NUM = [
    (re.compile(r"일주일"), "1주일"),
    (re.compile(r"(?<![가-힣])한\s*(달|시간|주|해)"), r"1\1"),
    (re.compile(r"(?<![가-힣])두\s*(달|시간|주|해)"), r"2\1"),
    (re.compile(r"(?<![가-힣])(?:세|석)\s*(달|시간|주|해)"), r"3\1"),
    (re.compile(r"(?<![가-힣])네\s*(달|시간|주|해)"), r"4\1"),
    (re.compile(r"(\d+)\s*달"), r"\1개월"),
    (re.compile(r"(\d+)\s*해"), r"\1년"),
    (re.compile(r"이틀"), "2일"),
    (re.compile(r"사흘"), "3일"),
    (re.compile(r"나흘"), "4일"),
    (re.compile(r"열흘"), "10일"),
    (re.compile(r"보름"), "15일"),
]


def read(p):
    return io.open(p, encoding="utf-8").read()


def nospace(s):
    return re.sub(r"\s+", "", s)


def law_pairs(points):
    """검증된 문단의 조문 (법령 이름 공백 제거, 제N조[의M])"""
    out = set()
    for p in points:
        if p["source"].startswith("law:"):
            _, law, art = p["source"].split(":", 2)
            out.add((nospace(law), nospace(art)))
    return out


def resolve_law(words):
    """잡힌 낱말 묶음의 뒤쪽 부분 가운데 정식 이름·약칭과 맞는 것을 찾는다. 같은 법 꼴이면 'SAME'"""
    parts = words.split()
    for i in range(len(parts)):
        name = "".join(parts[i:])
        if name in SAME:
            return "SAME"
        if name in SAME_DECREE:
            return "SAME+시행령"
        if name in SAME_RULE:
            return "SAME+시행규칙"
        if name in ABBR:
            return ABBR[name]
        for tail in ("시행령", "시행규칙"):
            if name.endswith(tail) and name[: -len(tail)] in ABBR:
                return ABBR[name[: -len(tail)]] + tail
    return None


def date_tokens(text):
    return {nospace(m.group(0)).rstrip(".") for m in DATE.finditer(text)}


def number_tokens(text):
    """날짜는 date_tokens가 따로 본다. 금액(억·천만)은 통째로, 나머지는 숫자+단위로"""
    t = DATE.sub(" ", text.replace(",", ""))
    toks = {nospace(m.group(0)) for m in MONEY.finditer(t)}
    t = MONEY.sub(" ", t)
    for pat, rep in KOR_NUM:
        t = pat.sub(rep, t)
    toks |= {
        f"{m.group(1).rstrip('.')}{nospace(m.group(2))}" for m in NUM_UNIT.finditer(t)
    }
    return toks | {nospace(m.group(0)) for m in WORD_NUM.finditer(t)}


def screen_guide(guide, points, context, drops):
    ok = law_pairs(points)
    full_names = {law for law, _ in ok}
    cases = {
        nospace(p["source"][5:]) for p in points if p["source"].startswith("case:")
    }
    allowed_nums = number_tokens(context)
    allowed_dates = date_tokens(context)
    for p in points:
        if p["check"] == "verified":
            allowed_nums |= number_tokens(p["quote"])
            allowed_dates |= date_tokens(p["quote"])

    def keep(sentence, state):
        # 「형법」·『민법』 같은 괄호를 벗기고 본다
        sentence_n = re.sub(r"[「」『』]", "", sentence)
        for m in CASE_NO.finditer(sentence_n):
            if nospace(m.group(0)) not in cases:
                drops.append("판례 " + m.group(0))
                return False
        for m in LAW_ARTICLE.finditer(sentence_n):
            art = f"제{m.group(2)}조" + (f"의{m.group(3)}" if m.group(3) else "")
            words = (m.group(1) or "").strip()
            law = None
            if words:
                law = resolve_law(words)
                if law is None:
                    # 정식 이름: 뒤쪽 낱말부터 늘려 가며 검증된 이름과 공백 없이 같은 것
                    parts = words.split()
                    law = next(
                        (
                            "".join(parts[i:])
                            for i in range(len(parts))
                            if "".join(parts[i:]) in full_names
                        ),
                        nospace(words),
                    )
            if law and law.startswith("SAME+"):
                base = state.get("law")
                law = (
                    re.sub(r"(시행령|시행규칙)$", "", base) + law[5:] if base else None
                )
            elif law in (None, "SAME"):
                law = state.get("law")
            elif law not in full_names:
                # 띄어 쓴 정식 이름의 뒷부분만 적은 경우: 4글자 이상이고 검증된 이름 하나에만 들어맞으면 그 법으로 본다
                tails = [f for f in full_names if len(law) >= 4 and f.endswith(law)]
                if len(tails) == 1:
                    law = tails[0]
            if law is None:
                # 이어받을 법령 이름이 없으면, 검증된 근거의 법령이 하나뿐일 때만 그 법으로 본다
                if len(full_names) != 1:
                    drops.append(f"이름 없는 {art}")
                    return False
                law = next(iter(full_names))
            state["law"] = law
            if (law, art) not in ok:
                drops.append(f"{law} {art}")
                return False
        extra = number_tokens(sentence_n) - allowed_nums
        if extra:
            drops.append("숫자 " + ",".join(sorted(extra)))
            return False
        extra_dates = date_tokens(sentence_n) - allowed_dates
        if extra_dates:
            drops.append("날짜 " + ",".join(sorted(extra_dates)))
            return False
        return True

    def short(text):
        """제목·문서 이름·서식 이름: 통과하지 못하면 빈 문자열"""
        return text if keep(text, {}) else ""

    # 법령 이름은 같은 글(절차 전체·문서 전체·확인 목록) 안에서 앞에 나온 것을 이어받는다
    proc_state, doc_state, check_state = {}, {}, {}

    def para(text, state):
        return " ".join(s for s in SENT.split(text) if keep(s, state))

    procedure = []
    for st in guide["procedure"]:
        title = st["title"] if keep(st["title"], proc_state) else ""
        detail = para(st["detail"], proc_state)
        if title and detail:
            procedure.append({**st, "title": title, "detail": detail})
    sections = []
    for sec in guide["document"]["sections"]:
        heading = short(sec["heading"])
        ps = [x for x in (para(p, doc_state) for p in sec["paragraphs"]) if x]
        if heading and ps:
            sections.append({**sec, "heading": heading, "paragraphs": ps})
    name = short(guide["document"]["name"])
    if not name:
        sections = []
    return {
        "procedure": procedure,
        "document": {
            "name": name,
            "basis": short(guide["document"]["basis"]),
            "sections": sections,
        },
        "checklist": [c for c in guide["checklist"] if keep(c, check_state)],
    }


def side_result(r):
    keep = [i for i, p in enumerate(r["answer"]["points"]) if p["check"] == "verified"]
    points = [r["answer"]["points"][i] for i in keep]
    if r.get("mode") != "ai" or len(points) < MIN_POINTS:
        return None
    dropped = len(r["answer"]["points"]) - len(points)
    sources = {p["source"] for p in points}
    out = {
        "outcome": r["outcome"],
        "aiNotice": r["aiNotice"],
        "intent": r["intent"],
        "answer": {"points": points},
        "articles": [{**a, "used": a["id"] in sources} for a in r["articles"]],
        "cases": [{**c, "used": f"case:{c['caseNo']}" in sources} for c in r["cases"]],
        "searches": r["searches"],
        "trace": r.get("trace", []),
        "searchScopeNote": r["searchScopeNote"],
        "recheck": {**r["recheck"], "removed": r["recheck"]["removed"] + dropped},
        "mode": "ai",
    }
    for k in ("section", "relatedSections", "channel"):
        if k in r:
            out[k] = r[k]
    if r.get("deep"):
        new_index = {old: new for new, old in enumerate(keep)}
        out["deep"] = {
            **r["deep"],
            "issues": [
                {
                    "title": i["title"],
                    "points": [new_index[x] for x in i["points"] if x in new_index],
                }
                for i in r["deep"]["issues"]
            ],
        }
    return out


data = json.loads(read(EXAMPLES))
report = []
for ex in data["examples"]:
    path = f"{DIR}/scenarios/{ex['id']}.json"
    if not os.path.exists(path):
        continue
    sc = json.loads(read(path))
    sides = []
    for s in sc["sides"]:
        qid = f"{ex['id']}--{s['key']}"
        out = f"{DIR}/out/{qid}.json"
        if not os.path.exists(out):
            report.append((qid, "no-answer"))
            continue
        g = json.loads(read(out))
        res = side_result(g["result"])
        if not res:
            report.append((qid, "few-verified"))
            continue
        doc = f"{DIR}/docs/{qid}.json"
        guide = None
        if os.path.exists(doc):
            d = json.loads(read(doc))
            drops = []
            g2 = screen_guide(
                {k: d[k] for k in ("procedure", "document", "checklist")},
                res["answer"]["points"],
                g["question"],
                drops,
            )
            if drops:
                report.append((qid, f"guide drops {len(drops)}: {sorted(set(drops))}"))
            if len(g2["procedure"]) >= 3 and g2["document"]["sections"]:
                guide = g2
        sides.append(
            {
                "key": s["key"],
                "label": s["label"],
                "question": s["summary"],
                # 화면의 '자세한 상황'. 사람 이름 없이 역할로만 쓴 가상 사연이라 원문을 보인다 — 서버의 가림은
                # '채권' 같은 낱말을 이름으로 잘못 가려 [이름1]이 남는다 (답변은 가린 글로 만들었다)
                "context": s["context"],
                "result": res,
                "guide": guide,
            }
        )
        report.append(
            (
                qid,
                f"ok points={len(res['answer']['points'])} guide={'y' if guide else 'n'}",
            )
        )
    if not sides:
        continue
    ex["question"] = sides[0]["question"]
    ex["result"] = sides[0]["result"]
    ex.pop("aliases", None)
    ex["sides"] = sides

note = " + 2026-11-25 복잡한 사연 예시 (DEC-059, 쪽별: Opus 5.5 high 사연 → Pro Max DeepSearch 답변, 검증 통과 문단만 · 문서 작성 절차 초안)"
if "2026-11-25 복잡한 사연" not in data["source"]:
    data["source"] += note
io.open(EXAMPLES, "w", encoding="utf-8", newline="\n").write(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n"
)
for r in report:
    print(*r)
print("examples with sides:", sum(1 for e in data["examples"] if e.get("sides")))
print(
    "sides:",
    sum(len(e.get("sides", [])) for e in data["examples"]),
    "with guide:",
    sum(1 for e in data["examples"] for s in e.get("sides", []) if s["guide"]),
)
