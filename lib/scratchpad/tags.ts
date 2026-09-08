export type InlineTags = { stakeholder?: string; domain?: string };
const DOMAINS = ["Operations", "Financial and Legal", "Finance", "People", "Technology and Data", "Technology", "Customers and Revenue", "Customers"];
function clean(value: string) { return value.trim().replace(/^[/#]+|[/#]+$/g, "").trim(); }
export function parseInlineTags(text: string): InlineTags {
  const slash = [...text.matchAll(/\/([^/]+)\//g)].map((m) => clean(m[1]));
  const hash = text.match(/#([^#]+?)(?=\s+#|$)/g)?.map((m) => clean(m)) ?? [];
  const hashDomain = text.match(/#(Operations|Financial and Legal|Finance|People|Technology and Data|Technology|Customers and Revenue|Customers)\b/i)?.[1];
  if (hashDomain) hash.push(hashDomain);
  const values = slash.length ? slash : hash;
  if (!values.length) return {};
  const domain = values.find((v) => DOMAINS.some((d) => d.toLowerCase() === v.toLowerCase()));
  const stakeholder = values.find((v) => v !== domain);
  return { ...(stakeholder ? { stakeholder } : {}), ...(domain ? { domain } : {}) };
}
export function mergeManualTags(manual: InlineTags, fallback: InlineTags): InlineTags { return { ...fallback, ...manual }; }
