import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveClaimLineRequestDto {
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @IsNotEmpty()
  @IsString()
  lineGuid!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
