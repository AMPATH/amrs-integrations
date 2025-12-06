import crypto from "crypto";
import { logger } from "./logger";

const algorithm = "aes-256-gcm";
const ENCRYPTION_KEY = process.env.HIE_ENCRYPTION_KEY || "";

const getEncryptionKey = (): Buffer => {
  const keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
  if (keyBuffer.length !== 32) {
    logger.warn(
      "ENCRYPTION_KEY should be 32 bytes (64 hex characters). Using padded key."
    );
    return Buffer.alloc(32, 0).fill(ENCRYPTION_KEY.slice(0, 32));
  }
  return keyBuffer;
};

export function encrypt(text: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${encrypted.toString(
      "hex"
    )}:${authTag.toString("hex")}`;
  } catch (error) {
    logger.error("Encryption failed:", error);
    throw new Error("Failed to encrypt password");
  }
}

export function decrypt(encryptedText: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, encryptedHex, authTagHex] = encryptedText.split(":");

    if (!ivHex || !encryptedHex || !authTagHex) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    logger.error("Decryption failed:", error);
    throw new Error("Failed to decrypt text");
  }
}
