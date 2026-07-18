"use client";

import { startTransition, useActionState, useState } from "react";

import type { LotteryApplicantType } from "@/db/schema";
import type { LotteryAct, LotterySlot } from "@/lib/lotteries";

import styles from "../lottery.module.css";
import {
  type LotteryEntryFormState,
  submitLotteryEntriesAction,
} from "./actions";

const INITIAL_STATE: LotteryEntryFormState = {
  error: null,
  success: false,
  savedSlotCount: 0,
};

// Mirrors MAX_CHOICES_PER_SLOT (lib/lotteries.ts); kept local because a value
// import of that module would pull db/schema → drizzle-orm into the client
// bundle.
const RANK_LABELS = ["第1希望", "第2希望", "第3希望"] as const;

type LotteryEntryFormProps = {
  lotteryId: string;
  applicantType: LotteryApplicantType;
  slots: readonly LotterySlot[];
  acts: readonly LotteryAct[];
  // slotId -> saved choices in rank order (compacted, no blanks).
  defaultChoices: Record<string, string[]>;
  // slotId -> saved 観覧人数.
  defaultPartySizes: Record<string, number>;
  // Most people this applicant type may bring (1 hides the selector).
  maxPartySize: number;
  isOpen: boolean;
};

export function LotteryEntryForm({
  lotteryId,
  applicantType,
  slots,
  acts,
  defaultChoices,
  defaultPartySizes,
  maxPartySize,
  isOpen,
}: LotteryEntryFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitLotteryEntriesAction,
    INITIAL_STATE,
  );
  // How many performance slots the SERVER currently holds entries for — what
  // the 申込状況 banner reports. Seeded from the page's server render and
  // advanced only when a submit round-trips successfully, so the banner shows
  // confirmed server state, never an optimistic guess.
  const [savedSlotCount, setSavedSlotCount] = useState(
    () => Object.keys(defaultChoices).length,
  );
  // Adjusted during render (not in an effect) so a fresh success never paints
  // a stale banner frame; the equality guard makes it settle immediately.
  if (state.success && savedSlotCount !== state.savedSlotCount) {
    setSavedSlotCount(state.savedSlotCount);
  }
  // Controlled selects so a class picked at one rank can be disabled at the
  // slot's other ranks. Keyed per slot, always RANK_LABELS.length long,
  // "" = no choice at that rank.
  const [choicesBySlot, setChoicesBySlot] = useState<Record<string, string[]>>(
    () => {
      const initial: Record<string, string[]> = {};
      for (const slot of slots) {
        const saved = defaultChoices[slot.id] ?? [];
        initial[slot.id] = Array.from(
          { length: RANK_LABELS.length },
          (_, rankIndex) => saved[rankIndex] ?? "",
        );
      }
      return initial;
    },
  );
  // 観覧人数 per slot, as select values ("1"/"2").
  const [partyBySlot, setPartyBySlot] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const slot of slots) {
      initial[slot.id] = String(defaultPartySizes[slot.id] ?? 1);
    }
    return initial;
  });

  // React 19 auto-resets a form's DOM fields after a <form action> dispatch.
  // A reset fires no change events, so these controlled selects would show
  // blank (DOM reset to the first option) while state still holds the choices
  // — until the next interaction re-syncs them. Dispatching the action
  // manually from onSubmit skips the auto-reset; the action prop stays on the
  // form as the no-JS fallback.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  function handleChoiceChange(
    slotId: string,
    rankIndex: number,
    value: string,
  ) {
    setChoicesBySlot((previous) => {
      const choices = [...previous[slotId]];
      choices[rankIndex] = value;
      // Blanking a rank blanks everything below it, mirroring how the server
      // compacts gaps — the UI never shows a 3rd choice without a 2nd.
      if (value === "") {
        for (let i = rankIndex + 1; i < choices.length; i++) {
          choices[i] = "";
        }
      }
      return { ...previous, [slotId]: choices };
    });
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="lotteryId" value={lotteryId} />
      <input type="hidden" name="applicantType" value={applicantType} />
      {savedSlotCount > 0 ? (
        <p className={`${styles.submitStatus} ${styles.submitStatusDone}`}>
          申込済み：{savedSlotCount}件の希望がサーバーに保存されています。
          {isOpen && "もう一度送信すると内容は上書きされます。"}
        </p>
      ) : (
        <p className={`${styles.submitStatus} ${styles.submitStatusNone}`}>
          未申込：まだ希望はサーバーに送信されていません。
          {isOpen && "希望を選んで「希望を送信」を押してください。"}
        </p>
      )}
      {slots.map((slot) => {
        const choices = choicesBySlot[slot.id];
        return (
          <fieldset key={slot.id} className={styles.slot}>
            <legend className={styles.slotLegend}>
              <span className={styles.slotLabel}>{slot.label}</span>
              {slot.time !== undefined && (
                <span className={styles.slotTime}>{slot.time}</span>
              )}
            </legend>
            <div className={styles.choiceGrid}>
              {RANK_LABELS.map((rankLabel, rankIndex) => {
                const selectId = `choice-${slot.id}-${rankIndex + 1}`;
                const isLocked = rankIndex > 0 && choices[rankIndex - 1] === "";
                return (
                  <div key={rankLabel} className={styles.choiceField}>
                    <label className={styles.choiceLabel} htmlFor={selectId}>
                      {rankLabel}
                    </label>
                    <select
                      id={selectId}
                      className={styles.select}
                      name={selectId}
                      value={choices[rankIndex]}
                      onChange={(event) =>
                        handleChoiceChange(
                          slot.id,
                          rankIndex,
                          event.target.value,
                        )
                      }
                      disabled={!isOpen || isLocked}
                    >
                      <option value="">
                        {rankIndex === 0 ? "申し込まない" : "指定しない"}
                      </option>
                      {acts.map((act) => (
                        <option
                          key={act.id}
                          value={act.id}
                          disabled={choices.some(
                            (choice, index) =>
                              index !== rankIndex && choice === act.id,
                          )}
                        >
                          {act.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {maxPartySize > 1 && (
              <div className={styles.partyField}>
                <label
                  className={styles.choiceLabel}
                  htmlFor={`party-${slot.id}`}
                >
                  観覧人数
                </label>
                <select
                  id={`party-${slot.id}`}
                  className={styles.select}
                  name={`party-${slot.id}`}
                  value={partyBySlot[slot.id]}
                  onChange={(event) =>
                    setPartyBySlot((previous) => ({
                      ...previous,
                      [slot.id]: event.target.value,
                    }))
                  }
                  // Enabled whenever the window is open (not gated on the
                  // choices): a disabled control is omitted from FormData,
                  // which would strand no-JS users on the 人数 validation.
                  // The server ignores 人数 for slots with no choices.
                  disabled={!isOpen}
                >
                  {Array.from({ length: maxPartySize }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      {index + 1}名
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        );
      })}
      {state.error !== null && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className={styles.success} role="status">
          {state.savedSlotCount > 0
            ? `送信が完了しました。希望をサーバーに保存しました（${state.savedSlotCount}件）。`
            : "希望をすべて取り消しました。"}
        </p>
      )}
      {isOpen && (
        <button className={styles.button} type="submit" disabled={isPending}>
          {isPending ? "送信中…" : "希望を送信"}
        </button>
      )}
    </form>
  );
}
