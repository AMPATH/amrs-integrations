import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PatientSubBenefitsDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;
}
