import { IsNotEmpty, IsString } from 'class-validator';

export class AddClaimLineRequestDto {
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @IsNotEmpty()
  @IsString()
  interventionCode!: string;

  @IsNotEmpty()
  @IsString()
  serviceName!: string;

  @IsNotEmpty()
  @IsString()
  serviceIdentifier!: string;

  @IsNotEmpty()
  @IsString()
  unitPrice!: string;

  @IsNotEmpty()
  @IsString()
  quantity!: string;

  @IsNotEmpty()
  @IsString()
  schemeCode!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
