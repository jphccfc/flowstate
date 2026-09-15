const MAX_AGENT_ALIAS_LENGTH = 80;

export function normalizeAgentAlias(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function validateAgentAlias(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_AGENT_ALIAS_LENGTH && !/[<>]/.test(normalized);
}
