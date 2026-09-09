"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { renderAnswerWithCitations } from "@/lib/ai/citations";

type Source = { id: string; kind: string; title: string; date: string; excerpt: string; href?: string };
type AssistantMessage = { role: "assistant"; content: string; sources: Source[]; limitation?: string };
type ConversationMessage = { role: "user"; content: string } | AssistantMessage;
type Result = { answer: string; sources: Source[]; limitation?: string; error?: string };

export function AskAIAssistant({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) questionRef.current?.focus();
  }, [open]);

  function newChat() {
    if (busy) return;
    setMessages([]);
    setQuestion("");
    setError("");
    questionRef.current?.focus();
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || busy) return;

    const priorConversation = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: "user", content: trimmedQuestion }]);
    setQuestion("");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion, conversation: priorConversation }),
      });
      const data = await response.json() as Result;
      if (!response.ok) throw new Error(data.error || "FlowCoach could not answer that question.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer, sources: data.sources, limitation: data.limitation }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "FlowCoach could not answer that question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-ai-assistant">
      {open && (
        <section className="ask-ai-panel" aria-labelledby="ask-ai-title">
          <div className="ask-ai-panel-header">
            <div className="flowcoach-heading">
              <Image src="/flowstate-mark.svg" alt="" aria-hidden="true" className="flowcoach-mark flowcoach-panel-mark" width={32} height={32} />
              <div>
                <p className="workspace-eyebrow">Workspace assistant</p>
                <h2 id="ask-ai-title" className="ask-ai-title">FlowCoach</h2>
              </div>
            </div>
            <div className="ask-ai-header-actions">
              <button type="button" className="ask-ai-new-chat" onClick={newChat} disabled={busy}>New chat</button>
              <button type="button" className="ask-ai-close" onClick={() => setOpen(false)} aria-label="Close FlowCoach">×</button>
            </div>
          </div>
          <div className="ask-ai-thread" aria-live="polite" aria-label="FlowCoach conversation">
            {messages.length === 0 && <p className="ask-ai-empty">Ask FlowCoach about this workspace’s authorized records. Follow-up questions keep this chat’s recent context.</p>}
            {messages.map((message, index) => message.role === "user" ? (
              <div className="ask-ai-message ask-ai-user-message" key={`user-${index}`}><p className="workspace-eyebrow">You</p><p className="ask-ai-answer-text">{message.content}</p></div>
            ) : (
              <div className="ask-ai-message ask-ai-assistant-message" key={`assistant-${index}`}>
                <p className="workspace-eyebrow">Provisional answer</p><p className="ask-ai-answer-text">{renderAnswerWithCitations(message.content, message.sources, clientId)}</p>
                <div className="ask-ai-sources"><h3>Sources ({message.sources.length})</h3>{message.sources.length === 0 ? <p className="ask-ai-muted">No matching authorized workspace sources were found.</p> : message.sources.map((source) => <article key={source.id} className="ask-ai-source-card"><div className="ask-ai-source-heading"><strong>{source.href ? <Link href={source.href}>{source.title}</Link> : source.title}</strong><span>{source.kind} · {new Date(source.date).toLocaleDateString()}</span></div><p>{source.excerpt}</p></article>)}{message.limitation && <p className="ask-ai-muted ask-ai-limitation">{message.limitation}</p>}</div>
              </div>
            ))}
            {busy && <p className="ask-ai-muted" role="status">Searching authorized workspace sources…</p>}
          </div>
          <form onSubmit={ask} aria-label="Ask FlowCoach">
            <label htmlFor="ask-ai-question" className="sr-only">FlowCoach question</label>
            <textarea ref={questionRef} id="ask-ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} maxLength={1000} required placeholder="Ask FlowCoach about this workspace…" className="ask-ai-input" aria-label="FlowCoach question" />
            <div className="ask-ai-actions"><span className="ask-ai-hint">Read-only · human review required</span><button type="submit" className="flowstate-accent-button ask-ai-submit" disabled={busy || !question.trim()}>{busy ? "Searching…" : "Ask"}</button></div>
          </form>
          {error && <div role="alert" className="ask-ai-error">{error}</div>}
        </section>
      )}
      {!open && <button type="button" className="ask-ai-launcher" onClick={() => setOpen(true)} aria-label="Open FlowCoach" aria-expanded={open}><Image src="/flowstate-mark.svg" alt="" aria-hidden="true" className="flowcoach-mark" width={22} height={22} />FlowCoach</button>}
    </div>
  );
}
