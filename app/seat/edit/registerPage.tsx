"use client";

import { startTransition, useActionState, useState } from "react";

import { CLASSNAMES, performanceEnum } from "@/db/schema";

import { type SeatRegistrationState, submitSeatAction } from "./actions";
import styles from "./edit.module.css";

const SEAT_COUNT_BY_ROW = [
  12, 16, 26, 26, 26, 32, 32, 32, 26, 26, 26, 26, 34, 34, 34, 34, 34, 34, 34,
  34, 34, 34, 34,
] as const;

const INITIAL_STATE: SeatRegistrationState = {
  error: null,
  success: false,
};

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(
    submitSeatAction,
    INITIAL_STATE,
  );
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedNumber, setSelectedNumber] = useState("");
  const [selectedPerformance, setSelectedPerformance] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedSeat, setSelectedSeat] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  const selectedColumnIndex = Number(selectedColumn);
  const seatCount = Number.isInteger(selectedColumnIndex)
    ? SEAT_COUNT_BY_ROW[selectedColumnIndex]
    : 0;

  return (
    <div className={styles.registerPage}>
      <h2 className={styles.registerPageTitle}>指定して登録</h2>
      <form
        action={formAction}
        className={styles.registerForm}
        onSubmit={handleSubmit}
      >
        <div className={styles.idFormGroup}>
          <div className={styles.classForm}>
            <label htmlFor="class" className={styles.classFormLabel}>
              クラス:
            </label>
            <select
              id="class"
              name="class"
              className={styles.formSelect}
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              required
            >
              <option value="" disabled>
                クラスを選択
              </option>
              {CLASSNAMES.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.numberForm}>
            <label htmlFor="number" className={styles.numberFormLabel}>
              出席番号:
            </label>
            <input
              id="number"
              type="number"
              name="number"
              placeholder="出席番号を入力"
              className={styles.formInput}
              min="1"
              max="40"
              style={{ width: 200 }}
              value={selectedNumber}
              onChange={(event) => setSelectedNumber(event.target.value)}
              required
            />
          </div>
        </div>
        <div className={styles.idFormGroup}>
          <label htmlFor="performance" className={styles.performanceFormLabel}>
            公演:
          </label>
          <select
            id="performance"
            name="performance"
            className={styles.formSelect}
            value={selectedPerformance}
            onChange={(event) => setSelectedPerformance(event.target.value)}
            required
          >
            <option value="" disabled>
              公演を選択
            </option>
            {performanceEnum.enumValues.map((performance) => (
              <option key={performance} value={performance}>
                {performance}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.idFormGroup}>
          <div className={styles.columnForm}>
            <label htmlFor="column" className={styles.columnFormLabel}>
              座席　列:
            </label>
            <select
              id="column"
              name="column"
              className={styles.formSelect}
              value={selectedColumn}
              onChange={(event) => {
                setSelectedColumn(event.target.value);
                setSelectedSeat("");
              }}
              required
            >
              <option value="" disabled>
                列を選択
              </option>
              {Array.from({ length: 23 }, (_, i) => (
                <option key={i + 1} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.seatForm}>
            <label htmlFor="seat" className={styles.seatFormLabel}>
              番号:
            </label>
            <select
              id="seat"
              name="seat"
              className={styles.formSelect}
              value={selectedSeat}
              onChange={(event) => setSelectedSeat(event.target.value)}
              disabled={selectedColumn === ""}
              required
            >
              <option value="" disabled>
                番号を選択
              </option>
              {Array.from({ length: seatCount }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className={styles.submitButton}
          type="submit"
          disabled={isPending}
        >
          {isPending ? "登録中…" : "登録"}
        </button>
        {state.error !== null && (
          <p className={styles.formStatus} role="alert">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className={styles.formStatus} role="status">
            座席を登録しました。
          </p>
        )}
      </form>
      <div className={styles.registerPageNote}>
        <h3 className={styles.noteTitle}>座席登録について</h3>
        <p className={styles.noteText}>
          このページは芸能祭委員会用の座席登録ページです。
          <br />
          座席登録は、クラス・出席番号・公演・座席の列・座席番号を指定して行います。
          <br />
          現在、この登録ページと、確認ページのみが利用可能です。委員会向けの登録済み座席や各生徒の登録情報一覧ページは今後公開されます。{" "}
          <br />
          現在他人に登録された座席は委員会側でも確認できませんので、間違えたと思われる場合は、再度正しい情報を登録すれば更新されます。
          <br />
          席番号が登録されていないなどのバグがありましたらIT委員会までご連絡ください。
          <br />
        </p>
      </div>
    </div>
  );
}
