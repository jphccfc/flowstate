export function displayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
