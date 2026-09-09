export const MAX_CONVERSATION_MESSAGES = 12;
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CONVERSATION_CHARACTERS = 12000;

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConversationResult =
  | { ok: true; messages: ConversationMessage[] }
  | { ok: false; error: string };

export function parseConversation(value: unknown): ConversationResult {
  if (!Array.isArray(value)) return { ok: false, error: "conversation must be an array" };

  const messages: ConversationMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || !("role" in item) || !("content" in item)) {
      return { ok: false, error: "conversation contains an invalid message" };
    }
    const message = item as { role?: unknown; content?: unknown };
    if (message.role !== "user" && message.role !== "assistant") {
      return { ok: false, error: "conversation contains an invalid message" };
    }
    if (typeof message.content !== "string") {
      return { ok: false, error: "conversation contains an invalid message" };
    }
    const content = message.content.trim();
    if (!content) return { ok: false, error: "conversation contains an invalid message" };
    if (content.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "conversation message is too long" };
    messages.push({ role: message.role, content });
  }

  const bounded = messages.slice(-MAX_CONVERSATION_MESSAGES);
  let total = 0;
  const withinBudget: ConversationMessage[] = [];
  for (let index = bounded.length - 1; index >= 0; index -= 1) {
    const message = bounded[index];
    if (total + message.content.length > MAX_CONVERSATION_CHARACTERS) break;
    withinBudget.unshift(message);
    total += message.content.length;
  }
  return { ok: true, messages: withinBudget };
}
