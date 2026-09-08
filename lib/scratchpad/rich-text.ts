const ALLOWED_TAGS = new Set(["strong", "b", "u", "em", "br", "p", "div", "ul", "ol", "li"]);

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

function decodeText(value: string): string {
  let decoded = value;
  // Collapse already-escaped values from previous save/load cycles as well.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decoded.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, named) => {
      if (decimal) {
        const codePoint = Number(decimal);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return HTML_ENTITIES[named.toLowerCase()] ?? entity;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

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
    if (!token.startsWith("<")) return escapeText(decodeText(token));
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
