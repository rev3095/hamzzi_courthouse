// 서식 작성 E2E (DEC-022·025): 설문 팝업 → 완성 → 직접 수정 → 저장 → HWPX·DOCX·PDF 내려받기, 예시 답변 타임라인의 단계별 서식 연결.
// 게이트가 닫혀 있어 관리자 미리보기(DEC-024)로 연다 — E2E_ADMIN_PASSCODE(서버의 ADMIN_PASSCODE와 같은 값)가 없으면 건너뛴다.
// Claude 호출 없음(초안 도우미는 부르지 않는다). 내려받은 파일은 E2E_DOC_DIR에 남겨 따로 열어 볼 수 있다.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { demoExamples } from "../../lib/demo/policy";
import { DOCUMENT_KINDS, DOCUMENT_SPECS, isActive, type Field } from "../../lib/documents/policy";

const PASS = process.env.E2E_ADMIN_PASSCODE;
const OUT = process.env.E2E_DOC_DIR;
const EDIT_MARK = "수정확인 문단끝";
const NEW_PARAGRAPH = "새로 넣은 문단 확인";
const FORMATS = [
  ["한글 (HWPX)", "hwpx"],
  ["워드 (DOCX)", "docx"],
  ["PDF", "pdf"],
] as const;

/** 칸 종류별 가상 입력값 (실명·실주소 없음) */
function sample(f: Field, i: number): string {
  switch (f.type) {
    case "text":
      return `가상${i + 1} ${f.label}`
        .replace(/[()·/%]/g, " ")
        .slice(0, Math.min(f.max, 24))
        .trim();
    case "textarea":
      return `가상 내용 ${i + 1}번 첫 줄입니다.\n가상 내용 ${i + 1}번 둘째 줄입니다.`;
    case "date":
      return "2026-03-02";
    case "money":
      return String(1_230_000 + i * 1000);
    case "rate":
      return "5";
    case "choice":
      return f.defaultValue ?? f.options![0].value;
    case "checks":
      return f.defaultValue ?? f.options![0].value;
  }
}

async function fillField(box: Locator, f: Field, value: string) {
  if (f.type === "choice" || f.type === "checks") {
    for (const v of value.split(",")) {
      const label = f.options!.find((o) => o.value === v)!.label;
      await box.getByLabel(label, { exact: true }).check();
    }
    return;
  }
  await box.locator("input, textarea").fill(value);
}

let context: BrowserContext;
let page: Page;
const report: Record<string, unknown>[] = [];

test.describe("서식 작성 (관리자 미리보기)", () => {
  test.skip(!PASS, "E2E_ADMIN_PASSCODE가 없어 건너뜀");

  test.beforeAll(async ({ browser }) => {
    // 로그인은 1시간 5번까지라, 한 번 받은 관리자 쿠키를 실패 뒤 다시 뜬 작업자도 이어 쓴다
    const state = path.join(tmpdir(), "hz-e2e-admin-state.json");
    const fresh = existsSync(state) && Date.now() - statSync(state).mtimeMs < 30 * 60_000;
    context = await browser.newContext({
      acceptDownloads: true,
      storageState: fresh ? state : undefined,
    });
    page = await context.newPage();
    if (!fresh) {
      const res = await context.request.post("/api/v1/admin/session", { data: { passcode: PASS } });
      expect(res.status(), "관리자 로그인").toBe(200);
      await context.storageState({ path: state });
    }
  });
  test.afterAll(async () => {
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      for (const r of report) {
        const name = String(r.kind ?? "timeline");
        writeFileSync(path.join(OUT, `report-${name}.json`), JSON.stringify(r, null, 1));
      }
    }
    await context.close();
  });

  for (const kind of DOCUMENT_KINDS) {
    test(`DEC-025 ${kind}: 설문 → 완성 → 수정 → 저장 → 3형식 내보내기`, async () => {
      test.setTimeout(120_000);
      const spec = DOCUMENT_SPECS[kind];
      // 서버로 나가는 본문에 입력값이 실리지 않는지 본다 (F-007)
      const posted: string[] = [];
      page.on("request", (r) => {
        if (r.method() !== "GET") posted.push(`${r.method()} ${new URL(r.url()).pathname}`);
      });

      await page.goto(`/documents/${kind}`);
      await expect(page.getByText("관리자 미리보기")).toBeVisible();
      await page.getByRole("button", { name: "서식 작성 시작" }).click();
      const dialog = page.getByRole("dialog", { name: `${spec.title} 작성` });

      const values: Record<string, string> = {};
      for (const f of spec.fields) if (f.defaultValue) values[f.key] = f.defaultValue;
      for (const [p, pg] of spec.pages.entries()) {
        await expect(
          dialog.getByText(`${spec.title} · ${p + 1} / ${spec.pages.length}`),
        ).toBeVisible();
        const fields = pg.fields.map((k) => spec.fields.find((f) => f.key === k)!);
        for (const f of fields) {
          // 앞 칸의 답에 따라 나타나는 칸은 그때 화면에 생긴다
          if (!isActive(f, values)) continue;
          const shown = fields.filter((x) => isActive(x, values));
          const box = dialog.locator("div.flex.flex-col.gap-5 > *").nth(shown.indexOf(f));
          await expect(box).toContainText(f.label);
          const v = sample(f, spec.fields.indexOf(f));
          await fillField(box, f, v);
          values[f.key] = v;
        }
        await dialog
          .getByRole("button", { name: p === spec.pages.length - 1 ? "문서 완성하기" : "다음" })
          .click();
      }

      // 완성 → 내보내기 확인 팝업
      const confirm = page.getByRole("dialog", { name: "내보내기 확인" });
      await expect(confirm.getByText("입력하신 내용대로 문서를 완성했어요")).toBeVisible();
      await confirm.getByRole("button", { name: "아니요, 직접 수정할게요" }).click();

      // 편집기: 글이 있는 문단 하나를 고치고, 새 문단을 넣는다
      const paras = page.locator('textarea[aria-label$="번째 문단"]');
      const count = await paras.count();
      expect(count).toBeGreaterThan(5);
      const texts = await paras.evaluateAll((els) =>
        els.map((e) => (e as HTMLTextAreaElement).value),
      );
      // 입력한 글 칸이 문서에 들어갔는지 (빠진 칸은 보고서에 남긴다)
      const whole = texts.join("\n");
      const missing = spec.fields
        .filter((f) => (f.type === "text" || f.type === "textarea") && values[f.key])
        .filter((f) => !whole.includes(values[f.key].split("\n")[0]))
        .map((f) => `${f.key}(${f.label})`);

      const target = texts.findIndex((t, i) => i > 2 && t.length > 8);
      await paras.nth(target).fill(`${texts[target]} ${EDIT_MARK}`);
      await page.getByRole("button", { name: "아래에 새 문단" }).click();
      await paras.nth(target + 1).fill(NEW_PARAGRAPH);
      await page.getByRole("button", { name: "가운데" }).click();
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await expect(confirm.getByText("고친 내용을 저장했어요")).toBeVisible();

      const files: Record<string, { name: string; bytes: number }> = {};
      for (const [label, ext] of FORMATS) {
        if (!(await confirm.isVisible())) {
          await page.getByRole("button", { name: "내보내기", exact: true }).click();
        }
        await confirm.getByText(label, { exact: true }).click();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          confirm.getByRole("button", { name: "예, 내보낼게요" }).click(),
        ]);
        const name = download.suggestedFilename();
        expect(name.endsWith(`.${ext}`)).toBe(true);
        await expect(page.getByRole("status").filter({ hasText: name })).toBeVisible();
        const saved = OUT ? path.join(OUT, `${kind}.${ext}`) : await download.path();
        if (OUT) await download.saveAs(saved);
        files[ext] = { name, bytes: statSync(saved).size };
        expect(files[ext].bytes).toBeGreaterThan(500);
      }
      // 화면의 문서에도 고친 내용이 남아 있다
      await expect(page.getByText(NEW_PARAGRAPH)).toBeVisible();
      await expect(page.getByText(EDIT_MARK)).toBeVisible();
      // 문서 내용은 서버로 가지 않는다
      expect(posted).toEqual([]);

      report.push({
        kind,
        title: spec.title,
        pages: spec.pages.length,
        fields: Object.keys(values).length,
        paragraphs: count,
        missing,
        files,
        expect: [EDIT_MARK, NEW_PARAGRAPH, texts[target].slice(0, 12)],
      });
    });
  }

  test("DEC-021·025 예시 답변 타임라인: 단계마다 팝업이 열리고 서식 작성 화면으로 이어진다", async () => {
    test.setTimeout(240_000);
    const timeline: Record<string, unknown>[] = [];
    for (const ex of demoExamples()) {
      await page.goto(ex.href);
      const list = page.getByRole("list", { name: "절차 단계" });
      if (!(await list.count())) {
        timeline.push({ example: ex.id, steps: 0 });
        continue;
      }
      const head = await page
        .getByRole("heading", { name: "절차 타임라인" })
        .locator("..")
        .innerText();
      const nodes = list.locator(":scope > li");
      const total = await nodes.count();
      const steps: Record<string, unknown>[] = [];
      for (let i = 0; i < total; i++) {
        const li = nodes.nth(i);
        const node = li.locator(":scope > button");
        const label = (await node.innerText()).replace(/\s+/g, " ").trim();
        // 키보드 포커스로 연다 (앞 단계 팝업이 노드를 가려도 열린다)
        await node.focus();
        const pop = li.getByRole("group");
        await expect(pop).toBeVisible();
        await expect(pop.getByText("준비할 것")).toBeVisible();
        await expect(pop.getByText("주의할 점")).toBeVisible();
        const links = await pop
          .locator('a[target="_blank"]')
          .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
        const doc = pop.getByRole("link", { name: /이 단계 서식 작성하기/ });
        let document: string | null = null;
        if (await doc.count()) {
          document = (await doc.getAttribute("href"))!;
          await doc.click();
          await page.waitForURL(`**${document}`);
          // 그 단계의 서식 작성 화면이 열리고 설문을 시작할 수 있다
          const kind = document.split("/").pop()!;
          expect(DOCUMENT_KINDS as readonly string[]).toContain(kind);
          await expect(
            page.getByRole("heading", {
              level: 1,
              name: `${DOCUMENT_SPECS[kind as (typeof DOCUMENT_KINDS)[number]].title} 작성`,
            }),
          ).toBeVisible();
          await expect(page.getByRole("button", { name: "서식 작성 시작" })).toBeVisible();
          await page.goto(ex.href);
          await expect(list).toBeVisible();
        } else {
          await page.keyboard.press("Escape");
          await expect(pop).toBeHidden();
        }
        steps.push({ label, document, links });
      }
      timeline.push({ example: ex.id, head: head.replace(/\s+/g, " ").slice(0, 60), steps });
    }
    report.push({ timeline });
    // 서식이 달린 단계가 실제로 있다
    expect(JSON.stringify(timeline)).toContain("/documents/");
  });
});

test("DEC-022 게이트가 닫힌 일반 화면: 서식마다 안내와 공식 서식 링크만 보인다", async ({
  page: p,
}) => {
  for (const kind of DOCUMENT_KINDS) {
    await p.goto(`/documents/${kind}`);
    await expect(p.getByText("법률 검토 후 열릴 기능이에요").first()).toBeVisible();
    await expect(p.getByRole("button", { name: "서식 작성 시작" })).toHaveCount(0);
    for (const f of DOCUMENT_SPECS[kind].officialForms) {
      await expect(p.getByRole("link", { name: f.name }).first()).toHaveAttribute("href", f.url);
    }
  }
});
