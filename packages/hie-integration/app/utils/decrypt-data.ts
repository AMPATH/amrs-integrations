/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as crypto from "crypto";
import { getPrivateKey } from "./key-manager";

function decryptWithRSA(privateKey: string, encryptedData: string): Buffer {
  const decryptedData = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(encryptedData, "base64")
  );

  return Buffer.from(decryptedData.toString(), "base64");
}

function decryptWithAES(
  encryptedData: string,
  aesKey: Buffer,
  iv: Buffer
): string {
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  let decrypted = decipher.update(Buffer.from(encryptedData, "base64"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// Main execution
export async function decryptData(
  combinedBase64: string,
  facilityCode: string
): Promise<any> {
  const productionPrivateKey = await getPrivateKey(facilityCode);
  // Decode and split the combined string
  const combinedString = Buffer.from(combinedBase64, "base64").toString("utf8");
  const [
    encryptedAesKey,
    encryptedIv,
    encryptedJsonData,
  ] = combinedString.split(":");

  // Decrypt AES key and IV using RSA private key
  const aesKey = decryptWithRSA(productionPrivateKey, encryptedAesKey);
  const iv = decryptWithRSA(productionPrivateKey, encryptedIv);

  // Decrypt the JSON payload
  const decryptedJsonData = decryptWithAES(encryptedJsonData, aesKey, iv);
  const data = JSON.parse(decryptedJsonData);
  return data;
}
