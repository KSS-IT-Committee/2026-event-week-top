"use client";

import { useActionState, useState } from "react";

import { discardTicketAction, type TicketActionState } from "./actions";
import styles from "./ticket.module.css";

const INITIAL_STATE: TicketActionState = { error: null, success: false };

type DiscardPanelProps = {
  ticketId: number;
};

/**
 * チケットを破棄する — give the seat up entirely.
 *
 * Two steps, and the warning lives on the second one: 破棄 deletes the row
 * outright, so there is no undo and no committee screen that can put it back.
 * On success the action redirects to /lottery/results, because the page this
 * was pressed on no longer has a ticket to show.
 */
export function DiscardPanel({ ticketId }: DiscardPanelProps) {
  const [state, formAction, isPending] = useActionState(
    discardTicketAction,
    INITIAL_STATE,
  );
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>チケットの破棄</h2>
      <p className={styles.note}>
        観覧しないことが決まっている場合は、チケットを破棄できます。空いた席は当日のキャンセル待ち列から補填されます。
      </p>
      {!isConfirming ? (
        <button
          className={styles.buttonDanger}
          type="button"
          onClick={() => setIsConfirming(true)}
        >
          このチケットを破棄する
        </button>
      ) : (
        <>
          <p className={styles.caution} role="alert">
            警告：破棄すると、このチケットは即座に削除されます。元に戻す方法はなく、この席を取り戻すことはできません。本当に破棄しますか？
          </p>
          <div className={styles.buttonRow}>
            <form action={formAction}>
              <input type="hidden" name="ticketId" value={ticketId} />
              <button
                className={styles.buttonDanger}
                type="submit"
                disabled={isPending}
              >
                {isPending ? "破棄中…" : "本当に破棄する"}
              </button>
            </form>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
            >
              やめる
            </button>
          </div>
        </>
      )}
      {state.error !== null && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}
