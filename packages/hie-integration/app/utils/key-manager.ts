import * as fs from "fs";

export function getPrivateKey(): string {
  const keyPath = process.env.HIE_PRIVATE_KEY;
  const privateKey: string = fs.readFileSync(keyPath ?? "", "utf8");
  return privateKey;
}
