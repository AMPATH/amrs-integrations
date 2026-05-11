import { Injectable } from '@nestjs/common';
import { FacilityIdentificationTypesMap } from '../types';

@Injectable()
export class FacilityIdentifierTypeHelper {
  constructor() {}
  public getIdentifierByFilterType(fillerType: string): string | null {
    if (FacilityIdentificationTypesMap[fillerType]) {
      return FacilityIdentificationTypesMap[fillerType];
    } else {
      return null;
    }
  }
}
