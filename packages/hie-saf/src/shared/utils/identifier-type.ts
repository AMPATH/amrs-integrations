import { Injectable } from '@nestjs/common';
import { IdentificationTypesMap } from '../types';

@Injectable()
export class IdentifierTypeHelper {
  constructor() {}
  public getIdentifierTypeByNumber(
    identifierTypeNumber: string,
  ): string | null {
    if (IdentificationTypesMap[identifierTypeNumber]) {
      return IdentificationTypesMap[identifierTypeNumber];
    } else {
      return null;
    }
  }
}
