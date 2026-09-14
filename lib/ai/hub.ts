export type WorkspaceSource = {
  id: string;
  kind: string;
  title: string;
  date: Date;
  text: string;
  /** Optional structured finding fields used for higher-quality retrieval. */
  domainName?: string | null;
  capabilityName?: string | null;
};

export type RankedWorkspaceSource = WorkspaceSource & { excerpt: string; score: number };

export type MeetingAgendaFields = {
  title: string;
  objectives: string | null;
  agendaItems: string[];
  desiredOutcome: string | null;
};

export function formatMeetingAgendaSource(meeting: MeetingAgendaFields): string {
  return [
    `Title: ${meeting.title}`,
    meeting.objectives?.trim() ? `Objectives: ${meeting.objectives.trim()}` : null,
    meeting.agendaItems.length > 0 ? `Agenda items: ${meeting.agendaItems.join("; ")}` : null,
    meeting.desiredOutcome?.trim() ? `Desired outcome: ${meeting.desiredOutcome.trim()}` : null,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

const STOP_WORDS = new Set(["a", "an", "and", "are", "for", "from", "how", "is", "of", "the", "to", "what", "where", "when", "with"]);

function terms(question: string): string[] {
  return [...new Set((question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((term) => !STOP_WORDS.has(term)))];
}

export function rankWorkspaceSources(question: string, sources: WorkspaceSource[], limit = 8): RankedWorkspaceSource[] {
  const queryTerms = terms(question);
  if (queryTerms.length === 0) return [];
  const normalQuestion = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  return sources
    .map((source) => {
      const haystack = `${source.kind} ${source.title} ${source.domainName ?? ""} ${source.capabilityName ?? ""} ${source.text}`.toLowerCase();
      const title = source.title.toLowerCase();
      const termHits = queryTerms.filter((term) => haystack.includes(term));
      const frequency = queryTerms.reduce((total, term) => total + (haystack.match(new RegExp(`\\b${term}\\b`, "g")) ?? []).length, 0);
      const phraseBoost = normalQuestion.length >= 5 && haystack.includes(normalQuestion) ? 12 : 0;
      const allTermsBoost = termHits.length === queryTerms.length ? 6 : 0;
      const score = phraseBoost + allTermsBoost + termHits.reduce((total, term) => total + (title.includes(term) ? 5 : 2), 0) + Math.min(frequency, 12);
      const firstMatch = queryTerms.find((term) => haystack.includes(term));
      const start = firstMatch ? Math.max(0, source.text.toLowerCase().indexOf(firstMatch) - 240) : 0;
      return { ...source, score, excerpt: source.text.slice(start, start + 900).trim() };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

export function formatWorkspaceContext(sources: RankedWorkspaceSource[]): string {
  return sources.map((source, index) => `[${index + 1}] ${source.kind}: ${source.title} (${source.date.toISOString().slice(0, 10)})\n${source.excerpt}`).join("\n\n");
}
