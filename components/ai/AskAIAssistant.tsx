"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Source = { id: string; kind: string; title: string; date: string; excerpt: string };
type Result = { answer: string; sources: Source[]; limitation?: string };

export function AskAIAssistant({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) questionRef.current?.focus();
  }, [open]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || busy) return;

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "AI Hub could not answer that question.");
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI Hub could not answer that question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-ai-assistant">
      {open && (
        <section className="ask-ai-panel" aria-labelledby="ask-ai-title">
          <div className="ask-ai-panel-header">
            <div>
              <p className="workspace-eyebrow">Workspace assistant</p>
              <h2 id="ask-ai-title" className="ask-ai-title">Ask AI</h2>
            </div>
            <button type="button" className="ask-ai-close" onClick={() => setOpen(false)} aria-label="Close Ask AI">×</button>
          </div>
          <form onSubmit={ask} aria-label="Ask AI Hub">
            <label htmlFor="ask-ai-question" className="sr-only">Ask AI Hub question</label>
            <textarea
              ref={questionRef}
              id="ask-ai-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              maxLength={1000}
              required
              placeholder="Ask about this workspace…"
              className="ask-ai-input"
              aria-label="Ask AI Hub question"
            />
            <div className="ask-ai-actions">
              <span className="ask-ai-hint">Read-only · human review required</span>
              <button type="submit" className="flowstate-accent-button ask-ai-submit" disabled={busy || !question.trim()}>{busy ? "Searching…" : "Ask"}</button>
            </div>
          </form>
          {error && <div role="alert" className="ask-ai-error">{error}</div>}
          {result && (
            <div className="ask-ai-results" aria-live="polite">
              <div className="ask-ai-answer"><p className="workspace-eyebrow">Provisional answer</p><p className="ask-ai-answer-text">{result.answer}</p></div>
              <div className="ask-ai-sources">
                <h3>Sources ({result.sources.length})</h3>
                {result.sources.length === 0 ? <p className="ask-ai-muted">No matching authorized workspace sources were found.</p> : result.sources.map((source) => (
                  <article key={source.id} className="ask-ai-source-card">
                    <div className="ask-ai-source-heading"><strong>{source.title}</strong><span>{source.kind} · {new Date(source.date).toLocaleDateString()}</span></div>
                    <p>{source.excerpt}</p>
                  </article>
                ))}
                {result.limitation && <p className="ask-ai-muted ask-ai-limitation">{result.limitation}</p>}
              </div>
            </div>
          )}
        </section>
      )}
      {!open && <button type="button" className="ask-ai-launcher" onClick={() => setOpen(true)} aria-label="Ask AI" aria-expanded={open}>Ask AI</button>}
    </div>
  );
}
