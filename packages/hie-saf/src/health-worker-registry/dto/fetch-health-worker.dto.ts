import { IsNotEmpty, IsString } from 'class-validator';
import { Regulators } from '../types';

export class FetchHealthWorkerDto {
  @IsNotEmpty()
  @IsString()
  regulator!: Regulators;

  @IsNotEmpty()
  @IsString()
  identifierType!: string;

  @IsNotEmpty()
  @IsString()
  identifierNumber!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
