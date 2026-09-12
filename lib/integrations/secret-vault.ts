import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for integration credentials at rest (SharePoint OAuth
 * tokens). AES-256-GCM so the ciphertext is authenticated: a tampered payload
 * fails to decrypt instead of silently returning wrong bytes.
 *
 * Payload format: `v1.<iv>.<authTag>.<ciphertext>` — all base64url.
 * The key is read from the environment by callers, never stored beside the
 * ciphertext, so a database dump alone does not expose customer tokens.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export function generateSecretKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

function resolveKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`integration secret key must decode to ${KEY_BYTES} bytes`);
  }
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): string {
  const key = resolveKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, keyBase64: string): string {
  if (!payload) throw new Error("encrypted secret payload is empty");
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("encrypted secret payload is malformed");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const key = resolveKey(keyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered ciphertext — both are auth-tag failures.
    throw new Error("encrypted secret could not be decrypted");
  }
}
