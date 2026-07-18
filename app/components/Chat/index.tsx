"use client";

import { useEffect, useRef, useState } from "react";

import { CHAT_RESET_SIGNAL } from "@/lib/chat-protocol";
// Type-only import: erased at compile time, so it never pulls the
// server-only knowledge module into this client bundle.
import type { KnowledgeSource } from "@/lib/knowledge";

import styles from "./Chat.module.css";

type Message = {
  role: "user" | "model";
  text: string;
};

// Human-readable labels for the live-data tools in lib/chat-tools.ts. Keep in
// sync when a tool is added or removed there.
const LIVE_DATA_SOURCES = [
  "伝達事項（自分のクラス向けと全体向け）",
  "備品の在庫・貸出状況",
  "減点記録（自分のクラス分のみ）",
  "サイトのニュース",
];

const SUGGESTIONS = [
  "創作展はいつ開催されますか？",
  "体育祭の競技について教えて",
  "今の伝達事項を教えて",
];

async function readError(response: Response): Promise<string> {
  if (response.status === 429) {
    return "リクエストが多すぎます。少し待ってからお試しください。";
  }
  if (response.status === 401) {
    return "ログインが必要です。ログインし直してください。";
  }
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === "string") return data.error;
  } catch {
    // fall through
  }
  return "エラーが発生しました。時間をおいて再度お試しください。";
}

export function Chat({
  knowledgeSources,
}: {
  knowledgeSources: KnowledgeSource[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (trimmed === "" || isStreaming) return;

    setError(null);
    setInput("");
    const outgoing: Message[] = [...messages, { role: "user", text: trimmed }];
    // Show the user turn plus an empty assistant bubble that fills as it streams.
    setMessages([...outgoing, { role: "model", text: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: outgoing }),
      });

      if (!response.ok || response.body === null) {
        setMessages(outgoing); // drop the empty assistant bubble
        setError(await readError(response));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const appendDelta = (delta: string) => {
        if (delta === "") return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          // A RESET marker means the server is re-answering on another model
          // (the previous one failed mid-stream). Discard the partial shown so
          // far for this bubble and keep only what follows the marker. This
          // clears the ENTIRE bubble — including any visible preamble from an
          // earlier tool iteration — which is fine: the re-answer is
          // self-contained and prior turns remain in the model's own history.
          const text = delta.includes(CHAT_RESET_SIGNAL)
            ? delta.slice(
                delta.lastIndexOf(CHAT_RESET_SIGNAL) + CHAT_RESET_SIGNAL.length,
              )
            : last.text + delta;
          next[next.length - 1] = { ...last, text };
          return next;
        });
      };

      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          appendDelta(decoder.decode(result.value, { stream: true }));
        }
      }
      // Flush any bytes the streaming decoder buffered, e.g. a multi-byte UTF-8
      // character split across the final chunks (common with Japanese text).
      appendDelta(decoder.decode());
    } catch {
      setMessages(outgoing);
      setError("通信エラーが発生しました。接続を確認してお試しください。");
    } finally {
      setIsStreaming(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. Ignore Enter while an IME is
    // composing (e.g. confirming a Japanese conversion) so it doesn't submit
    // mid-composition.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>行事AIチャット</h1>
        <p className={styles.subtitle}>
          創作展・体育祭など2026年度の行事について質問できます。
        </p>
      </header>

      <div className={styles.messages} ref={scrollRef}>
        {isEmpty ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              行事について何でも聞いてください。
            </p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={styles.suggestion}
                  onClick={() => void send(suggestion)}
                  disabled={isStreaming}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={
                message.role === "user" ? styles.userRow : styles.modelRow
              }
            >
              <div
                className={
                  message.role === "user"
                    ? styles.userBubble
                    : styles.modelBubble
                }
              >
                {message.text === "" ? (
                  <span className={styles.typing}>…</span>
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <form className={styles.inputRow} onSubmit={onSubmit}>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="質問を入力…"
          rows={1}
          maxLength={4000}
          disabled={isStreaming}
        />
        <button
          className={styles.sendButton}
          type="submit"
          disabled={isStreaming || input.trim() === ""}
        >
          {isStreaming ? "…" : "送信"}
        </button>
      </form>
      <details open className={styles.notes}>
        <summary className={styles.noteSummary}>※注意事項</summary>
        <ul>
          <li>生成内容はAIによるものです。間違えることがあります。</li>
          <li>
            回答内容は各委員会の公式な回答ではありません。予めご了承ください。
          </li>
          <li>個人情報は絶対に入力しないでください。</li>
          <li>
            個人情報と思われるものが出てきたらIT委員会に連絡してください。
          </li>
        </ul>
      </details>
      <details className={styles.notes}>
        <summary className={styles.noteSummary}>AIが参照できる情報</summary>
        <div className={styles.sources}>
          {knowledgeSources.length > 0 && (
            <>
              <p className={styles.sourcesHeading}>資料</p>
              <ul>
                {knowledgeSources.map((source) => (
                  <li key={source.source}>
                    {source.title}
                    {source.isReference && "（昨年度の参考資料）"}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={styles.sourcesHeading}>サイト内の最新情報</p>
          <ul>
            {LIVE_DATA_SOURCES.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
