"use server";

import { refresh } from "next/cache";

import { claimTicketTransfer } from "@/db/claimTicketTransfer";
import { getIncomingTicketTransfers } from "@/db/getIncomingTicketTransfers";
import { resolveTicketTransfer } from "@/db/resolveTicketTransfer";
import { hasAnyRole, INTERNAL_ROLES } from "@/lib/access";
import {
  areLotteryResultsAnnounced,
  describeTicketTransferBlock,
  getLottery,
} from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseRowId } from "@/lib/row-id";
import { getCurrentUser } from "@/lib/session";

/**
 * 受け取り待ちのチケット — the recipient's half of a 譲渡, invoked from the
 * inbox at the top of /lottery/results.
 *
 * Both actions authorize from the session and match the offer on
 * `to_username`, so a guessed transfer id belonging to someone else touches
 * nothing. The page's own "受け取れません" reasons are a courtesy; the rules
 * are enforced again here.
 */

const WRITE_MAX_ATTEMPTS = 20;
const WRITE_RATE_WINDOW_MS = 60_000;

const SESSION_EXPIRED = "セッションが無効です。再度ログインしてください。";
const TRANSFER_MISSING =
  "この譲渡申請は見つかりません。既に取り消された可能性があります。";
const RATE_LIMITED =
  "試行回数が多すぎます。しばらくしてからもう一度お試しください。";
const SAVE_FAILED = "処理に失敗しました。時間をおいてもう一度お試しください。";

export type TicketTransferInboxState = {
  error: string | null;
  success: boolean;
};

// Shared preamble: session, a well-formed transfer id, and the per-account
// write throttle.
async function authorizeInboxAction(
  formData: FormData,
): Promise<{ username: string; transferId: number } | { error: string }> {
  // Identity is not authorization: /lottery/results is gated
  // `AuthGuard role={INTERNAL_ROLES}` and these actions are independently
  // invocable, so they re-derive that gate instead of inheriting it.
  const user = await getCurrentUser();
  if (user === null || !hasAnyRole(user, INTERNAL_ROLES)) {
    return { error: SESSION_EXPIRED };
  }

  const transferId = parseRowId(formData.get("transferId"));
  if (transferId === null) return { error: TRANSFER_MISSING };

  const attempt = checkRateLimit(
    `ticket-write:${user.username}`,
    WRITE_MAX_ATTEMPTS,
    WRITE_RATE_WINDOW_MS,
  );
  if (!attempt.ok) return { error: RATE_LIMITED };

  return { username: user.username, transferId };
}

/**
 * 受け取る — take an offered seat. The conflict rule ("already hold a seat
 * for that performance in the same 区分") and the row's actual move both live
 * in claimTicketTransfer, inside one locked transaction; the deadline is
 * config, so it is checked here.
 */
export async function claimTicketTransferAction(
  _prevState: TicketTransferInboxState,
  formData: FormData,
): Promise<TicketTransferInboxState> {
  const authorized = await authorizeInboxAction(formData);
  if ("error" in authorized) {
    return { error: authorized.error, success: false };
  }

  // Re-read the offer as the recipient sees it, so the seat's performance —
  // and therefore its transfer deadline — comes from the database rather than
  // from the form.
  const now = new Date();
  const transfers = await getIncomingTicketTransfers(authorized.username);
  const offer = transfers.find(
    (transfer) => transfer.id === authorized.transferId,
  );
  if (offer === undefined) return { error: TRANSFER_MISSING, success: false };

  const lottery = getLottery(offer.ticket.lotteryId);
  if (lottery === null || !areLotteryResultsAnnounced(lottery, now)) {
    return { error: TRANSFER_MISSING, success: false };
  }
  // The same rules the sender's page enforced, re-checked against the seat as
  // stored: a 保護者 seat never changes hands, and no seat does once its
  // performance is about to start.
  const transferBlock = describeTicketTransferBlock(lottery, offer.ticket, now);
  if (transferBlock !== null) {
    return { error: transferBlock, success: false };
  }

  let result;
  try {
    result = await claimTicketTransfer(
      authorized.transferId,
      authorized.username,
    );
  } catch (error) {
    console.error("[lottery] failed to claim ticket transfer", error);
    return { error: SAVE_FAILED, success: false };
  }

  if (!result.ok) {
    return {
      error:
        result.reason === "conflict"
          ? "同じ公演のチケットを既にお持ちのため、このチケットは受け取れません。"
          : TRANSFER_MISSING,
      success: false,
    };
  }

  refresh();
  return { error: null, success: true };
}

/** 辞退する — turn an offer down, handing the seat back to its sender. */
export async function declineTicketTransferAction(
  _prevState: TicketTransferInboxState,
  formData: FormData,
): Promise<TicketTransferInboxState> {
  const authorized = await authorizeInboxAction(formData);
  if ("error" in authorized) {
    return { error: authorized.error, success: false };
  }

  // No deadline check: declining only ever un-promises a seat, and refusing
  // to let someone clear a stale offer would just leave it in their inbox.
  let hasDeclined: boolean;
  try {
    hasDeclined = await resolveTicketTransfer(
      authorized.transferId,
      authorized.username,
      "declined",
    );
  } catch (error) {
    console.error("[lottery] failed to decline ticket transfer", error);
    return { error: SAVE_FAILED, success: false };
  }
  if (!hasDeclined) return { error: TRANSFER_MISSING, success: false };

  refresh();
  return { error: null, success: true };
}
