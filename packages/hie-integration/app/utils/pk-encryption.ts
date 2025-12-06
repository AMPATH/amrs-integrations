import { encrypt } from "./encryption.util";
import { pk } from "./pk-data";

export class PKEncryption {
  private pk: string = pk;
  constructor() {}
  public encryptText(): string {
    return encrypt(this.pk);
  }
}
