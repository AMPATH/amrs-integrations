import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SwitchInterventionsRequestDto {
  @IsNotEmpty()
  @IsString()
  consentToken!: string;

  @IsNotEmpty()
  @IsString()
  existingInterventionCode!: string;

  @IsNotEmpty()
  @IsString()
  newInterventionCode!: string;

  @IsNotEmpty()
  @IsBoolean()
  retainBillItems!: boolean;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  billFrom!: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  billTo!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
