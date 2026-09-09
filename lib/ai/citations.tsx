import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { sourceHref } from "./source-links";

export type CitationSource = {
  id: string;
  kind: string;
  title: string;
  date: string;
  excerpt: string;
  href?: string;
};

/**
 * Render model citations as links only when the API href matches its safe,
 * current-workspace route for the cited source.
 */
export function renderAnswerWithCitations(answer: string, sources: CitationSource[], clientId: string): ReactNode {
  const parts: ReactNode[] = [];
  const citationPattern = /\[(\d+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(answer)) !== null) {
    if (match.index > cursor) parts.push(answer.slice(cursor, match.index));

    const sourceIndex = Number(match[1]) - 1;
    const source = sources[sourceIndex];
    const expectedHref = source && sourceHref(clientId, source.kind, source.id);
    const safeHref = source?.href && expectedHref === source.href ? source.href : undefined;
    parts.push(safeHref ? <Link key={`citation-${match.index}`} href={safeHref}>{match[0]}</Link> : match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < answer.length) parts.push(answer.slice(cursor));
  return <Fragment>{parts}</Fragment>;
}
