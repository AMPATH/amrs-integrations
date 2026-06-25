import { IsNotEmpty, IsString } from 'class-validator';

export class RestoreInterventionsRequestDto {
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
