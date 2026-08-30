export type InboundEmailPayload = {
  messageId?: unknown; from?: unknown; fromName?: unknown; subject?: unknown; text?: unknown;
  attachments?: unknown;
};
export type NormalizedInboundEmail = { messageId: string; senderEmail: string; senderName: string | null; subject: string; rawText: string; attachments: Array<{ filename: string; contentType: string; sizeBytes: number | null; sourceRef: string | null }> };

export function normalizeInboundEmail(payload: InboundEmailPayload): NormalizedInboundEmail {
  const senderEmail = typeof payload.from === "string" ? payload.from.trim().toLowerCase() : "";
  const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!senderEmail || !rawText) throw new Error("from and text are required");
  const attachments = Array.isArray(payload.attachments) ? payload.attachments.map((item) => {
    const a = item as Record<string, unknown>;
    return { filename: typeof a.filename === "string" && a.filename.trim() ? a.filename.trim() : "attachment", contentType: typeof a.contentType === "string" ? a.contentType : "application/octet-stream", sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null, sourceRef: typeof a.sourceRef === "string" ? a.sourceRef : null };
  }) : [];
  return { messageId: typeof payload.messageId === "string" && payload.messageId.trim() ? payload.messageId.trim() : `hash:${senderEmail}:${rawText}`, senderEmail, senderName: typeof payload.fromName === "string" && payload.fromName.trim() ? payload.fromName.trim() : null, subject: typeof payload.subject === "string" ? payload.subject.trim() : "", rawText, attachments };
}
