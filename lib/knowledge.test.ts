import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { embedText } from "@/lib/gemini";
import realIndex from "@/lib/knowledge.generated.json";

// The module under test embeds the query via embedText (mocked) and then does a
// pure, in-process cosine (dot-product) scan over a statically-imported JSON
// index. No real network / Gemini call ever happens here.
vi.mock("@/lib/gemini", () => ({ embedText: vi.fn() }));

type RealChunk = {
  id: string;
  source: string;
  title: string;
  context?: string;
  embedding: number[];
};

type RealIndex = {
  model: string;
  dimension: number;
  chunkCount: number;
  chunks: RealChunk[];
};

const index = realIndex as RealIndex;

// ---------------------------------------------------------------------------
// Approach 1 — integration against the REAL committed index.
//
// Deterministic via self-similarity: feeding back chunk[0]'s own stored
// (L2-normalized) embedding as the "query vector" makes that chunk score
// cos === dot === 1.0, so it must be the top hit.
// ---------------------------------------------------------------------------
describe("retrieveKnowledge — real index (self-similarity)", () => {
  beforeEach(() => {
    if (index.chunks.length === 0) return;
    vi.mocked(embedText).mockResolvedValue(index.chunks[0].embedding);
  });

  it.skipIf(index.chunks.length === 0)(
    "returns the queried chunk as the top hit with score ~1.0",
    async () => {
      const { retrieveKnowledge } = await import("@/lib/knowledge");
      const c0 = index.chunks[0];

      const results = await retrieveKnowledge("q");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(c0.id);
      expect(results[0].score).toBeCloseTo(1, 5);
    },
  );

  it.skipIf(index.chunks.length === 0)(
    "embeds the query with the index's model/dimension as a RETRIEVAL_QUERY",
    async () => {
      const { retrieveKnowledge } = await import("@/lib/knowledge");

      await retrieveKnowledge("q");

      expect(embedText).toHaveBeenCalledTimes(1);
      expect(embedText).toHaveBeenCalledWith(
        "q",
        "RETRIEVAL_QUERY",
        index.dimension,
        index.model,
      );
    },
  );

  it.skipIf(index.chunks.length === 0)(
    "honors topK by returning at most that many chunks",
    async () => {
      const { retrieveKnowledge } = await import("@/lib/knowledge");

      const results = await retrieveKnowledge("q", 1);

      expect(results.length).toBeLessThanOrEqual(1);
    },
  );

  it.skipIf(index.chunks.length === 0)(
    "returns [] when the query is orthogonal to every stored vector",
    async () => {
      // A zero vector has dot product 0 with everything → below every floor.
      vi.mocked(embedText).mockResolvedValue(
        new Array(index.dimension).fill(0),
      );
      const { retrieveKnowledge } = await import("@/lib/knowledge");

      const results = await retrieveKnowledge("q");

      expect(results).toEqual([]);
    },
  );

  it.skipIf(index.chunks.length === 0)(
    "shapes each result as { id, source, title, text, score }",
    async () => {
      const { retrieveKnowledge } = await import("@/lib/knowledge");

      const results = await retrieveKnowledge("q");

      expect(results[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          source: expect.any(String),
          title: expect.any(String),
          text: expect.any(String),
          score: expect.any(Number),
        }),
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Approach 2 — synthetic 3-dim index for full branch coverage.
//
// knowledge.generated.json is a *static* import inside lib/knowledge.ts, so we
// cannot use the hoisted vi.mock for it (the assigned embedText mock above is
// fine because it's a real dependency module). Instead we reset the module
// registry, doMock both the JSON and gemini, then dynamically import a fresh
// copy of lib/knowledge whose `index` closes over our synthetic data.
//
// The source imports the JSON via the RELATIVE specifier
// `./knowledge.generated.json`; we key the doMock by that specifier (and also
// the `@/` alias form, belt-and-suspenders) so the mock intercepts it.
// ---------------------------------------------------------------------------

type SyntheticChunk = {
  kind?: "text" | "pdf";
  id: string;
  source: string;
  title: string;
  text: string;
  context?: string;
  embedding: number[];
};

type SyntheticIndex = {
  model: string;
  dimension: number;
  chunkCount: number;
  chunks: SyntheticChunk[];
};

function chunk(
  id: string,
  embedding: number[],
  kind?: "text" | "pdf",
): SyntheticChunk {
  return {
    ...(kind ? { kind } : {}),
    id,
    source: `${id}-source`,
    title: `${id}-title`,
    text: `${id}-text`,
    embedding,
  };
}

function makeIndex(chunks: SyntheticChunk[]): SyntheticIndex {
  return {
    model: "m",
    dimension: 3,
    chunkCount: chunks.length,
    chunks,
  };
}

async function loadWith(
  indexObj: SyntheticIndex,
  queryVec: number[],
): Promise<{
  retrieveKnowledge: typeof import("@/lib/knowledge").retrieveKnowledge;
  listKnowledgeSources: typeof import("@/lib/knowledge").listKnowledgeSources;
  embed: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const factory = () => ({ default: indexObj });
  vi.doMock("./knowledge.generated.json", factory);
  vi.doMock("@/lib/knowledge.generated.json", factory);
  const embed = vi.fn().mockResolvedValue(queryVec);
  vi.doMock("@/lib/gemini", () => ({ embedText: embed }));
  const mod = await import("@/lib/knowledge");
  return {
    retrieveKnowledge: mod.retrieveKnowledge,
    listKnowledgeSources: mod.listKnowledgeSources,
    embed,
  };
}

// Synthetic, already-normalized basis chunks.
const t1 = chunk("t1", [1, 0, 0], "text");
const p1 = chunk("p1", [0, 1, 0], "pdf");
// k1 deliberately has NO `kind` → must default to the "text" floor (0.6).
const k1 = chunk("k1", [0, 0, 1]);

describe("retrieveKnowledge — synthetic index (branch coverage)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./knowledge.generated.json");
    vi.doUnmock("@/lib/knowledge.generated.json");
    vi.doUnmock("@/lib/gemini");
  });

  it("returns [] and never calls embedText when the corpus is empty", async () => {
    const { retrieveKnowledge, embed } = await loadWith(
      makeIndex([]),
      [1, 0, 0],
    );

    const results = await retrieveKnowledge("q");

    expect(results).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("includes only chunks at/above their modality floor", async () => {
    // query [1,0,0]: t1 -> 1.0 (>=0.6 keep), p1 -> 0 (<0.5 drop),
    // k1 -> 0 (<0.6 drop).
    const { retrieveKnowledge } = await loadWith(
      makeIndex([t1, p1, k1]),
      [1, 0, 0],
    );

    const results = await retrieveKnowledge("q");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("t1");
    expect(results[0].score).toBeCloseTo(1, 10);
  });

  it("propagates source/title/text from the matched chunk", async () => {
    const { retrieveKnowledge } = await loadWith(makeIndex([t1]), [1, 0, 0]);

    const results = await retrieveKnowledge("q");

    expect(results[0]).toEqual({
      id: "t1",
      source: "t1-source",
      title: "t1-title",
      text: "t1-text",
      score: 1,
    });
  });

  it("passes the index's model and dimension through to embedText", async () => {
    const { retrieveKnowledge, embed } = await loadWith(
      makeIndex([t1]),
      [1, 0, 0],
    );

    await retrieveKnowledge("hello");

    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith("hello", "RETRIEVAL_QUERY", 3, "m");
  });

  it("admits a pdf chunk that the (higher) text floor would reject", async () => {
    // query [0.55, 0.55, 0]: t1 -> 0.55 (text floor 0.6 -> DROP),
    // p1 -> 0.55 (pdf floor 0.5 -> KEEP), k1 -> 0 (DROP).
    // Same raw score 0.55, yet only the pdf chunk survives.
    const { retrieveKnowledge } = await loadWith(
      makeIndex([t1, p1, k1]),
      [0.55, 0.55, 0],
    );

    const results = await retrieveKnowledge("q");

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("p1");
    expect(results[0].score).toBeCloseTo(0.55, 10);
  });

  it("keeps a missing-kind chunk only when it clears the text floor", async () => {
    // query [0,0,1]: k1 -> 1.0 (>=0.6 default-text floor -> KEEP).
    const above = await loadWith(makeIndex([t1, p1, k1]), [0, 0, 1]);
    const keep = await above.retrieveKnowledge("q");
    expect(keep).toHaveLength(1);
    expect(keep[0].id).toBe("k1");
  });

  it("drops a missing-kind chunk that clears the pdf floor but not the text floor", async () => {
    // query [0,0,0.5]: k1 -> 0.5. >= pdf floor (0.5) but < text floor (0.6).
    // Proves a missing kind uses the TEXT floor, not pdf.
    const { retrieveKnowledge } = await loadWith(makeIndex([k1]), [0, 0, 0.5]);

    const results = await retrieveKnowledge("q");

    expect(results).toEqual([]);
  });

  it("returns matches best-first (descending score)", async () => {
    // query [0.9, 0.7, 0.65]: t1 -> 0.9, p1 -> 0.7, k1 -> 0.65, all above
    // their floors. Expect strictly descending order.
    const { retrieveKnowledge } = await loadWith(
      makeIndex([k1, p1, t1]),
      [0.9, 0.7, 0.65],
    );

    const results = await retrieveKnowledge("q");

    expect(results.map((r) => r.id)).toEqual(["t1", "p1", "k1"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });

  it("truncates to topK after sorting (keeps the strongest matches)", async () => {
    const { retrieveKnowledge } = await loadWith(
      makeIndex([k1, p1, t1]),
      [0.9, 0.7, 0.65],
    );

    const results = await retrieveKnowledge("q", 2);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(["t1", "p1"]);
  });

  it("returns [] when every chunk scores below its floor", async () => {
    // Orthogonal-ish query: every dot product is 0.
    const { retrieveKnowledge } = await loadWith(
      makeIndex([t1, p1, k1]),
      [0, 0, 0],
    );

    const results = await retrieveKnowledge("q");

    expect(results).toEqual([]);
  });

  it("scores via dot product over the overlapping dimensions only", async () => {
    // dot() walks min(len) dims; extra query dims are ignored. A 4-dim query
    // still matches the 3-dim t1 vector on its first component.
    const { retrieveKnowledge } = await loadWith(
      makeIndex([t1]),
      [1, 0, 0, 999],
    );

    const results = await retrieveKnowledge("q");

    expect(results).toHaveLength(1);
    expect(results[0].score).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// listKnowledgeSources — the /chat "what can the AI reference" disclosure.
// ---------------------------------------------------------------------------
describe("listKnowledgeSources — real index", () => {
  it.skipIf(index.chunks.length === 0)(
    "lists each disclosed source exactly once, with a title",
    async () => {
      const { listKnowledgeSources } = await import("@/lib/knowledge");

      const sources = listKnowledgeSources();

      const expected = new Set(
        index.chunks
          .map((chunk) => chunk.source)
          .filter((source) => source !== "instructions"),
      );
      expect(new Set(sources.map((s) => s.source))).toEqual(expected);
      expect(sources.map((s) => s.source)).toHaveLength(expected.size);
      for (const source of sources) {
        expect(source.title).toEqual(expect.any(String));
        expect(source.title).not.toBe("");
      }
    },
  );

  it.skipIf(index.chunks.length === 0)(
    "flags exactly the sources whose chunks carry a context note",
    async () => {
      const { listKnowledgeSources } = await import("@/lib/knowledge");

      const sources = listKnowledgeSources();

      const withContext = new Set(
        index.chunks
          .filter((chunk) => chunk.context !== undefined)
          .map((chunk) => chunk.source),
      );
      for (const source of sources) {
        expect(source.isReference).toBe(withContext.has(source.source));
      }
    },
  );
});

describe("listKnowledgeSources — synthetic index", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./knowledge.generated.json");
    vi.doUnmock("@/lib/knowledge.generated.json");
    vi.doUnmock("@/lib/gemini");
  });

  it("returns [] for an empty corpus without calling embedText", async () => {
    const { listKnowledgeSources, embed } = await loadWith(
      makeIndex([]),
      [1, 0, 0],
    );

    expect(listKnowledgeSources()).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("dedupes chunks by source, keeping corpus order and the first title", async () => {
    const docA1 = { ...chunk("a1", [1, 0, 0]), source: "doc-a" };
    const docA2 = {
      ...chunk("a2", [0, 1, 0]),
      source: "doc-a",
      title: "a2-later-title",
    };
    const docB = { ...chunk("b1", [0, 0, 1]), source: "doc-b" };
    const { listKnowledgeSources } = await loadWith(
      makeIndex([docA1, docA2, docB]),
      [1, 0, 0],
    );

    expect(listKnowledgeSources()).toEqual([
      { source: "doc-a", title: "a1-title", isReference: false },
      { source: "doc-b", title: "b1-title", isReference: false },
    ]);
  });

  it("marks a source as reference material when its chunk has a context note", async () => {
    const plain = chunk("plain", [1, 0, 0]);
    const noted = { ...chunk("noted", [0, 1, 0]), context: "昨年度の資料" };
    const { listKnowledgeSources } = await loadWith(
      makeIndex([plain, noted]),
      [1, 0, 0],
    );

    expect(listKnowledgeSources()).toEqual([
      { source: "plain-source", title: "plain-title", isReference: false },
      { source: "noted-source", title: "noted-title", isReference: true },
    ]);
  });

  it("hides behavioral documents (the instructions source)", async () => {
    const hidden = { ...chunk("h1", [1, 0, 0]), source: "instructions" };
    const visible = chunk("v1", [0, 1, 0]);
    const { listKnowledgeSources } = await loadWith(
      makeIndex([hidden, visible]),
      [1, 0, 0],
    );

    expect(listKnowledgeSources().map((s) => s.source)).toEqual(["v1-source"]);
  });
});
