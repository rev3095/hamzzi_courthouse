// 사건 진행(F-016, DEC-053)·서류 분석(F-015)의 Claude 실호출 시험 — **유료**. 사용자 허락을 받은 뒤 한 번만 돌린다 (절대 규칙 8).
// 실행 (작업 폴더에 .env.local이 없으면 HZ_ENV_FILE로 그 파일 위치를 알려 준다):
//   ALLOW_PAID_API=1 MATTER_LIVE=company COMPANY_NAME="회사 이름" [COMPANY_URLS="주소1 주소2"] pnpm exec vitest run -c vitest.live.config.ts tests/live/matter.live.test.ts
//   ALLOW_PAID_API=1 MATTER_LIVE=read CASEFILE_DIR=<서류 사진 폴더> pnpm exec vitest run -c vitest.live.config.ts tests/live/matter.live.test.ts
// - company: 기업 조사 1회 (기본 Opus 5.5 + 웹 검색·웹 가져오기, 건당 상한 없음. COMPANY_MODEL_ID로 모델을 바꿔 비교). 공개된 회사 정보만 다룬다.
// - read: 폴더의 사진(5장까지)을 서류 분석(F-015)과 사건 진행(F-016) 판독으로 한 번씩 읽는다 (Haiku 비전, 상한 합계 약 $0.013).
//   실제 서류는 저장소 밖(evals/labels/community/, gitignore)에 두고, 결과도 화면에만 찍는다 — 파일로 남기지 않는다.
//   판독 결과에는 서류의 이름이 들어 있을 수 있어 개수·비용·문장 수만 찍고, 내용은 MATTER_LIVE_SHOW=1일 때만 찍는다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mode = process.env.MATTER_LIVE ?? "";
const paid = !!process.env.ANTHROPIC_API_KEY;
const show = process.env.MATTER_LIVE_SHOW === "1";

describe.skipIf(!paid || mode !== "company")("기업 조사 실호출 (F-016 AC4, 유료)", () => {
  test("회사 이름과 링크로 공개 자료를 찾아 정리하고 상한 안에서 끝난다", async () => {
    const { COMPANY_MODEL, researchCompany } = await import("@/lib/ai/company");
    const name = process.env.COMPANY_NAME ?? "";
    expect(name.length).toBeGreaterThan(1);
    const { isKnownUnreadable } = await import("@/lib/matters/policy");
    const given = (process.env.COMPANY_URLS ?? "").split(/\s+/).filter(Boolean);
    // 라우트와 같게: 읽을 수 없는 것으로 알려진 링크는 도구에 넘기지 않는다
    const urls = given.filter((u) => !isKnownUnreadable(u));
    const skipped = given.filter(isKnownUnreadable);
    const started = Date.now();
    const out = await researchCompany(
      { name, urls, pastedMasked: "", snippets: [], skipped },
      { modelId: process.env.COMPANY_MODEL_ID },
    );
    console.log(
      JSON.stringify(
        {
          ok: out.ok,
          seconds: Math.round((Date.now() - started) / 1000),
          costUsd: Number(out.costUsd.toFixed(4)),
          model: process.env.COMPANY_MODEL_ID ?? COMPANY_MODEL,
          unread: out.unread,
          ...(out.ok
            ? { read: out.sources, found: out.found.map((f) => f.url), report: out.report }
            : { reason: out.reason, detail: out.detail }),
        },
        null,
        1,
      ),
    );
    expect(out.ok).toBe(true);
  });
});

describe.skipIf(!paid || mode !== "read")("서류 사진 판독 실호출 (F-015·F-016 AC2, 유료)", () => {
  test("Haiku가 사진만으로 서류를 읽는다", async () => {
    const dir = process.env.CASEFILE_DIR ?? "";
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .slice(0, 5);
    expect(files.length).toBeGreaterThan(0);
    // 브라우저가 하는 것처럼 긴 변 2000px JPEG로 줄인다 (sharp가 없으면 원본 그대로)
    // sharp는 직접 의존성이 아니라 있을 때만 쓴다 (이름을 변수로 두어 타입·번들 해석에서 뺀다)
    type Resizer = (input: Buffer) => {
      rotate(): ReturnType<Resizer>;
      resize(o: object): ReturnType<Resizer>;
      jpeg(o: object): ReturnType<Resizer>;
      toBuffer(): Promise<Buffer>;
    };
    const lib = "sharp";
    const sharp: Resizer | null = await import(/* @vite-ignore */ lib)
      .then((m: { default: Resizer }) => m.default)
      .catch(() => null);
    const images = [];
    for (const f of files) {
      const raw = fs.readFileSync(path.join(dir, f));
      const buf = sharp
        ? await sharp(raw)
            .rotate()
            .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer()
        : raw;
      const mediaType =
        sharp || /\.jpe?g$/i.test(f)
          ? "image/jpeg"
          : /\.png$/i.test(f)
            ? "image/png"
            : "image/webp";
      images.push({ mediaType: mediaType as "image/jpeg", data: buf.toString("base64") });
    }
    console.log(
      JSON.stringify({
        files: files.length,
        resized: !!sharp,
        kb: images.map((i) => Math.round((i.data.length * 0.75) / 1024)),
      }),
    );

    const { readCaseFiles } = await import("@/lib/ai/casefile");
    const a = await readCaseFiles({ images, question: "" });
    console.log(
      JSON.stringify(
        {
          feature: "F-015 서류 분석",
          ok: a.ok,
          costUsd: Number(a.costUsd.toFixed(5)),
          ...(a.ok
            ? {
                docTypes: a.reading.docTypes,
                summaryChars: a.reading.summary.length,
                claims: a.reading.claims.length,
                parties: a.reading.parties.map(
                  (p) => `${p.role}/${p.side}/${p.kind}/${p.name ? "이름 있음" : "이름 없음"}`,
                ),
                masked: a.findings,
                dropped: a.dropped,
                ...(show && { reading: a.reading }),
              }
            : { reason: a.reason }),
        },
        null,
        1,
      ),
    );

    const { readMatterDocs } = await import("@/lib/ai/matter");
    const b = await readMatterDocs({ images });
    console.log(
      JSON.stringify(
        {
          feature: "F-016 사건 진행",
          ok: b.ok,
          costUsd: Number(b.costUsd.toFixed(5)),
          ...(b.ok
            ? {
                doc: {
                  type: b.reading.doc.type,
                  hasTitle: !!b.reading.doc.title,
                  date: b.reading.doc.date,
                },
                parties: b.reading.parties.length,
                kinds: b.reading.parties.map((p) => `${p.kind}/${p.side}`),
                relations: b.reading.relations.length,
                facts: b.reading.facts.length,
                factDates: b.reading.facts.map((f) => f.when),
                demands: b.reading.demands.map((d) => d.due),
                clauses: b.reading.clauses.length,
                ...(show && { reading: b.reading }),
              }
            : { reason: b.reason }),
        },
        null,
        1,
      ),
    );
    expect(a.ok || b.ok).toBe(true);
  });
});
