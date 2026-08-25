import { FormEvent, useEffect, useRef, useState } from "react";
import "./App.css";
import TryOn from "./TryOn";

type Source = {
  title: string;
  url?: string;
  snippet?: string;
};

type ResearchPayload = {
  answer: string;
  sources: Source[];
  recommendation: {
    domain: string;
    capability: string;
    recommendedRouteKey?: string;
    recommendedProvider?: string;
    canExecuteNow?: boolean;
  } | null;
  searchGated: boolean;
  searchNote?: string;
  creditsCharged: number;
  routes: string[];
  wallet?: { balanceCredits?: number };
  error?: string;
};

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; payload: ResearchPayload; error?: string };

type Tab = "research" | "tryon";

const SHORTCUTS = [
  "What is AgentRouter?",
  "EURUSD news today",
  "Summarize OpenRouter vs AgentRouter",
];

function creditsLabel(wallet: unknown): string {
  if (!wallet || typeof wallet !== "object") return "—";
  const rec = wallet as Record<string, unknown>;
  const n = rec.balanceCredits ?? rec.credits ?? rec.balance;
  return n == null ? "—" : String(n);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("research");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<unknown>(null);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [healthError, setHealthError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function refreshMeta() {
    try {
      const [healthRes, walletRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/wallet"),
      ]);
      const health = await healthRes.json();
      setKeyConfigured(Boolean(health.keyConfigured));
      if (walletRes.ok) {
        setWallet(await walletRes.json());
      }
    } catch {
      setHealthError("Backend is not running on port 3001.");
    }
  }

  useEffect(() => {
    void refreshMeta();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function submit(text: string) {
    const q = text.trim();
    if (!q || loading) return;

    setQuery("");
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: q },
    ]);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = (await res.json()) as ResearchPayload;
      if (!res.ok) {
        throw new Error(data.error || "Research failed");
      }
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", payload: data },
      ]);
      if (data.wallet) setWallet(data.wallet);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research failed";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          payload: {
            answer: message,
            sources: [],
            recommendation: null,
            searchGated: false,
            creditsCharged: 0,
            routes: [],
          },
          error: message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(query);
  }

  return (
    <div className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">AgentRouter</p>
          <h1>{tab === "tryon" ? "Virtual Try-On" : "Research Assistant"}</h1>
          <p className="subtitle">
            {tab === "tryon"
              ? "Upload your photo and a wearable. See how it looks on you."
              : "Search the web, then write an answer with sources."}
          </p>
          <nav className="tabs">
            <button
              type="button"
              className={tab === "research" ? "active" : ""}
              onClick={() => setTab("research")}
            >
              Research
            </button>
            <button
              type="button"
              className={tab === "tryon" ? "active" : ""}
              onClick={() => setTab("tryon")}
            >
              Try-On
            </button>
          </nav>
        </div>
        <div className="wallet">
          <span className="wallet-label">Credits</span>
          <strong className="wallet-value">{creditsLabel(wallet)}</strong>
        </div>
      </header>

      {!keyConfigured && (
        <div className="warn">
          Copy <code>backend/.env.example</code> to <code>backend/.env</code> and add your AgentRouter API key.
        </div>
      )}
      {healthError && <div className="warn">{healthError}</div>}

      {tab === "tryon" ? (
        <TryOn onWallet={setWallet} />
      ) : (
        <>
          <main className="messages">
            {messages.length === 0 && (
              <div className="empty">
                <p>Ask a research question. AgentRouter will recommend a search route, then summarize with a chat model.</p>
                <div className="shortcuts">
                  {SHORTCUTS.map((item) => (
                    <button key={item} type="button" onClick={() => void submit(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="row user">
                  <div className="bubble">{msg.text}</div>
                </div>
              ) : (
                <div key={msg.id} className="row assistant">
                  <div className={`bubble ${msg.error ? "error" : ""}`}>
                    <div>{msg.payload.answer}</div>
                    {msg.payload.searchNote && (
                      <p className="note">{msg.payload.searchNote}</p>
                    )}
                    {msg.payload.sources.length > 0 && (
                      <ol className="sources">
                        {msg.payload.sources.map((source) => (
                          <li key={source.url || source.title}>
                            {source.url ? (
                              <a href={source.url} target="_blank" rel="noreferrer">
                                {source.title}
                              </a>
                            ) : (
                              source.title
                            )}
                            {source.snippet ? ` — ${source.snippet}` : ""}
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="meta">
                      {msg.payload.routes[0] && <span>Route: {msg.payload.routes[0]}</span>}
                      <span>Credits used: {msg.payload.creditsCharged}</span>
                      {msg.payload.recommendation?.capability && (
                        <span>Capability: {msg.payload.recommendation.capability}</span>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="row assistant">
                <div className="bubble">Searching and writing an answer…</div>
              </div>
            )}
            <div ref={endRef} />
          </main>

          <form className="composer" onSubmit={onSubmit}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything to research…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(query);
                }
              }}
            />
            <button className="send" type="submit" disabled={loading || !query.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
