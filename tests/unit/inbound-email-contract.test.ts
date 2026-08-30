import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = process.cwd();
import { normalizeInboundEmail } from "../../lib/ingestion/inbound-email";

describe("provider-neutral inbound email contract", () => {
  it("routes by generated address, authenticates without storing the token, and preserves quarantine", () => {
    const route = readFileSync(resolve(root, "app/api/inbound/email/[addressKey]/route.ts"), "utf8");
    const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
    expect(route).toContain("timingSafeEqual"); expect(route).toContain("organizationId: endpoint.organizationId"); expect(route).toContain("Unknown sender"); expect(route).toContain("idempotencyKey");
    expect(schema).toContain("model InboundEmailEndpoint"); expect(schema).toContain("model CapturedInputAttachment"); expect(schema).toContain("QUARANTINED");
  });
  it("normalizes sender, subject, body, source message id and attachment metadata", () => {
    expect(normalizeInboundEmail({
      messageId: "provider-123", from: " Alice@Example.COM ", fromName: "Alice", subject: "  Weekly update ", text: "The body",
      attachments: [{ filename: "plan.pdf", contentType: "application/pdf", sizeBytes: 42, sourceRef: "https://blob.test/plan.pdf" }],
    })).toEqual({ messageId: "provider-123", senderEmail: "alice@example.com", senderName: "Alice", subject: "Weekly update", rawText: "The body", attachments: [{ filename: "plan.pdf", contentType: "application/pdf", sizeBytes: 42, sourceRef: "https://blob.test/plan.pdf" }] });
  });
  it("rejects missing sender and body", () => { expect(() => normalizeInboundEmail({ messageId: "x", from: "", text: "" })).toThrow("from and text are required"); });
});
