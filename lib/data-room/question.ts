const dataRoomPhrase = /\bdata\s*room\b/i;
const progressTerms = /\b(?:progress|percent(?:age)?|requests?|received|reviewed|complete(?:d|ion)?)\b|%/i;

/**
 * Routes operational Data Room completion questions to the authorised
 * deterministic request-pack calculation rather than generic AI retrieval.
 */
export function isDataRoomProgressQuestion(question: string): boolean {
  return dataRoomPhrase.test(question) && progressTerms.test(question);
}
