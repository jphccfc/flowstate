const SOURCE_ROUTES: Record<string, string> = {
  "meeting agenda": "meetings",
  document: "documents",
  data_room_file: "documents",
  note: "capture",
  email: "capture",
  transcript: "capture",
  "document finding": "findings",
  "project record": "planning",
};

/** Build links only to known Flowstate pages in the current workspace. */
export function sourceHref(clientId: string, kind: string, sourceId: string): string | undefined {
  void sourceId;
  const route = SOURCE_ROUTES[kind];
  if (!route) return undefined;
  if (route === "documents") return `/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(sourceId.replace(/^finding:/, ""))}`;
  return `/clients/${encodeURIComponent(clientId)}/${route}`;
}
