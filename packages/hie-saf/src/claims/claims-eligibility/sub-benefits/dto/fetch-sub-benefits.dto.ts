import { IsNotEmpty, IsString } from 'class-validator';

export class PatientSubBenefitsDto {
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
