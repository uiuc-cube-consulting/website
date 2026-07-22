"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";

type Msg = {
  role: "user" | "assistant";
  content: string;
  citations?: { id: string; title: string }[];
  mode?: string;
};

const STARTERS = [
  "How have we approached market sizing for hardware clients?",
  "Show past social media / brand marketing projects.",
  "What software or app development work have we done?",
  "Have we built any machine learning or data models?",
];

export function BrainChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Failed (${r.status})`);
      setMessages((m) => [...m, { role: "assistant", content: data.answer, citations: data.citations, mode: data.mode }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5 md:p-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-xl py-8 text-center">
            <h2 className="font-display text-xl font-bold text-[var(--bg-dark)]">Ask about CUBE’s past work</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Grounded in our past engagements. Try one of these:
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-4 py-3 text-left text-sm text-[var(--bg-dark)] hover:border-[var(--gold)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
                    : "border border-[var(--border)] bg-[var(--bg-cream)]/50 text-[var(--bg-dark)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-3 border-t border-[var(--border)] pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Sources</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[12px] text-[var(--muted)]">
                      {m.citations.map((c) => (
                        <li key={c.id}>{c.title}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {busy && <p className="text-sm text-[var(--muted)]">Thinking…</p>}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="flex items-center gap-2 border-t border-[var(--border)] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a topic, client, or approach…"
          aria-label="Ask CUBE Brain"
          className="flex-1 rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn btn-gold px-4 py-2.5 disabled:opacity-50" aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
