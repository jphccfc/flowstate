export type WorkspaceSource = {
  id: string;
  kind: string;
  title: string;
  date: Date;
  text: string;
};

export type RankedWorkspaceSource = WorkspaceSource & { excerpt: string; score: number };

const STOP_WORDS = new Set(["a", "an", "and", "are", "for", "from", "how", "is", "of", "the", "to", "what", "where", "when", "with"]);

function terms(question: string): string[] {
  return [...new Set((question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((term) => !STOP_WORDS.has(term)))];
}

export function rankWorkspaceSources(question: string, sources: WorkspaceSource[], limit = 8): RankedWorkspaceSource[] {
  const queryTerms = terms(question);
  if (queryTerms.length === 0) return [];

  return sources
    .map((source) => {
      const haystack = `${source.title} ${source.text}`.toLowerCase();
      const score = queryTerms.reduce((total, term) => total + (haystack.includes(term) ? (source.title.toLowerCase().includes(term) ? 3 : 1) : 0), 0);
      const firstMatch = queryTerms.find((term) => haystack.includes(term));
      const start = firstMatch ? Math.max(0, source.text.toLowerCase().indexOf(firstMatch) - 180) : 0;
      return { ...source, score, excerpt: source.text.slice(start, start + 600).trim() };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score || b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}

export function formatWorkspaceContext(sources: RankedWorkspaceSource[]): string {
  return sources.map((source, index) => `[${index + 1}] ${source.kind}: ${source.title} (${source.date.toISOString().slice(0, 10)})\n${source.excerpt}`).join("\n\n");
}
