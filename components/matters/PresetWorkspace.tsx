"use client";
// 가상 사건 프리셋 (DEC-061): 로그인하지 않은 사람에게 '사건 분석' 기능을 미리 채운 가상 사건으로 보여 준다.
// 목록에서 하나를 고르면 내 사건과 같은 판(MatterBoard)으로 열리고, 고친 내용은 이 화면 메모리에만 둔다(서버에 저장하지 않음).
// AI 기능 버튼은 서버가 로그인을 요구해 "로그인이 필요해요"로 끝난다 — 판례 검색처럼 로그인이 필요 없는 기능은 그대로 쓴다.
import { useState, type ReactNode } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { createMatter, type LoadedMatter } from "@/lib/client/matters";
import type { MatterData } from "@/lib/matters/model";
import { MATTER_PRESETS, PRESET_NOTICE } from "@/lib/matters/presets";
import { GoogleLoginButton } from "../LimitNotice";
import { MatterBoard } from "./MatterBoard";
import { MatterCard, SectionTitle, btn } from "./ui";

export function PresetWorkspace({
  signedIn = false,
  home,
  onImported,
}: {
  signedIn?: boolean;
  /** 사건을 열지 않았을 때 가상 사건 목록 위에 보이는 것 (화면 머리·내 사건 목록) */
  home?: ReactNode;
  /** 내 사건으로 가져온 뒤 (로그인 화면은 그 사건을 바로 연다) */
  onImported?: (matter: LoadedMatter) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // 고친 내용은 프리셋별로 이 화면 메모리에만 둔다
  const [edits, setEdits] = useState<Record<string, MatterData>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const preset = MATTER_PRESETS.find((p) => p.id === openId);

  if (!preset) {
    return (
      <div>
        {home}
        <section aria-label="가상 사건" className="mt-8">
          <SectionTitle
            title="가상 사건으로 둘러보기"
            hint={
              signedIn
                ? "지어낸 사건으로 기능을 먼저 살펴보고, 마음에 들면 내 사건으로 가져올 수 있어요."
                : "지어낸 사건으로 기능을 먼저 살펴볼 수 있어요. 로그인하면 내 사건을 만들어 저장해요."
            }
            right={
              signedIn ? null : (
                <div className="w-full sm:w-auto">
                  <GoogleLoginButton next="/matters" />
                </div>
              )
            }
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="preset-list">
            {MATTER_PRESETS.map((p) => (
              <li key={p.id}>
                <MatterCard
                  title={p.title}
                  counts={{
                    docs: p.data.docs.length,
                    parties: p.data.parties.length,
                    issues: p.data.issues.length,
                    notes: p.data.notes.length,
                  }}
                  onClick={() => {
                    setOpenId(p.id);
                    setFailed(null);
                    setDone(null);
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const data = edits[preset.id] ?? preset.data;
  const update = (fn: (d: MatterData) => MatterData) =>
    setEdits((e) => ({ ...e, [preset.id]: fn(e[preset.id] ?? preset.data) }));

  return (
    <MatterBoard
      key={preset.id}
      id={preset.id}
      title={preset.title}
      data={data}
      update={update}
      onBack={() => setOpenId(null)}
      banner={
        <section
          aria-label="가상 사건 안내"
          className="border-line mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border bg-white px-4 py-3"
        >
          <div className="min-w-0 flex-1 basis-[320px]">
            <p className="text-muted text-[13px] leading-relaxed">{PRESET_NOTICE}</p>
            <p className="text-muted mt-0.5 text-[12px]">{AI_NOTICE}</p>
          </div>
          {signedIn ? (
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                className={btn}
                onClick={async () => {
                  setFailed(null);
                  const r = await createMatter(preset.title, data);
                  if (!r.ok) {
                    return setFailed(
                      "담지 못했어요. 사건 수 한도를 확인하거나 잠시 뒤 다시 해 주세요.",
                    );
                  }
                  setDone("내 사건 목록에 담았어요. 사건 목록에서 이어서 정리할 수 있어요.");
                  onImported?.(r.data);
                }}
              >
                내 사건으로 가져오기
              </button>
              {(failed ?? done) && (
                <p role="status" className="text-muted text-[12px]">
                  {failed ?? done}
                </p>
              )}
            </div>
          ) : (
            <div className="w-full sm:w-auto">
              <GoogleLoginButton next="/matters" />
            </div>
          )}
        </section>
      }
    />
  );
}
