import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ClaimsOtpDto {
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsNotEmpty()
  @IsString()
  beneficiary_contact_id!: string;
}
