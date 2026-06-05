import { IsNotEmpty, IsString } from 'class-validator';

export class BenefitsUtilizationDto {
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsNotEmpty()
  @IsString()
  intervention_code!: string;
}
