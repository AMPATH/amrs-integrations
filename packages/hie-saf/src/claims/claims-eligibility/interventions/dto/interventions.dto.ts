import { IsNotEmpty, IsString } from 'class-validator';

export class InterventionsDto {
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @IsNotEmpty()
  @IsString()
  sub_benefit_code!: string;
}
