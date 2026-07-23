"use client";

import { useRef, useState } from "react";

interface Source {
  title: string;
  url: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

const STARTERS = [
  "What has Riley built with LLMs?",
  "Tell me about the Wedding Dossier",
  "What's Riley's ML infrastructure experience?",
  "Has Riley done any research?",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;

    setError(null);
    setBusy(true);
    setInput("");

    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Only role/content go to the API; keep the last 10 turns.
          messages: history.slice(-10).map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `Request failed (${res.status})`);
      }

      const sources: Source[] = JSON.parse(
        decodeURIComponent(res.headers.get("X-Sources") ?? "%5B%5D"),
      );

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: answer, sources }]);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch (err) {
      setMessages(history); // drop the empty assistant bubble
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 text-zinc-100">
      <main className="flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ask about Riley Greiff&apos;s work
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            A RAG assistant grounded in Riley&apos;s GitHub projects and resume.
            Answers cite their sources.
          </p>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm"
                    : "max-w-[95%] rounded-2xl rounded-bl-sm bg-zinc-900 px-4 py-2.5 text-sm leading-relaxed"
                }
              >
                <p className="whitespace-pre-wrap">
                  {m.content || (busy && i === messages.length - 1 ? "…" : m.content)}
                </p>
                {m.sources && m.sources.length > 0 && m.content && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-2">
                    {m.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                      >
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What did Riley find in the KV-cache research?"
            maxLength={2000}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-600"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
        </form>
      </main>
    </div>
  );
}
