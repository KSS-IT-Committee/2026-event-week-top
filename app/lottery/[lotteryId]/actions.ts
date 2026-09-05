"use server";

import { addLotteryEntries } from "@/db/addLotteryEntries";
import { deleteLotteryEntries } from "@/db/deleteLotteryEntries";
import { ensurePreviewUser } from "@/db/ensurePreviewUser";
import { isLotteryApplicantType } from "@/db/schema";
import { db } from "@/lib/db";
import {
  canApplyToLottery,
  getLottery,
  getLotteryAvailability,
  MAX_CHOICES_PER_SLOT,
  MAX_PARTY_SIZE_BY_APPLICANT_TYPE,
  parseLotteryEntries,
} from "@/lib/lotteries";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

export type LotteryEntryFormState = {
  error: string | null;
  success: boolean;
  // How many performance slots the accepted submission covers (0 = the
  // applicant cleared their entries). Only meaningful when success is true.
  savedSlotCount: number;
};

// Per-account submit throttle. Saves are cheap upserts, so this is only an
// abuse guard; keyed by username, not IP (the school shares one NAT), like
// the /login throttles. Per-process only (see lib/rate-limit.ts).
const SUBMIT_MAX_ATTEMPTS = 15;
const SUBMIT_RATE_WINDOW_MS = 60_000;

/**
 * Save (replace) the caller's preferences for one lottery + applicant type.
 * Reads `choice-<slotId>-<rank>` selects off the form, one entry row per
 * slot that has at least one choice. A submission with no choices at all
 * clears the caller's saved entries — that is how you withdraw.
 */
export async function submitLotteryEntriesAction(
  _prevState: LotteryEntryFormState,
  formData: FormData,
): Promise<LotteryEntryFormState> {
  // Self-authorize from the session, NOT from form input: a Server Action is
  // independently invocable, and entries must always belong to the caller's
  // own account (see changePasswordAction for the same rule).
  const user = await getCurrentUser();
  if (user === null) {
    return {
      error: "セッションが無効です。再度ログインしてください。",
      success: false,
      savedSlotCount: 0,
    };
  }

  const lotteryIdValue = formData.get("lotteryId");
  const lottery =
    typeof lotteryIdValue === "string" ? getLottery(lotteryIdValue) : null;
  if (lottery === null) {
    return {
      error: "対象の抽選が見つかりません。",
      success: false,
      savedSlotCount: 0,
    };
  }

  const applicantTypeValue = formData.get("applicantType");
  if (
    typeof applicantTypeValue !== "string" ||
    !isLotteryApplicantType(applicantTypeValue)
  ) {
    return {
      error: "申込者の区分が正しくありません。",
      success: false,
      savedSlotCount: 0,
    };
  }
  const applicantType = applicantTypeValue;

  // Eligibility is re-checked here (not only in the page) because the action
  // is directly invocable: the account's role-derived class must belong to
  // the lottery and the applicant type must be offered by it.
  if (!canApplyToLottery(lottery, user.roles, applicantType)) {
    return {
      error: "このアカウントではこの抽選に申し込めません。",
      success: false,
      savedSlotCount: 0,
    };
  }

  if (getLotteryAvailability(lottery, new Date()) !== "open") {
    return {
      error: "現在は申込期間外です。",
      success: false,
      savedSlotCount: 0,
    };
  }

  const attempt = checkRateLimit(
    `lottery:${user.username}`,
    SUBMIT_MAX_ATTEMPTS,
    SUBMIT_RATE_WINDOW_MS,
  );
  if (!attempt.ok) {
    return {
      error: "試行回数が多すぎます。しばらくしてからもう一度お試しください。",
      success: false,
      savedSlotCount: 0,
    };
  }

  // Read the ranks for every slot the lottery defines — never the other way
  // round (unknown form fields are simply ignored). The 観覧人数 field only
  // exists for applicant types allowed more than one person; everyone else
  // is pinned to 1 regardless of what the request claims.
  const maxPartySize = MAX_PARTY_SIZE_BY_APPLICANT_TYPE[applicantType];
  const submissions = lottery.slots.map((slot) => {
    const partyValue =
      maxPartySize > 1 ? formData.get(`party-${slot.id}`) : "1";
    return {
      slotId: slot.id,
      choices: Array.from({ length: MAX_CHOICES_PER_SLOT }, (_, rankIndex) => {
        const value = formData.get(`choice-${slot.id}-${rankIndex + 1}`);
        return typeof value === "string" ? value.trim() : "";
      }),
      partySize: typeof partyValue === "string" ? partyValue.trim() : "",
    };
  });

  const parsed = parseLotteryEntries(lottery, submissions, maxPartySize);
  if (!parsed.ok) {
    return { error: parsed.error, success: false, savedSlotCount: 0 };
  }

  // Replace the previous submission wholesale, atomically: slots the
  // applicant blanked out must lose their old rows too, and a failure midway
  // must never leave a half-applied mix of old and new preferences.
  try {
    await db.transaction(async (tx) => {
      // Backstop for a preview clone the deploy infra has not seeded the
      // roster into: stub the session-vouched account so the entries'
      // username FK passes (no-op outside previews).
      await ensurePreviewUser(user.username, tx);
      await deleteLotteryEntries(user.username, lottery.id, applicantType, tx);
      await addLotteryEntries(
        parsed.entries.map((entry) => ({
          lotteryId: lottery.id,
          slotId: entry.slotId,
          username: user.username,
          applicantType,
          firstChoice: entry.firstChoice,
          secondChoice: entry.secondChoice,
          thirdChoice: entry.thirdChoice,
          partySize: entry.partySize,
        })),
        tx,
      );
    });
  } catch (error) {
    // Plausible on a concurrent double-submit (unique-constraint race) or a
    // DB outage. The client gets a short retry note; the cause stays in the
    // server logs so a persistent outage is distinguishable from a race.
    console.error("[lottery] failed to save entries", error);
    return {
      error: "保存に失敗しました。時間をおいてもう一度お試しください。",
      success: false,
      savedSlotCount: 0,
    };
  }

  return { error: null, success: true, savedSlotCount: parsed.entries.length };
}
