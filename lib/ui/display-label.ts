export function formatDisplayLabel(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.toLowerCase().split("_");
  return words.map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");
}

export function displayLabel(value: string | null | undefined): string {
  return formatDisplayLabel(value) || "—";
}

export function displayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
