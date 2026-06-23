import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RequestClaimOtpDto {
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  beneficiary_contact_id!: string;
}
