export function displayDocumentName(sourceRef: string | null | undefined): string {
  if (!sourceRef) return "Imported document";

  try {
    const url = new URL(sourceRef);
    const file = url.searchParams.get("file");
    if (file?.trim()) return file.trim();
  } catch {
    // Fall back to the path for non-URL source references.
  }

  const fallback = sourceRef.split("/").pop()?.split("?")[0]?.trim();
  return fallback ? decodeURIComponent(fallback) : "Imported document";
}
