import { useRef, useState, type FormEvent } from "react";
import { Card } from "./ui";

interface Step {
  tool: string;
  ok: boolean;
  summary: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
  approvalUrl?: string;
}

const SUGGESTIONS = [
  "I need a dishwasher-safe handmade mug under $40 as a birthday gift. Deliver to Austin, TX 78701.",
  "A set of 4 food-safe clay chai cups for a Diwali party. ZIP 78701.",
  "Is there a vase that can hold fresh flowers? Ship to Dallas, TX 75201.",
];

export function ChittiTab() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setInput("");
    setError(undefined);
    setBusy(true);
    try {
      const res = await fetch("/api/chitti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-10).map(({ role, content: c }) => ({ role, content: c })),
        }),
      });
      const body = (await res.json()) as {
        reply?: string;
        steps?: Step[];
        approvalUrl?: string;
        message?: string;
      };
      if (!res.ok || !body.reply) {
        setError(body.message ?? "Chitti could not answer. Please try again.");
      } else {
        setTurns([
          ...next,
          {
            role: "assistant",
            content: body.reply,
            steps: body.steps,
            approvalUrl: body.approvalUrl,
          },
        ]);
      }
    } catch {
      setError("Could not reach Chitti. Please try again.");
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <div className="grid gap-6">
      <Card
        title="Shop with Chitti, an AI buyer agent"
        subtitle="Chitti uses the store's own MCP server, like any outside agent would. It searches, checks policies, builds a cart and hands you a PayPal link. You approve the payment; nothing is bought without you."
      >
        <div className="max-h-[480px] min-h-[200px] space-y-4 overflow-y-auto rounded-lg bg-clay-50 p-4">
          {turns.length === 0 && (
            <div className="space-y-2 text-sm text-stone-600">
              <p>Try one of these:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="block w-full rounded-lg border border-clay-100 bg-white p-3 text-left hover:border-clay-500"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-xl p-3 text-left text-sm ${
                  turn.role === "user" ? "bg-clay-500 text-white" : "bg-white shadow-sm"
                }`}
              >
                {turn.content}
              </div>
              {turn.steps && turn.steps.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                  {turn.steps.map((s, j) => (
                    <li key={j}>
                      <code>{s.tool}</code> → {s.summary}
                    </li>
                  ))}
                </ul>
              )}
              {turn.approvalUrl && (
                <a
                  href={turn.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-lg bg-[#0070ba] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Approve on PayPal (sandbox)
                </a>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-stone-500">Chitti is shopping…</p>}
          <div ref={endRef} />
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={600}
            placeholder="Tell Chitti what you need…"
            aria-label="Message to Chitti"
            className="flex-1 rounded-lg border border-clay-100 bg-white px-3 py-2 text-sm outline-none focus:border-clay-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-clay-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <p className="mt-3 text-xs text-stone-500">
          PayPal sandbox only: log in with the sandbox buyer account from the README. Chitti runs on
          free-tier AI models and is rate limited.
        </p>
      </Card>
    </div>
  );
}
