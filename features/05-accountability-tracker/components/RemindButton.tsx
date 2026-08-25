"use client";

import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";

/**
 * Exec's manual trigger for the same job the weekly cron runs. Useful the first
 * week, and when someone asks "did they get reminded?" — the ledger means
 * pressing it twice cannot double-nag anyone.
 */
export function RemindButton() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/accountability/remind", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("done");
      setMessage(
        data.sent === 0
          ? "Nobody to remind — every project is either complete or already nudged this week."
          : `Sent ${data.sent} reminder${data.sent === 1 ? "" : "s"} across ${data.projects} project${
              data.projects === 1 ? "" : "s"
            }.`
      );
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not send reminders.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={state === "sending"}
        className="btn btn-gold text-xs px-4 py-2 flex items-center gap-2 disabled:opacity-60"
      >
        {state === "sending" ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
        Send reminders now
      </button>
      {message && (
        <p className={`text-xs ${state === "error" ? "text-red-600" : "text-[var(--muted)]"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
