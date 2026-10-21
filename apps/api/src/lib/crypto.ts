import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Unambiguous alphabet for codes people read aloud or type (no 0/O/1/I). */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCode(length = 8): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function randomDigits(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String(randomInt(10));
  return s;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256(secret: string, payload: string, encoding: "hex" | "base64" = "hex"): string {
  return createHmac("sha256", secret).update(payload).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM for connector credentials at rest. */
export function encrypt(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string, keyHex: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !enc) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
