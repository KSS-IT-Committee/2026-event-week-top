"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { createTicketTransfer } from "@/db/createTicketTransfer";
import { deleteLotteryTicket } from "@/db/deleteLotteryTicket";
import { getLotteryTicket } from "@/db/getLotteryTicket";
import type { LotteryTicket } from "@/db/getLotteryTickets";
import { getUserByUsername } from "@/db/getUserByUsername";
import { resolveTicketTransfer } from "@/db/resolveTicketTransfer";
import { hasAnyRole, INTERNAL_ROLES } from "@/lib/access";
import {
  areLotteryResultsAnnounced,
  describeTicketTransferBlock,
  getLottery,
  type Lottery,
} from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseRowId } from "@/lib/row-id";
import { getCurrentUser } from "@/lib/session";

/**
 * 当選チケットの譲渡・破棄 — the actions behind /lottery/results/[ticketId].
 *
 * Every one of them re-derives the caller from the session and re-reads the
 * ticket scoped to that caller, because a Server Action is independently
 * invocable: the page's own checks protect nothing here. The ticket id in the
 * form is therefore only ever a lookup key, never a claim of ownership.
 */

// Looking a recipient up answers "does this account exist?", so it is the one
// action worth throttling on its own: a fast loop over 1A01…6D40 would
// otherwise enumerate the roster. Generous enough that a person correcting a
// typo never notices.
const LOOKUP_MAX_ATTEMPTS = 30;
const LOOKUP_RATE_WINDOW_MS = 60_000;

// Writes are cheap, so this is an abuse guard, not a quota. Keyed by username
// like every other limit in this app (the school shares one NAT).
const WRITE_MAX_ATTEMPTS = 20;
const WRITE_RATE_WINDOW_MS = 60_000;

const SESSION_EXPIRED = "セッションが無効です。再度ログインしてください。";
const TICKET_MISSING =
  "チケットが見つかりません。既に譲渡・破棄された可能性があります。";
const RATE_LIMITED =
  "試行回数が多すぎます。しばらくしてからもう一度お試しください。";
const SAVE_FAILED = "処理に失敗しました。時間をおいてもう一度お試しください。";

export type TransferRecipientState = {
  error: string | null;
  // The username the check confirmed, echoed back so the form can require a
  // successful check for exactly the name still in the box.
  verifiedUsername: string | null;
};

export type TicketActionState = {
  error: string | null;
  success: boolean;
};

type OwnedTicket = {
  ticket: LotteryTicket;
  lottery: Lottery;
  username: string;
};

/**
 * Resolve the caller's own ticket out of a submitted form, or the message to
 * show instead. Ownership is part of the lookup (getLotteryTicket), and an
 * unannounced lottery is treated as no ticket at all — the seat is not public
 * yet, so it cannot be given away or thrown out either.
 */
async function loadOwnedTicket(
  formData: FormData,
  now: Date,
): Promise<OwnedTicket | { error: string }> {
  const user = await getCurrentUser();
  if (user === null) return { error: SESSION_EXPIRED };

  const ticketId = parseRowId(formData.get("ticketId"));
  if (ticketId === null) return { error: TICKET_MISSING };

  const ticket = await getLotteryTicket(ticketId, user.username);
  if (ticket === null) return { error: TICKET_MISSING };

  const lottery = getLottery(ticket.lotteryId);
  if (lottery === null || !areLotteryResultsAnnounced(lottery, now)) {
    return { error: TICKET_MISSING };
  }

  return { ticket, lottery, username: user.username };
}

/**
 * 譲渡できるか確認する — does this username belong to a school account other
 * than the caller's?
 *
 * Deliberately says nothing about what the recipient already holds. Whether
 * they can actually take THIS seat is decided on their own screen, where the
 * answer is about their own tickets; reporting it here would turn the box
 * into a lookup for other people's lottery results.
 */
export async function verifyTransferRecipientAction(
  _prevState: TransferRecipientState,
  formData: FormData,
): Promise<TransferRecipientState> {
  const now = new Date();
  const owned = await loadOwnedTicket(formData, now);
  if ("error" in owned) {
    return { error: owned.error, verifiedUsername: null };
  }

  const transferBlock = describeTicketTransferBlock(
    owned.lottery,
    owned.ticket,
    now,
  );
  if (transferBlock !== null) {
    return { error: transferBlock, verifiedUsername: null };
  }

  const attempt = checkRateLimit(
    `ticket-lookup:${owned.username}`,
    LOOKUP_MAX_ATTEMPTS,
    LOOKUP_RATE_WINDOW_MS,
  );
  if (!attempt.ok) return { error: RATE_LIMITED, verifiedUsername: null };

  const recipientValue = formData.get("recipient");
  const recipient =
    typeof recipientValue === "string" ? recipientValue.trim() : "";
  if (recipient === "") {
    return {
      error: "譲渡先のユーザー名を入力してください。",
      verifiedUsername: null,
    };
  }
  if (recipient === owned.username) {
    return {
      error: "自分自身に譲渡することはできません。",
      verifiedUsername: null,
    };
  }

  const user = await getUserByUsername(recipient);
  // Same answer for "no such account" and "an account with no school roles"
  // (a committee-only or service account): both are accounts this ticket must
  // not be handed to, and telling them apart would leak which is which.
  if (user === null || !hasAnyRole(user, INTERNAL_ROLES)) {
    return {
      error:
        "そのユーザー名のアカウントは見つかりません。大文字・小文字を含めて、ログイン時のユーザー名を正確に入力してください。",
      verifiedUsername: null,
    };
  }

  return { error: null, verifiedUsername: user.username };
}

/**
 * 譲渡する — offer the seat. The seat does NOT move here: it stays the
 * sender's until the recipient claims it, so a ticket is never in limbo and
 * an unanswered offer can simply be cancelled.
 */
export async function offerTicketTransferAction(
  _prevState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const now = new Date();
  const owned = await loadOwnedTicket(formData, now);
  if ("error" in owned) return { error: owned.error, success: false };

  const transferBlock = describeTicketTransferBlock(
    owned.lottery,
    owned.ticket,
    now,
  );
  if (transferBlock !== null) {
    return { error: transferBlock, success: false };
  }

  const attempt = checkRateLimit(
    `ticket-write:${owned.username}`,
    WRITE_MAX_ATTEMPTS,
    WRITE_RATE_WINDOW_MS,
  );
  if (!attempt.ok) return { error: RATE_LIMITED, success: false };

  // The recipient is re-validated here, not trusted from the check step: the
  // form could be submitted with a different name than the one confirmed.
  const recipientValue = formData.get("recipient");
  const recipient =
    typeof recipientValue === "string" ? recipientValue.trim() : "";
  if (recipient === "" || recipient === owned.username) {
    return { error: "譲渡先のユーザー名が正しくありません。", success: false };
  }
  const user = await getUserByUsername(recipient);
  if (user === null || !hasAnyRole(user, INTERNAL_ROLES)) {
    return {
      error: "そのユーザー名のアカウントは見つかりません。",
      success: false,
    };
  }

  let result;
  try {
    result = await createTicketTransfer(
      owned.ticket.id,
      owned.username,
      user.username,
    );
  } catch (error) {
    console.error("[lottery] failed to create ticket transfer", error);
    return { error: SAVE_FAILED, success: false };
  }

  if (!result.ok) {
    return {
      error:
        result.reason === "already-pending"
          ? "このチケットは既に譲渡申請中です。先に申請を取り消してください。"
          : TICKET_MISSING,
      success: false,
    };
  }

  refresh();
  return { error: null, success: true };
}

/** 譲渡を取り消す — withdraw an offer the recipient has not claimed yet. */
export async function cancelTicketTransferAction(
  _prevState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const user = await getCurrentUser();
  if (user === null) return { error: SESSION_EXPIRED, success: false };

  const transferId = parseRowId(formData.get("transferId"));
  if (transferId === null) {
    return { error: "この譲渡申請は見つかりません。", success: false };
  }

  const attempt = checkRateLimit(
    `ticket-write:${user.username}`,
    WRITE_MAX_ATTEMPTS,
    WRITE_RATE_WINDOW_MS,
  );
  if (!attempt.ok) return { error: RATE_LIMITED, success: false };

  // No ticket lookup: resolveTicketTransfer matches on from_username, so the
  // caller can only ever cancel an offer they made. Cancelling stays possible
  // after the performance has started — it only ever un-promises a seat.
  let hasCancelled: boolean;
  try {
    hasCancelled = await resolveTicketTransfer(
      transferId,
      user.username,
      "cancelled",
    );
  } catch (error) {
    console.error("[lottery] failed to cancel ticket transfer", error);
    return { error: SAVE_FAILED, success: false };
  }
  if (!hasCancelled) {
    return {
      error: "この譲渡申請は既に受け取られたか、取り消されています。",
      success: false,
    };
  }

  refresh();
  return { error: null, success: true };
}

/**
 * 破棄する — delete the seat outright. Irreversible by design: the page says
 * so before this ever runs, and the empty seat is refilled from the day's
 * キャンセル待ち列 rather than by anything in the database.
 */
export async function discardTicketAction(
  _prevState: TicketActionState,
  formData: FormData,
): Promise<TicketActionState> {
  const now = new Date();
  const owned = await loadOwnedTicket(formData, now);
  if ("error" in owned) return { error: owned.error, success: false };

  const attempt = checkRateLimit(
    `ticket-write:${owned.username}`,
    WRITE_MAX_ATTEMPTS,
    WRITE_RATE_WINDOW_MS,
  );
  if (!attempt.ok) return { error: RATE_LIMITED, success: false };

  // Deliberately not gated on describeTicketTransferBlock: 破棄 is open to
  // every seat, including the 保護者 ones that can never be transferred and
  // those whose performance has started. Throwing away a seat you cannot use
  // harms nobody, and refusing would only leave dead rows behind.
  let hasDeleted: boolean;
  try {
    hasDeleted = await deleteLotteryTicket(owned.ticket.id, owned.username);
  } catch (error) {
    console.error("[lottery] failed to discard ticket", error);
    return { error: SAVE_FAILED, success: false };
  }
  if (!hasDeleted) return { error: TICKET_MISSING, success: false };

  // The ticket page this was submitted from no longer has anything to show.
  redirect("/lottery/results");
}
