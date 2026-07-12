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
  isOpen: boolean;
};

export function LotteryEntryForm({
  lotteryId,
  applicantType,
  slots,
  acts,
  defaultChoices,
  isOpen,
}: LotteryEntryFormProps) {
  const [state, formAction, isPending] = useActionState(
    submitLotteryEntriesAction,
    INITIAL_STATE,
  );
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
      {slots.map((slot) => {
        const choices = choicesBySlot[slot.id];
        return (
          <fieldset key={slot.id} className={styles.slot}>
            <legend className={styles.slotLegend}>
              <span className={styles.slotLabel}>{slot.label}</span>
              <span className={styles.slotTime}>{slot.time}</span>
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
            ? `希望を保存しました（${state.savedSlotCount}公演分）。`
            : "希望をすべて取り消しました。"}
        </p>
      )}
      {isOpen && (
        <button className={styles.button} type="submit" disabled={isPending}>
          {isPending ? "保存中…" : "希望を保存"}
        </button>
      )}
    </form>
  );
}
