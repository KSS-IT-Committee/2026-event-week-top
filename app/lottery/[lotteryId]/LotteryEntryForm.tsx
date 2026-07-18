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

// The whole form as select values, used both as live state and as the
// server-saved baseline that unsent edits are detected against.
type FormSnapshot = {
  // slotId -> choices, always RANK_LABELS.length long, "" = no choice.
  choices: Record<string, string[]>;
  // slotId -> 観覧人数 as a select value ("1"/"2").
  party: Record<string, string>;
};

function buildChoicesBySlot(
  slots: readonly LotterySlot[],
  defaultChoices: Record<string, string[]>,
): Record<string, string[]> {
  const choices: Record<string, string[]> = {};
  for (const slot of slots) {
    const saved = defaultChoices[slot.id] ?? [];
    choices[slot.id] = Array.from(
      { length: RANK_LABELS.length },
      (_, rankIndex) => saved[rankIndex] ?? "",
    );
  }
  return choices;
}

function buildPartyBySlot(
  slots: readonly LotterySlot[],
  defaultPartySizes: Record<string, number>,
): Record<string, string> {
  const party: Record<string, string> = {};
  for (const slot of slots) {
    party[slot.id] = String(defaultPartySizes[slot.id] ?? 1);
  }
  return party;
}

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
    () => buildChoicesBySlot(slots, defaultChoices),
  );
  // 観覧人数 per slot, as select values ("1"/"2").
  const [partyBySlot, setPartyBySlot] = useState<Record<string, string>>(() =>
    buildPartyBySlot(slots, defaultPartySizes),
  );
  // What the SERVER currently holds, as select values — the baseline the
  // live selects are compared against so the 申込状況 banner can flip to
  // "未送信の変更あり" the moment an edit diverges from it. Advanced only
  // when a submit round-trips successfully.
  const [savedForm, setSavedForm] = useState<FormSnapshot>(() => ({
    choices: buildChoicesBySlot(slots, defaultChoices),
    party: buildPartyBySlot(slots, defaultPartySizes),
  }));
  // The values captured at dispatch time. On success the server saved exactly
  // this snapshot — NOT the live selects, which the user may have edited while
  // the submit was in flight — so this is what gets promoted into savedForm.
  const [submittedForm, setSubmittedForm] = useState<FormSnapshot | null>(null);
  // useActionState returns a new state object per completed dispatch, so a
  // reference change is the "a submit just finished" signal. Same
  // render-phase-adjustment pattern as savedSlotCount above.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.success && submittedForm !== null) {
      setSavedForm(submittedForm);
      setSubmittedForm(null);
    }
  }
  // A slot's 観覧人数 is ignored server-side while the slot has no choices,
  // so a party-size edit alone on a choice-less slot is not an unsent change.
  const hasUnsentChanges = slots.some((slot) => {
    const choices = choicesBySlot[slot.id];
    const saved = savedForm.choices[slot.id];
    if (choices.some((choice, rankIndex) => choice !== saved[rankIndex])) {
      return true;
    }
    return (
      choices[0] !== "" && partyBySlot[slot.id] !== savedForm.party[slot.id]
    );
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
    setSubmittedForm({ choices: choicesBySlot, party: partyBySlot });
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
      {hasUnsentChanges ? (
        <p className={`${styles.submitStatus} ${styles.submitStatusDirty}`}>
          未送信の変更あり：画面で選択した内容はまだサーバーに保存されていません。「希望を送信」を押して保存してください。
        </p>
      ) : savedSlotCount > 0 ? (
        <p className={`${styles.submitStatus} ${styles.submitStatusDone}`}>
          申込済み：{savedSlotCount}件の希望がサーバーに保存されています。
          {isOpen &&
            "申込み内容を変更したい場合は、再度希望を選択し直し、「希望を送信」を押してください。なお、入力内容の変更は、申込期限まで何度でも可能です。"}
        </p>
      ) : (
        <p className={`${styles.submitStatus} ${styles.submitStatusNone}`}>
          未申込：まだ希望はサーバーに送信されていない、もしくは希望がない状態として保存されています。
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
      {state.success && !hasUnsentChanges && (
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
