import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RequestClaimOtpDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  beneficiary_contact_id!: string;
}
