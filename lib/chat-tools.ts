import "server-only";

import { type FunctionDeclaration, Type } from "@google/genai";

import { getNews } from "@/app/news/newsData";
import { getAnnouncements } from "@/db/getAnnouncements";
import { getDeductions } from "@/db/getDeductions";
import { getEquipmentAvailability } from "@/db/getEquipmentAvailability";
import { type ClassName } from "@/db/schema";

/**
 * Read-only tools the chat assistant can call to ground answers in live data.
 * Each declaration maps to a DB query (or the static news feed) in dispatchTool.
 * Everything here is read-only by design — there are no mutation tools — so the
 * model can never change `appdata`.
 *
 * Class-private data (deductions, announcements) is scoped to the caller's own
 * class server-side, from the authenticated session — NOT from a model-supplied
 * argument. The model is never given a class parameter for these, so neither the
 * model nor a prompt-injected user can widen the scope to another class.
 */

// The viewer's identity, derived from the session (never from the model).
export type ChatViewer = {
  // The logged-in student's class, or null for non-students (teachers /
  // committee / admin). Class-private tools return nothing when this is null.
  className: ClassName | null;
  // The session's authorization roles (lib/access.ts) — get_recent_news
  // filters role-restricted posts with them, exactly like the news pages.
  roles: string[];
};

export const chatToolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_announcements",
    description:
      "Get announcements (伝達) relevant to the current user — those targeting " +
      "their class plus general announcements — newest first. Results are " +
      "automatically scoped to the logged-in user's class.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_equipment_availability",
    description:
      "Get equipment (備品) stock and how many of each are currently available " +
      "to borrow. Optionally filter by a name substring (Japanese or English).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Case-insensitive substring of the equipment name.",
        },
      },
    },
  },
  {
    name: "get_deductions",
    description:
      "Get the deduction (減点) records for the logged-in user's own class, " +
      "newest first. Only student accounts have a class; for anyone else this " +
      "returns nothing. There is no way to query another class.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_recent_news",
    description:
      "Get the latest news/announcement posts shown on the site, newest first.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: "How many news items to return (default 5, max 20).",
        },
      },
    },
  },
];

function readString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Execute a tool call by name and return a plain object suitable for a Gemini
 * functionResponse. Class-private tools are scoped to `viewer.className` (the
 * authenticated session's class), ignoring any model-supplied arguments.
 * Unknown tools and unavailable data return a benign object (never throw), so
 * the model can explain the situation within the same turn.
 */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  viewer: ChatViewer,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "get_announcements": {
      if (viewer.className === null) {
        return {
          announcements: [],
          note: "Announcements are scoped to a student's class; this account has no class.",
        };
      }
      const announcements = await getAnnouncements(viewer.className);
      return { announcements };
    }
    case "get_equipment_availability": {
      const equipment = await getEquipmentAvailability(
        readString(args, "name"),
      );
      return { equipment };
    }
    case "get_deductions": {
      if (viewer.className === null) {
        return {
          deductions: [],
          note: "Deductions are only available to student accounts, scoped to their own class.",
        };
      }
      const deductions = await getDeductions(viewer.className);
      return { deductions };
    }
    case "get_recent_news": {
      const rawLimit = args.limit;
      const limit =
        typeof rawLimit === "number" && Number.isFinite(rawLimit)
          ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20)
          : 5;
      const news = getNews(viewer)
        .slice(0, limit)
        .map((item) => ({
          title: item.title,
          date: item.date,
          tag: item.tag,
          // Trim long bodies to keep tool output token-cheap.
          content:
            item.content.length > 800
              ? `${item.content.slice(0, 800)}…`
              : item.content,
        }));
      return { news };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
