"use client";

import { startTransition, useActionState, useState } from "react";

import {
  cancelTicketTransferAction,
  offerTicketTransferAction,
  type TicketActionState,
  type TransferRecipientState,
  verifyTransferRecipientAction,
} from "./actions";
import styles from "./ticket.module.css";

const INITIAL_RECIPIENT_STATE: TransferRecipientState = {
  error: null,
  verifiedUsername: null,
};
const INITIAL_ACTION_STATE: TicketActionState = { error: null, success: false };

type TransferPanelProps = {
  ticketId: number;
  // The offer outstanding on this ticket, if any — a ticket can only be
  // promised to one person at a time, so this is a single offer, not a list.
  pendingTransferId: number | null;
  pendingToUsername: string | null;
  // Why this seat cannot be handed over (保護者 seats never can; no seat can
  // once its performance is about to start), or null when it can. Rendered as
  // given — the wording lives in lib/lotteries so both ends of a transfer
  // explain the rule identically.
  transferBlockReason: string | null;
  // 「2026年9月12日（土）08:35」 — the last moment it can be handed over.
  transferDeadline: string | null;
};

/**
 * 他人にチケットを譲渡する — the sender's half of a 譲渡.
 *
 * Three steps on purpose: type a username, have the server confirm the
 * account exists, then send the offer. The confirmation is pinned to the name
 * that was checked (`isVerified` below), so editing the box after a
 * successful check disarms 譲渡する rather than silently sending the ticket
 * to a different account.
 */
export function TransferPanel({
  ticketId,
  pendingTransferId,
  pendingToUsername,
  transferBlockReason,
  transferDeadline,
}: TransferPanelProps) {
  const [verifyState, verifyAction, isVerifying] = useActionState(
    verifyTransferRecipientAction,
    INITIAL_RECIPIENT_STATE,
  );
  const [offerState, offerAction, isOffering] = useActionState(
    offerTicketTransferAction,
    INITIAL_ACTION_STATE,
  );
  const [cancelState, cancelAction, isCancelling] = useActionState(
    cancelTicketTransferAction,
    INITIAL_ACTION_STATE,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [recipient, setRecipient] = useState("");

  // A sent offer collapses the form. Adjusted during render (not in an
  // effect) so the panel never paints one frame of the form over an offer
  // that already exists; the guard makes it settle immediately.
  if (pendingTransferId !== null && isFormOpen) {
    setIsFormOpen(false);
  }

  // The check answers for one exact username. Any edit to the box — even
  // whitespace the server would trim — invalidates it.
  const isVerified =
    verifyState.verifiedUsername !== null &&
    verifyState.verifiedUsername === recipient.trim();

  // React 19 resets a form's DOM fields after a <form action> dispatch, and a
  // reset fires no change event — the controlled input would blank while
  // state still held the name. Dispatching manually skips that; the action
  // prop stays on the form as the no-JS fallback.
  function handleVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      verifyAction(formData);
    });
  }

  if (pendingTransferId !== null) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>チケットの譲渡</h2>
        <p className={styles.pendingNotice}>
          {pendingToUsername}{" "}
          さんへの譲渡を申請中です。相手が「受け取る」を押すと譲渡が完了し、このチケットはあなたのものではなくなります。
        </p>
        <p className={styles.note}>
          まだ受け取られていない間は、いつでも取り消せます。
        </p>
        <form action={cancelAction}>
          <input type="hidden" name="transferId" value={pendingTransferId} />
          <button
            className={styles.buttonSecondary}
            type="submit"
            disabled={isCancelling}
          >
            {isCancelling ? "取り消し中…" : "譲渡を取り消す"}
          </button>
        </form>
        {cancelState.error !== null && (
          <p className={styles.error} role="alert">
            {cancelState.error}
          </p>
        )}
      </section>
    );
  }

  if (transferBlockReason !== null) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>チケットの譲渡</h2>
        <p className={styles.closedNotice}>{transferBlockReason}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>チケットの譲渡</h2>
      <p className={styles.note}>
        このチケットを、他の生徒・教職員のアカウントに譲ることができます。
        相手が「受け取る」を押すまで、チケットはあなたのものです。
        {transferDeadline !== null && `（${transferDeadline}まで）`}
      </p>
      {!isFormOpen ? (
        <button
          className={styles.button}
          type="button"
          onClick={() => setIsFormOpen(true)}
        >
          他人にチケットを譲渡する
        </button>
      ) : (
        <>
          <form
            action={verifyAction}
            onSubmit={handleVerifySubmit}
            className={styles.form}
          >
            <input type="hidden" name="ticketId" value={ticketId} />
            <label className={styles.label} htmlFor="transfer-recipient">
              譲渡先のユーザー名
            </label>
            <input
              id="transfer-recipient"
              className={styles.input}
              name="recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="例：4D11"
            />
            <p className={styles.hint}>
              相手がログインに使うユーザー名を、大文字・小文字も含めて正確に入力してください。
            </p>
            <button
              className={styles.buttonSecondary}
              type="submit"
              disabled={isVerifying}
            >
              {isVerifying ? "確認中…" : "譲渡できるか確認する"}
            </button>
          </form>
          {verifyState.error !== null && (
            <p className={styles.error} role="alert">
              {verifyState.error}
            </p>
          )}
          {isVerified && (
            <p className={styles.success} role="status">
              {verifyState.verifiedUsername}{" "}
              さんのアカウントを確認しました。「譲渡する」を押すと、相手に受け取り待ちのチケットとして届きます。
            </p>
          )}
          <form action={offerAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="recipient" value={recipient.trim()} />
            <button
              className={styles.button}
              type="submit"
              disabled={!isVerified || isOffering}
            >
              {isOffering ? "送信中…" : "譲渡する"}
            </button>
          </form>
          {offerState.error !== null && (
            <p className={styles.error} role="alert">
              {offerState.error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
