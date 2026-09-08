const ALLOWED_TAGS = new Set(["strong", "b", "u", "em", "br", "p", "div", "ul", "ol", "li"]);

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Serialize only the small formatting vocabulary used by the scratch pad. */
export function sanitizeRichText(input: string): string {
  const withoutDangerousBlocks = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*\/?>/gi, "");
  return withoutDangerousBlocks.replace(/<[^>]*>|[^<]+/g, token => {
    if (!token.startsWith("<")) return escapeText(token);
    const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)(?:\s[^>]*)?\s*(\/?)>$/i);
    if (!match || !ALLOWED_TAGS.has(match[2].toLowerCase())) return "";
    const tag = match[2].toLowerCase();
    if (tag === "br") return "<br>";
    return `<${match[1]}${tag}>`;
  });
}

export function plainTextToRichText(input: string): string {
  return sanitizeRichText(input).replace(/\r?\n/g, "<br>");
}
