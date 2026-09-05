"use client";

import { useActionState } from "react";

import {
  claimTicketTransferAction,
  declineTicketTransferAction,
  type TicketTransferInboxState,
} from "./actions";
import styles from "./results.module.css";

const INITIAL_STATE: TicketTransferInboxState = { error: null, success: false };

type TransferInboxItemProps = {
  transferId: number;
  fromUsername: string;
  lotteryTitle: string;
  slotLabel: string;
  slotTime: string | null;
  actLabel: string;
  applicantTypeLabel: string;
  partySize: number;
  // The act on the caller's own seat that would go the other way, when this is
  // a mutual exchange. Non-null turns 受け取る into 交換する, because pressing
  // it moves two seats and the viewer must see that before they do.
  swapActLabel: string | null;
  // Why nothing can be pressed, or null when it can. The server checks the
  // same rules again — this only spares the viewer a pointless round trip.
  blockedReason: string | null;
};

/**
 * One offered seat in 「受け取り待ちのチケット」, with its 受け取る / 辞退する
 * buttons. A client component per offer so each keeps its own pending and
 * error state; both actions refresh the page, so a resolved offer simply
 * drops out of the list.
 *
 * When the offer is one half of a mutual exchange the same claim button reads
 * 交換する and spells out both seats — the action behind it is unchanged, it is
 * the server that notices the pair and moves both.
 */
export function TransferInboxItem({
  transferId,
  fromUsername,
  lotteryTitle,
  slotLabel,
  slotTime,
  actLabel,
  applicantTypeLabel,
  partySize,
  swapActLabel,
  blockedReason,
}: TransferInboxItemProps) {
  const [claimState, claimAction, isClaiming] = useActionState(
    claimTicketTransferAction,
    INITIAL_STATE,
  );
  const [declineState, declineAction, isDeclining] = useActionState(
    declineTicketTransferAction,
    INITIAL_STATE,
  );
  const isBusy = isClaiming || isDeclining;

  return (
    <li className={styles.offer}>
      <span className={styles.offerFrom}>{fromUsername} さんから</span>
      <span className={styles.offerSlot}>
        {lotteryTitle} ／ {slotLabel}
        {slotTime !== null && (
          <span className={styles.seatTime}>{slotTime}</span>
        )}
      </span>
      <span className={styles.seatAct}>{actLabel}</span>
      <span className={styles.seatMeta}>
        観覧人数 {partySize}名 ／ {applicantTypeLabel}
      </span>
      {swapActLabel !== null && (
        <p className={styles.offerSwap}>
          あなたの「{swapActLabel}」と交換します。
          「交換する」を押すと、2枚のチケットが同時に入れ替わります。
        </p>
      )}
      {blockedReason !== null && (
        <p className={styles.offerBlocked}>{blockedReason}</p>
      )}
      <div className={styles.offerActions}>
        <form action={claimAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <button
            className={styles.button}
            type="submit"
            disabled={isBusy || blockedReason !== null}
          >
            {isClaiming
              ? swapActLabel === null
                ? "受け取り中…"
                : "交換中…"
              : swapActLabel === null
                ? "受け取る"
                : "交換する"}
          </button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <button
            className={styles.buttonSecondary}
            type="submit"
            disabled={isBusy}
          >
            {isDeclining ? "辞退中…" : "辞退する"}
          </button>
        </form>
      </div>
      {claimState.error !== null && (
        <p className={styles.error} role="alert">
          {claimState.error}
        </p>
      )}
      {declineState.error !== null && (
        <p className={styles.error} role="alert">
          {declineState.error}
        </p>
      )}
    </li>
  );
}
