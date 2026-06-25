import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class ClaimsOtpDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  beneficiary_contact_id!: string;
}
