import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ServiceType } from '../types';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClaimVisitDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  intervention_codes!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  locationUuid!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  otp!: string;

  @ApiProperty()
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  auth_guid!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  patient_id!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  service_type!: ServiceType;
}
