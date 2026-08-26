export function formatDisplayLabel(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.toLowerCase().split("_");
  return words.length > 0
    ? words[0][0].toUpperCase() + words[0].slice(1) + words.slice(1).map((word) => ` ${word}`).join("")
    : "";
}

export function displayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
