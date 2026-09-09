const SOURCE_ROUTES: Record<string, string> = {
  "meeting agenda": "meetings",
  document: "capture",
  data_room_file: "capture",
  note: "capture",
  email: "capture",
  transcript: "capture",
  "project record": "planning",
};

/** Build links only to known Flowstate pages in the current workspace. */
export function sourceHref(clientId: string, kind: string, sourceId: string): string | undefined {
  void sourceId;
  const route = SOURCE_ROUTES[kind];
  if (!route) return undefined;
  return `/clients/${encodeURIComponent(clientId)}/${route}`;
}
