import "server-only";

import { type FunctionDeclaration, Type } from "@google/genai";

import { getNews } from "@/app/news/newsData";
import { getAnnouncements } from "@/db/getAnnouncements";
import { getDeductions } from "@/db/getDeductions";
import { getEquipmentAvailability } from "@/db/getEquipmentAvailability";
import { CLASSNAMES, isClassName } from "@/db/schema";

/**
 * Read-only tools the chat assistant can call to ground answers in live data.
 * Each declaration maps to a DB query (or the static news feed) in `dispatch`.
 * Everything here is read-only by design — there are no mutation tools — so the
 * model can never change `appdata`.
 */

const CLASS_DESCRIPTION = `Class identifier, one of: ${CLASSNAMES.join(", ")} (grade 1-6 + section A-D).`;

export const chatToolDeclarations: FunctionDeclaration[] = [
  {
    name: "get_announcements",
    description:
      "Get recent announcements (伝達) for the festivals, newest first. " +
      "Optionally filter to announcements targeting a specific class.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        class_name: { type: Type.STRING, description: CLASS_DESCRIPTION },
      },
    },
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
      "Get recent deduction (減点) records, newest first. Optionally filter to " +
      "a specific class. Use this for questions about points lost or penalties.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        class_name: { type: Type.STRING, description: CLASS_DESCRIPTION },
      },
    },
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

function readClassName(args: Record<string, unknown>) {
  const raw = readString(args, "class_name");
  if (raw === undefined) return { ok: true as const, value: undefined };
  if (!isClassName(raw)) {
    return {
      ok: false as const,
      error: `Unknown class "${raw}". Valid classes are ${CLASSNAMES.join(", ")}.`,
    };
  }
  return { ok: true as const, value: raw };
}

/**
 * Execute a tool call by name and return a plain object suitable for a Gemini
 * functionResponse. Unknown tools and bad arguments return an `{ error }`
 * object rather than throwing, so the model can recover within the same turn.
 */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "get_announcements": {
      const cls = readClassName(args);
      if (!cls.ok) return { error: cls.error };
      const announcements = await getAnnouncements(cls.value);
      return { announcements };
    }
    case "get_equipment_availability": {
      const equipment = await getEquipmentAvailability(
        readString(args, "name"),
      );
      return { equipment };
    }
    case "get_deductions": {
      const cls = readClassName(args);
      if (!cls.ok) return { error: cls.error };
      const deductions = await getDeductions(cls.value);
      return { deductions };
    }
    case "get_recent_news": {
      const rawLimit = args.limit;
      const limit =
        typeof rawLimit === "number" && Number.isFinite(rawLimit)
          ? Math.min(Math.max(Math.trunc(rawLimit), 1), 20)
          : 5;
      const news = getNews()
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
